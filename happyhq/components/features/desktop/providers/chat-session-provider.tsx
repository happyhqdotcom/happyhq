'use client'

import type { ChatHistoryData } from '@/lib/chat/load-history.server'
import type { ChatState } from '@/stores/chatStore'
import { createChatStore } from '@/stores/chatStore'
import { useDesktopStore, useStreamSlug } from '@/stores/desktopStore'
import type { ReactNode } from 'react'
import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import type { StoreApi, UseBoundStore } from 'zustand'

// ── Context ─────────────────────────────────────────────────────────────

interface ChatSessionContextValue {
  store: UseBoundStore<StoreApi<ChatState>>
  sessionIdRef: React.MutableRefObject<string | null>
  windowId?: string // set by ChatWindowProvider so ensureSession can sync back to window store
}

export const ChatSessionContext = createContext<ChatSessionContextValue | null>(
  null,
)

/**
 * Hook to access the chat store instance from ChatSessionProvider context.
 * Components use this to read chat state via Zustand selectors.
 */
export function useChatSessionStore(): UseBoundStore<StoreApi<ChatState>> {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) throw new Error('Missing ChatSessionProvider')
  return ctx.store
}

/**
 * Hook to access the session ID ref from ChatSessionProvider context.
 * Used by useChatActions to read/write the current session ID.
 */
export function useChatSessionIdRef(): React.MutableRefObject<string | null> {
  const ctx = useContext(ChatSessionContext)
  if (!ctx) throw new Error('Missing ChatSessionProvider')
  return ctx.sessionIdRef
}

/**
 * Hook to access the window ID from ChatWindowProvider context.
 * Returns undefined when used from the page-level ChatSessionProvider.
 */
export function useChatWindowId(): string | undefined {
  const ctx = useContext(ChatSessionContext)
  return ctx?.windowId
}

// ── Selector hooks ──────────────────────────────────────────────────────
// Follow the same pattern as desktopStore: primitive selectors are fine
// without useShallow; multi-field selectors need useShallow to avoid
// infinite re-renders with React 19's stricter useSyncExternalStore.

export function useChatMessages() {
  return useChatSessionStore()((s) => s.messages)
}

export function useIsStreaming() {
  return useChatSessionStore()((s) => s.isStreaming)
}

export function useChatName() {
  return useChatSessionStore()((s) => s.chatName)
}

export function useStoppedByUser() {
  return useChatSessionStore()((s) => s.stoppedByUser)
}

export function usePendingQuestion() {
  return useChatSessionStore()((s) => s.pendingQuestion)
}

export function usePendingConfirmation() {
  return useChatSessionStore()((s) => s.pendingConfirmation)
}

export function useHasChatMessages() {
  return useChatSessionStore()((s) => s.messages.length > 0)
}

export function useDraftText() {
  return useChatSessionStore()((s) => s.draftText)
}

export function useDraftFiles() {
  return useChatSessionStore()((s) => s.draftFiles)
}

export function useSetDraftText() {
  return useChatSessionStore()((s) => s.setDraftText)
}

export function useSetDraftFiles() {
  return useChatSessionStore()((s) => s.setDraftFiles)
}

export function useClearDraft() {
  return useChatSessionStore()((s) => s.clearDraft)
}

export function useChatMode() {
  return useChatSessionStore()((s) => s.mode)
}

export function useChatStreamSlugForMode() {
  return useChatSessionStore()((s) => s.streamSlugForMode)
}

export function useSetChatMode() {
  return useChatSessionStore()((s) => s.setMode)
}

// ── Provider ────────────────────────────────────────────────────────────

/**
 * Shares a chatStore instance via React context. Creates the store once,
 * manages session ID tracking, and loads the most recent chat on mount.
 *
 * Must be rendered inside DesktopStoreProvider (reads streamSlug and
 * chats list from desktopStore).
 */
