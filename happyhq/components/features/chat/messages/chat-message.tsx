'use client'

import { useState } from 'react'

import { useAnimatedText } from '@/hooks/use-animated-text'
import type { ChatMessage } from '@/lib/chat/types'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FilePill } from './file-pill'
import { MessageActions } from './message-actions'
import { SubagentActivityIndicator } from './subagent-activity-indicator'
import { ThinkingIndicator } from './thinking-indicator'
import { ToolProgressIndicator } from './tool-progress-indicator'
import { WritingPreviewCard } from './writing-preview'

interface ChatMessageProps {
  message: ChatMessage
}

export function ChatMessageComponent({ message }: ChatMessageProps) {
  const wrapper = message.isHistorical ? '' : 'animate-fade-in'

  if (message.role === 'user') {
    return (
      <div className={wrapper}>
        <UserMessage message={message} />
      </div>
    )
  }
  return (
    <div className={wrapper}>
      <AssistantMessage message={message} />
    </div>
  )
}

const VISIBLE_FILE_PILL_LIMIT = 3

function UserMessage({ message }: { message: ChatMessage }) {
  const hasFiles = message.files && message.files.length > 0
  const hasContent = message.content.length > 0
  const isLong = message.content.length > 300
  const [expanded, setExpanded] = useState(false)
  const [pillsExpanded, setPillsExpanded] = useState(false)

  const fileCount = message.files?.length ?? 0
  const pillsOverflow = fileCount > VISIBLE_FILE_PILL_LIMIT
  const visibleFiles =
    pillsOverflow && !pillsExpanded
      ? message.files!.slice(0, VISIBLE_FILE_PILL_LIMIT)
      : (message.files ?? [])

  return (
    <div className="flex flex-col gap-1">
      {/* File pills */}
      {hasFiles && (
        <div className="flex max-w-[85%] flex-wrap items-center justify-start gap-1.5">
          {visibleFiles.map((filename) => (
            <FilePill key={filename} filename={filename} />
          ))}
          {pillsOverflow && (
            <button
              type="button"
              onClick={() => setPillsExpanded((prev) => !prev)}
              className="text-muted-foreground/80 hover:text-muted-foreground cursor-pointer rounded-xl bg-white px-2.5 py-2 text-xs ring-1 ring-zinc-950/5 transition-colors"
            >
              {pillsExpanded
                ? 'Show fewer'
                : `+${fileCount - VISIBLE_FILE_PILL_LIMIT} more`}
            </button>
          )}
        </div>
      )}

      {/* Text bubble — only render if there's actual text content */}
      {hasContent && (
        <div className="group relative rounded-lg bg-zinc-100 px-3 py-1.5 ring-1 ring-zinc-950/8">
          <div
            className={
              isLong && !expanded
                ? 'relative max-h-[200px] overflow-hidden'
                : ''
            }
          >
            <p className="text-foreground text-[15px] leading-relaxed whitespace-pre-wrap">
              {message.content}
            </p>
            {isLong && !expanded && (
              <div
                className="pointer-events-none absolute right-0 bottom-0 left-0 h-12 bg-linear-to-t from-zinc-100 to-transparent"
                aria-hidden="true"
              />
            )}
          </div>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-muted-foreground/80 hover:text-muted-foreground mt-1 cursor-pointer text-xs transition-colors"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
          <div className="absolute right-2 bottom-0 translate-y-1/2">
            <MessageActions message={message} />
          </div>
        </div>
      )}
    </div>
  )
}

function AssistantMessage({ message }: { message: ChatMessage }) {
  const animatedContent = useAnimatedText(
    message.content,
    !!message.isStreaming,
  )
  const hasToolProgress =
    message.toolProgress && message.toolProgress.length > 0
  const hasThinking =
    message.thinkingBlocks && message.thinkingBlocks.length > 0

  return (
    <div className="relative space-y-3 px-0.5">
      {hasThinking && (
        <ThinkingIndicator
          blocks={message.thinkingBlocks!}
          isStreaming={message.isStreaming}
        />
      )}

      {message.content ? (
        <div className="prose-chat-code prose prose-headings:font-semibold prose-strong:font-semibold prose-p:m-[0.25rem_0_0.5rem_0] prose-p:leading-[1.7] prose-ul:pl-6 prose-ol:pl-6 prose-li:my-1 prose-li:marker:text-zinc-500 max-w-none text-[15px] text-zinc-900 [&_li_p]:my-1">
          <Markdown remarkPlugins={[remarkGfm]}>{animatedContent}</Markdown>
        </div>
      ) : null}

      {hasToolProgress && (
        <ToolProgressIndicator
          steps={message.toolProgress!}
          toolCalls={message.toolCalls}
          isStreaming={message.isStreaming}
        />
      )}

      {!!message.subagentActivities?.length && (
        <SubagentActivityIndicator activities={message.subagentActivities} />
      )}

      {(message.writingPreview?.text ||
        message.writingPreview?.filePreview ||
        !!message.writingPreview?.subagentToolProgress?.length) && (
        <WritingPreviewCard preview={message.writingPreview!} />
      )}
    </div>
  )
}
