'use client'

import { ChatSessionContext } from '@/components/features/desktop/providers/chat-session-provider'
import { createChatStore } from '@/stores/chatStore'
import { useStreamSlug } from '@/stores/desktopStore'
import { useWindowStore } from '@/stores/windowStore'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'

/**
 * Lightweight ChatSessionContext provider scoped to a single chat window.
 *
 * Creates its own chatStore instance + sessionIdRef so that ChatContent and
 * useChatActions read from this window's context instead of the page-level
 * ChatSessionProvider. React's context scoping handles the shadowing.
 *
 * Does NOT replicate rename recovery, home-message consumption, or
 * streamsStore bridging — those are page-level concerns only.
 */
export function ChatWindowProvider({
  children,
  sessionId,
  windowId,
  initialMode,
}: {
  children: ReactNode
  sessionId?: string | null
  windowId?: string
  initialMode?: 'general' | 'learning'
}) {
  const streamSlug = useStreamSlug()
  const [store] = useState(() => {
    const s = createChatStore()
    // Seed mode at creation time — no effects, no race conditions.
    // Only for new sessions (no sessionId); resumed sessions get mode from history.
    if (initialMode && !sessionId) {
      s.setState({ mode: initialMode, streamSlugForMode: streamSlug })
    }
    return s
  })
  const sessionIdRef = useRef<string | null>(sessionId ?? null)

  // Load history on mount when restoring a window with an existing session.
  // Uses a ref for the initial sessionId so this does NOT re-fire when
  // ensureSession syncs a freshly-created ID to the window store.
  const initialSessionId = useRef(sessionId)
  useEffect(() => {
    const id = initialSessionId.current
    if (!id || !streamSlug) return
    sessionIdRef.current = id
    store.getState().loadHistory({ sessionId: id, streamSlug })
  }, [streamSlug, store])

  // Sync chat name → window title so there's a single source of truth.
  // Syncs truthy chatName immediately. Clears the title only when chatName
  // is null AND sessionIdRef is null (a true new-chat reset), NOT during
  // switchChat where chatName is briefly null while history loads.
  useEffect(() => {
    if (!windowId) return
    let prev: string | null = null
    return store.subscribe((state) => {
      if (state.chatName && state.chatName !== prev) {
        prev = state.chatName
        useWindowStore.setState((s) => ({
          windows: s.windows.map((w) =>
            w.id === windowId ? { ...w, title: state.chatName! } : w,
          ),
        }))
      } else if (!state.chatName && prev && !sessionIdRef.current) {
        prev = null
        useWindowStore.setState((s) => ({
          windows: s.windows.map((w) =>
            w.id === windowId ? { ...w, title: '' } : w,
          ),
        }))
      }
    })
  }, [store, windowId, sessionIdRef])

  // Cleanup: abort streaming on unmount (window close)
  useEffect(() => {
    return () => {
      const state = store.getState()
      if (state.isStreaming) {
        state.abortStream()
        if (sessionIdRef.current) {
          fetch('/api/chat/stop', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionIdRef.current }),
          }).catch(() => {})
        }
      }
    }
  }, [store])

  return (
    <ChatSessionContext.Provider value={{ store, sessionIdRef, windowId }}>
      {children}
    </ChatSessionContext.Provider>
  )
}