export function ChatSessionProvider({
  children,
  initialSessionId,
  initialHistory,
}: {
  children: ReactNode
  initialSessionId?: string
  initialHistory?: ChatHistoryData | null
}) {
  const [store] = useState(() => createChatStore())
  const sessionIdRef = useRef<string | null>(null)

  const streamSlug = useStreamSlug()

  // ── Reset chat store on stream change ─────────────────────────────
  // ChatSessionProvider now lives in the layout and persists across
  // route changes. When the stream changes (page-level provider resets
  // desktopStore.streamSlug), we must reset the chat store and clear
  // the session ID so the load-history effect can fire for the new stream.
  //
  // Skip when initialSessionId is set (the /chat/[id] page) — there,
  // stream changes are mid-chat context switches via the StreamContextSelector,
  // not navigations. The session stays the same.
  const prevStreamSlugRef = useRef(streamSlug)
  useLayoutEffect(() => {
    if (initialSessionId) return
    if (prevStreamSlugRef.current !== streamSlug) {
      prevStreamSlugRef.current = streamSlug
      store.getState().reset()
      sessionIdRef.current = null
    }
  }, [streamSlug, store, initialSessionId])

  // ── Seed store from server-pre-loaded history ───────────────────────
  // When the /chat/[id] page passes initialHistory, populate the store
  // synchronously before first paint so the UI never flashes "New Chat".
  // The key={id} on ChatPageShell guarantees this runs exactly once per session.
  useLayoutEffect(() => {
    if (!initialHistory || !initialSessionId) return
    sessionIdRef.current = initialSessionId
    const state: Partial<ChatState> = {}
    if (initialHistory.chatName) state.chatName = initialHistory.chatName
    if (
      initialHistory.mode === 'general' ||
      initialHistory.mode === 'learning'
    ) {
      state.mode = initialHistory.mode
    }
    if (initialHistory.streamSlug) {
      state.streamSlugForMode = initialHistory.streamSlug
    }
    if (initialHistory.messages?.length > 0) {
      state.messages = initialHistory.messages
    }
    if (Object.keys(state).length > 0) {
      store.setState(state)
    }
    if (initialHistory.selectedStreamSlug != null) {
      useDesktopStore
        .getState()
        .setSelectedStream(initialHistory.selectedStreamSlug || '')
    }
  }, [initialSessionId, initialHistory, store])

  // Consume pending message from home composer.
  // HomeComposer stashes the first message in sessionStorage before
  // navigating to /chat/{id}. This effect consumes it and fires sendMessage.
  // Only relevant when initialSessionId is set (the /chat/[id] page).
  // Must be declared BEFORE the load-history effect so React runs it first —
  // setting sessionIdRef.current causes the history effect to early-return.
  useEffect(() => {
    if (!initialSessionId) return
    const raw = sessionStorage.getItem('q-home-message')
    if (!raw) return
    try {
      const { slug, sessionId, message, files, mode } = JSON.parse(raw)
      if (sessionId !== initialSessionId) return
      sessionStorage.removeItem('q-home-message')

      sessionIdRef.current = sessionId

      // Set mode from the home composer payload before sending the first
      // message so sendMessage picks up the correct mode for the API body.
      if (mode === 'learning' || mode === 'general') {
        store.setState({ mode, streamSlugForMode: slug ?? null })
      }

      store.getState().sendMessage({
        message,
        files,
        sessionId,
        streamSlug: slug || undefined,
      })
    } catch {
      sessionStorage.removeItem('q-home-message')
    }
  }, [initialSessionId, streamSlug, sessionIdRef, store])

  // Load chat session on mount — only when an explicit initialSessionId
  // is provided (used by /chat/[id] page). Desktop windows manage their
  // own sessions via ChatWindowProvider; the page-level provider no longer
  // auto-loads the most recent chat.
  useEffect(() => {
    if (sessionIdRef.current) return
    if (!initialSessionId) return
    sessionIdRef.current = initialSessionId
    store.getState().loadHistory({
      sessionId: initialSessionId,
      streamSlug: streamSlug || undefined,
    })
  }, [streamSlug, store, initialSessionId])

  return (
    <ChatSessionContext.Provider value={{ store, sessionIdRef }}>
      {children}
    </ChatSessionContext.Provider>
  )
}
