'use client'

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/common/catalyst/dropdown'
import { useChatActions } from '@/components/features/desktop/hooks/use-chat-actions'
import {
  useChatMessages,
  useChatMode,
  useChatName,
  useChatSessionIdRef,
  useChatStreamSlugForMode,
  useClearDraft,
  useDraftFiles,
  useDraftText,
  useIsStreaming,
  usePendingConfirmation,
  usePendingQuestion,
  useSetChatMode,
  useSetDraftFiles,
  useSetDraftText,
  useStoppedByUser,
} from '@/components/features/desktop/providers/chat-session-provider'
import { useStickToBottom } from '@/hooks/use-stick-to-bottom'
import { deleteChat } from '@/lib/actions'
import type { ChatItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { allChatsKey } from '@/lib/swr-keys'
import { useDesktopStore, useStreamSlug } from '@/stores/desktopStore'
import { useStreams } from '@/stores/streamsStore'
import {
  ArrowLeft,
  Bug,
  Ellipsis,
  MessageCirclePlus,
  Trash2,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef } from 'react'
import useSWR from 'swr'
import { ChatSelectorDropdown } from './chat-selector-dropdown'
import { Composer } from './composer'
import { ComposerModeToggle } from './composer-mode-toggle'
import { AskUserConfirmation } from './interaction/ask-user-confirmation'
import { QuestionOptions } from './interaction/question-options'
import { StreamContextSelector } from './list/home-composer/stream-context-selector'
import { ChatMessageList } from './messages/chat-message-list'
import { WorkingIndicator } from './messages/working-indicator'

const EMPTY_CHATS: ChatItem[] = []

export function ChatPageContent({
  sessionId,
  originStreamSlug,
}: {
  sessionId: string
  originStreamSlug?: string | null
}) {
  const messages = useChatMessages()
  const isStreaming = useIsStreaming()
  const stoppedByUser = useStoppedByUser()
  const chatName = useChatName()
  const pendingQuestion = usePendingQuestion()
  const pendingConfirmation = usePendingConfirmation()
  const actions = useChatActions()
  const streamSlug = useStreamSlug()
  const streams = useStreams()
  const draftText = useDraftText()
  const draftFiles = useDraftFiles()
  const setDraftText = useSetDraftText()
  const setDraftFiles = useSetDraftFiles()
  const clearDraft = useClearDraft()
  const mode = useChatMode()
  const streamSlugForMode = useChatStreamSlugForMode()
  const setChatMode = useSetChatMode()
  const sessionIdRef = useChatSessionIdRef()
  const { data: chats = EMPTY_CHATS, mutate: mutateChats } = useSWR<ChatItem[]>(
    allChatsKey(),
    fetcher,
  )
  const router = useRouter()
  const { scrollRef, contentRef, scrollToBottom } = useStickToBottom()
  const hasMessages = messages.length > 0
  const prevHadMessages = useRef(false)

  const handleSend = useCallback(
    (message: string, files?: File[]) => {
      clearDraft()
      actions.send(message, files)
    },
    [actions, clearDraft],
  )

  const effectiveStreamSlug = streamSlugForMode || streamSlug || null

  const handleModeChange = useCallback(
    (newMode: 'general' | 'learning') => {
      const modeStream = effectiveStreamSlug ?? undefined
      setChatMode(newMode, modeStream)

      const sid = sessionIdRef.current
      if (sid) {
        fetch('/api/chat/mode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            streamSlug: streamSlug || undefined,
            sessionId: sid,
            mode: newMode,
            modeStreamSlug: modeStream,
          }),
        }).catch(() => {})
      }
    },
    [setChatMode, sessionIdRef, streamSlug, effectiveStreamSlug],
  )

  const handleStreamSelect = useCallback(
    (slug: string | null) => {
      // '' means explicit "no stream"; null means "no override" in desktopStore
      useDesktopStore.getState().setSelectedStream(slug ?? '')

      const sid = sessionIdRef.current
      if (sid) {
        fetch('/api/chat/stream-select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originStreamSlug: originStreamSlug || undefined,
            sessionId: sid,
            selectedStreamSlug: slug,
          }),
        }).catch(() => {})
      }
    },
    [sessionIdRef, originStreamSlug],
  )

  useEffect(() => {
    if (hasMessages && !prevHadMessages.current) {
      scrollToBottom('instant')
    }
    prevHadMessages.current = hasMessages
  }, [hasMessages, scrollToBottom])

  return (
    <div className="flex h-svh flex-col">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-2.5">
        <button
          onClick={() => router.push('/chat')}
          className="flex h-7 w-7 items-center justify-center rounded-md text-black/60 transition-colors hover:bg-black/5"
          aria-label="Back to chats"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <div className="-ml-1.5">
            <ChatSelectorDropdown
              chats={chats.map((c) => ({
                sessionId: c.sessionId,
                label: c.title ?? 'Untitled chat',
              }))}
              currentSessionId={sessionId}
              label={chatName || 'New Chat'}
              onSelect={(id) => router.push(`/chat/${id}`)}
              onDelete={(id) => {
                const isActive = id === sessionIdRef.current
                deleteChat(id).then(() => {
                  mutateChats(
                    (prev) => prev?.filter((c) => c.sessionId !== id),
                    { revalidate: false },
                  )
                  if (isActive) {
                    router.push('/chat')
                  }
                })
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Dropdown>
            <DropdownButton
              as="button"
              className="flex h-7 w-7 items-center justify-center rounded-md text-black/60 transition-colors hover:bg-black/5"
              aria-label="Chat options"
            >
              <Ellipsis className="h-4 w-4" />
            </DropdownButton>
            <DropdownMenu anchor="bottom end" className="z-1010">
              <DropdownItem onClick={actions.exportDebug}>
                <Bug data-slot="icon" />
                <DropdownLabel>Bug Report</DropdownLabel>
              </DropdownItem>
              <DropdownItem onClick={actions.deleteChat}>
                <Trash2 data-slot="icon" />
                <DropdownLabel>Delete chat</DropdownLabel>
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
          <button
            onClick={() => router.push('/chat')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-black/60 transition-colors hover:bg-black/5"
            aria-label="New chat"
          >
            <MessageCirclePlus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        data-chat-surface="page"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto"
      >
        <div ref={contentRef} className="mx-auto w-full max-w-3xl px-4 py-6">
          {hasMessages && (
            <div className="w-full space-y-3">
              <ChatMessageList messages={messages} />
              {isStreaming &&
                !pendingQuestion &&
                !pendingConfirmation &&
                !messages.some(
                  (m) =>
                    m.isStreaming &&
                    m.toolCalls?.some((tc) => tc.name === 'CreateTask'),
                ) && (
                  <div className="pt-1">
                    <WorkingIndicator />
                  </div>
                )}
            </div>
          )}
          {stoppedByUser && !isStreaming && hasMessages && (
            <p className="text-muted-foreground/60 py-2 text-center text-xs">
              You stopped the chat
            </p>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="relative mx-auto w-full max-w-3xl shrink-0 px-4 pb-7">
        {pendingConfirmation ? (
          <AskUserConfirmation
            toolName={pendingConfirmation.toolName}
            input={pendingConfirmation.input}
            onAllow={actions.allowConfirmation}
            onDeny={actions.denyConfirmation}
          />
        ) : pendingQuestion ? (
          <QuestionOptions
            questions={pendingQuestion.questions}
            onAnswer={actions.answerQuestion}
            onCancel={actions.cancelQuestion}
          />
        ) : (
          <Composer
            onSubmit={handleSend}
            disabled={isStreaming}
            placeholder={
              isStreaming
                ? 'Q is working...'
                : hasMessages
                  ? 'Reply...'
                  : 'Teach Q about your work...'
            }
            showStop={isStreaming && !pendingQuestion}
            onStop={actions.stop}
            autoFocus
            value={draftText}
            onValueChange={setDraftText}
            stagedFiles={draftFiles}
            onStagedFilesChange={setDraftFiles}
            actions={
              <StreamContextSelector
                streams={streams}
                selectedStream={streamSlug || null}
                onSelect={handleStreamSelect}
                disabled={isStreaming}
              />
            }
            rightActions={
              <ComposerModeToggle
                mode={mode}
                onModeChange={handleModeChange}
                disabled={isStreaming}
              />
            }
          />
        )}
        <p className="text-muted-foreground/75 absolute inset-x-0 bottom-1.5 text-center text-[11px]">
          Q is AI and can make mistakes. Please check responses.
        </p>
      </div>
    </div>
  )
}
