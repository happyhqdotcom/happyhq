'use client'

import { ChatContent } from '@/components/features/chat/chat-content'
import { ChatSelectorDropdown } from '@/components/features/chat/chat-selector-dropdown'
import { StartTaskCard } from '@/components/features/chat/interaction/start-task-card'
import { StreamContextSelector } from '@/components/features/chat/list/home-composer/stream-context-selector'
import { ChatMessageList } from '@/components/features/chat/messages/chat-message-list'
import { useChatActions } from '@/components/features/desktop/hooks/use-chat-actions'
import {
  useChatsList,
  useDesktopMutate,
} from '@/components/features/desktop/hooks/use-desktop-data'
import {
  useChatSessionIdRef,
  useIsStreaming,
} from '@/components/features/desktop/providers/chat-session-provider'
import { deleteChat } from '@/lib/actions'
import type { ChatMessage, ToolCall } from '@/lib/chat/types'
import { displayTitle } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDesktopStore, useStreamSlug } from '@/stores/desktopStore'
import { useStreams } from '@/stores/streamsStore'
import { useWindowStore } from '@/stores/windowStore'
import { Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFrame } from '../window-frame'
import { ChatWindowProvider } from './chat-window-provider'

// ── Read-only helpers ────────────────────────────────────────────────

function fetchSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  return fetch(`/api/chat/history?session=${encodeURIComponent(sessionId)}`)
    .then((res) =>
      res.ok
        ? (res.json() as Promise<{ messages: ChatMessage[] }>)
        : { messages: [] },
    )
    .then((data) => data.messages ?? [])
    .catch(() => [])
}

// ── Interactive chat content (rendered inside ChatWindowProvider) ────

function InteractiveChatContent({
  frameProps,
  windowTitle,
}: {
  frameProps: Omit<
    React.ComponentProps<typeof WindowFrame>,
    'title' | 'children'
  >
  windowTitle: string
}) {
  const chatActions = useChatActions()
  const router = useRouter()
  const streamSlug = useStreamSlug()
  const chats = useChatsList()
  const streams = useStreams()
  const isStreaming = useIsStreaming()
  const sessionIdRef = useChatSessionIdRef()
  const mutateDesktop = useDesktopMutate()

  const handleStreamSelect = useCallback(
    (slug: string | null) => {
      useDesktopStore.getState().setSelectedStream(slug ?? '')
      const sid = sessionIdRef.current
      if (sid) {
        fetch('/api/chat/stream-select', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originStreamSlug: streamSlug || undefined,
            sessionId: sid,
            selectedStreamSlug: slug,
          }),
        }).catch(() => {})
      }
    },
    [sessionIdRef, streamSlug],
  )

  const renderCreateTask = useCallback(
    (tc: ToolCall, _msg: ChatMessage) => {
      const input = tc.input as {
        name: string
        textContext: string
        files?: string[]
      }
      if (tc.taskStarted) {
        return (
          <StartTaskCard
            name={input.name}
            onStart={() =>
              router.push(
                `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(input.name)}`,
              )
            }
            started
          />
        )
      }
      return (
        <StartTaskCard
          name={input.name}
          onStart={() => chatActions.startTask(input, tc.id)}
        />
      )
    },
    [router, streamSlug, chatActions],
  )

  return (
    <WindowFrame
      {...frameProps}
      title=""
      navigation={
        <>
          <Image
            src="/brand/q.svg"
            alt="Q"
            width={14}
            height={14}
            priority
            className="ml-1.5 shrink-0"
          />
          <ChatSelectorDropdown
            chats={chats.map((c) => ({
              sessionId: c.sessionId,
              label: c.title ?? 'Untitled chat',
              // Current stream chats have no group (appear first); others are grouped
              ...(c.streamName !== streamSlug && {
                group: c.streamName
                  ? displayTitle(
                      streams.find((s) => s.name === c.streamName)?.title ??
                        null,
                      c.streamName,
                    )
                  : 'General',
              }),
            }))}
            currentSessionId={sessionIdRef.current}
            label={windowTitle || 'New Chat'}
            onSelect={(id) => chatActions.switchChat(id)}
            onDelete={(id) => {
              const isActive = id === sessionIdRef.current
              deleteChat(id).then(() => {
                mutateDesktop(
                  (prev) =>
                    prev && {
                      ...prev,
                      chats: prev.chats.filter((ch) => ch.sessionId !== id),
                    },
                  { revalidate: false },
                )
                if (isActive) {
                  chatActions.newChat()
                }
              })
            }}
          />
        </>
      }
    >
      <div className="@container flex h-full flex-col">
        <ChatContent
          renderCreateTask={renderCreateTask}
          composerProps={{
            autoFocus: true,
            actions: (
              <StreamContextSelector
                streams={streams}
                selectedStream={streamSlug || null}
                onSelect={handleStreamSelect}
                disabled={isStreaming}
              />
            ),
          }}
        />
      </div>
    </WindowFrame>
  )
}

// ── Main component ──────────────────────────────────────────────────

export function ChatWindow({ id, canvasRef }: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  const scrollRef = useRef<HTMLDivElement>(null)

  if (!result) return null

  const { frameProps, window: w } = result
  if (w.contentType !== 'chat') return null

  const { interactive } = w.meta

  // ── Interactive mode: delegate to ChatContent via per-window provider
  if (interactive) {
    return (
      <ChatWindowProvider
        sessionId={w.meta.sessionId}
        windowId={w.id}
        initialMode={w.meta.initialMode}
      >
        <InteractiveChatContent frameProps={frameProps} windowTitle={w.title} />
      </ChatWindowProvider>
    )
  }

  // ── Read-only mode: existing behavior ─────────────────────────────

  const { sessionIds, activeIndex, messages, loading } = w.meta
  const hasMultipleSessions = sessionIds.length > 1

  const switchSession = (index: number) => {
    if (index === activeIndex) return
    const { updateChatMeta } = useWindowStore.getState()
    updateChatMeta(w.id, { activeIndex: index, messages: [], loading: true })
    fetchSessionMessages(sessionIds[index]).then((msgs) => {
      useWindowStore.getState().updateChatMeta(w.id, {
        messages: msgs,
        loading: false,
      })
    })
  }

  return (
    <WindowFrame
      title={w.title}
      {...frameProps}
      footer={
        <div className="flex items-center justify-center border-t border-zinc-200 bg-zinc-50 px-4 py-2">
          <button
            type="button"
            onClick={() => {
              useWindowStore.getState().updateChatMeta(w.id, {
                interactive: true,
                sessionId: sessionIds[activeIndex],
              })
            }}
            className="flex h-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-3 font-mono text-[10px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-zinc-800"
          >
            Continue
          </button>
        </div>
      }
      afterTitle={
        hasMultipleSessions ? (
          <div className="flex items-center gap-1">
            {sessionIds.map((_, i) => (
              <button
                key={i}
                onClick={() => switchSession(i)}
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-medium transition-colors',
                  i === activeIndex
                    ? 'bg-zinc-900 text-white'
                    : 'bg-zinc-100 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600',
                )}
              >
                {i + 1}
              </button>
            ))}
          </div>
        ) : null
      }
    >
      <div className="flex h-full flex-col">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-zinc-400">No messages found</p>
          </div>
        ) : (
          <div
            ref={scrollRef}
            data-chat-surface="window"
            className="flex-1 overflow-y-auto px-4 pb-4"
          >
            <div className="w-full space-y-3">
              <ChatMessageList messages={messages} />
            </div>
          </div>
        )}
      </div>
    </WindowFrame>
  )
}
