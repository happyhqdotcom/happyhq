'use client'

import { useChatActions } from '@/components/features/desktop/hooks/use-chat-actions'
import {
  useChatMessages,
  useChatMode,
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
import type { ChatMessage, ToolCall } from '@/lib/chat/types'
import { useStreamSlug } from '@/stores/desktopStore'
import { useCallback, useEffect, useRef } from 'react'
import { Composer } from './composer'
import { ComposerModeToggle } from './composer-mode-toggle'
import { AskUserConfirmation } from './interaction/ask-user-confirmation'
import { QuestionOptions } from './interaction/question-options'
import { ChatMessageList } from './messages/chat-message-list'
import { WorkingIndicator } from './messages/working-indicator'

// ── Props ──────────────────────────────────────────────────────────────

export interface ChatContentProps {
  // Render
  renderCreateTask?: (tc: ToolCall, msg: ChatMessage) => React.ReactNode

  // Mode-specific customization
  emptyState?: React.ReactNode
  composerProps?: {
    compact?: boolean
    autoFocus?: boolean
    placeholder?: string
    actions?: React.ReactNode
  }
}

// ── Component ──────────────────────────────────────────────────────────

export function ChatContent({
  renderCreateTask,
  emptyState,
  composerProps,
}: ChatContentProps) {
  // ── Store reads ────────────────────────────────────────────────────
  const messages = useChatMessages()
  const isStreaming = useIsStreaming()
  const stoppedByUser = useStoppedByUser()
  const pendingQuestion = usePendingQuestion()
  const pendingConfirmation = usePendingConfirmation()
  const actions = useChatActions()
  const sessionIdRef = useChatSessionIdRef()
  const draftText = useDraftText()
  const draftFiles = useDraftFiles()
  const setDraftText = useSetDraftText()
  const setDraftFiles = useSetDraftFiles()
  const clearDraft = useClearDraft()
  const mode = useChatMode()
  const streamSlugForMode = useChatStreamSlugForMode()
  const setChatMode = useSetChatMode()
  const streamSlug = useStreamSlug()
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

  // The effective stream for mode: streamSlugForMode (set during learning mode
  // entry) takes priority, then falls back to the current stream context.
  const effectiveStreamSlug = streamSlugForMode || streamSlug || null

  const handleModeChange = useCallback(
    (newMode: 'general' | 'learning') => {
      const modeStream = effectiveStreamSlug ?? undefined
      setChatMode(newMode, modeStream)

      // Persist to chat.json (fire-and-forget) so mode survives page reload
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

  // Scroll to bottom when messages first appear (initial load / chat switch)
  useEffect(() => {
    if (hasMessages && !prevHadMessages.current) {
      scrollToBottom('instant')
    }
    prevHadMessages.current = hasMessages
  }, [hasMessages, scrollToBottom])

  return (
    <div className="relative flex h-full flex-col">
      {/* Body + Sticky Footer */}
      <div
        ref={scrollRef}
        data-chat-surface="window"
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none"
      >
        <div className="flex min-h-full flex-1 flex-col">
          {/* Messages */}
          <div ref={contentRef} className="px-4 pt-0 pb-8">
            {!hasMessages && emptyState}
            {hasMessages && (
              <div className="w-full">
                <ChatMessageList
                  messages={messages}
                  renderCreateTask={renderCreateTask}
                />
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
              <p
                data-testid="stopped-indicator"
                className="text-muted-foreground/60 py-2 text-center text-xs"
              >
                You stopped the chat
              </p>
            )}
          </div>

          {/* Spacer — pushes composer to bottom when content is short */}
          <div className="flex-1" />

          {/* Sticky composer */}
          <div className="sticky bottom-0 z-10">
            <div className="mx-auto w-full max-w-2xl px-1 pb-1 transition-[padding] duration-200 @min-[687px]:pb-6">
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
                    composerProps?.placeholder ??
                    (isStreaming
                      ? 'Q is working...'
                      : hasMessages
                        ? 'Reply...'
                        : 'Ask Q anything...')
                  }
                  showStop={isStreaming && !pendingQuestion}
                  onStop={actions.stop}
                  compact={composerProps?.compact}
                  autoFocus={composerProps?.autoFocus}
                  actions={composerProps?.actions}
                  value={draftText}
                  onValueChange={setDraftText}
                  stagedFiles={draftFiles}
                  onStagedFilesChange={setDraftFiles}
                  rightActions={
                    <ComposerModeToggle
                      mode={mode}
                      onModeChange={handleModeChange}
                      disabled={isStreaming}
                    />
                  }
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
