import type { ChatMessage } from '@/lib/chat/types'
import { useWindowStore } from '@/stores/windowStore'

/**
 * Open an interactive chat window for a new or existing session.
 * Each call creates a new window with an independent chat store.
 *
 * @param streamName - The stream slug
 * @param opts.sessionId - Resume an existing session; omit to start fresh
 * @param opts.title - Window title (defaults to "Chat with Q")
 * @returns The window ID
 */
export function openInteractiveChatWindow(
  streamName: string,
  opts?: {
    sessionId?: string
    title?: string
    initialMode?: 'general' | 'learning'
    intent?: string
    /** When true, ChatWindow maximizes against its canvas on first mount. */
    maximize?: boolean
  },
): string {
  const windowId = `chat-${crypto.randomUUID().slice(0, 8)}`

  useWindowStore.getState().openWindow({
    id: windowId,
    contentType: 'chat',
    title: opts?.title ?? 'Chat with Q',
    position: { x: 160, y: 48 },
    size: { width: 520, height: 650 },
    meta: {
      streamName,
      sessionIds: [],
      activeIndex: 0,
      messages: [],
      loading: false,
      interactive: true,
      sessionId: opts?.sessionId,
      initialMode: opts?.initialMode,
      intent: opts?.intent,
      shouldMaximize: opts?.maximize,
    },
  })

  return windowId
}

/**
 * Open a read-only chat viewer window for one or more SDK sessions.
 * Imperative — uses getState() so it can be called from any context.
 */
export function openChatSessionWindow(
  streamName: string,
  sessionIds: string[],
  title: string,
  windowId: string,
  opts?: { interactive?: boolean },
): void {
  if (sessionIds.length === 0) return

  const store = useWindowStore.getState()

  const existing = store.windows.find((w) => w.id === windowId)
  if (existing?.isOpen) {
    store.focusWindow(windowId)
    return
  }

  // Remove stale closed window so openWindow creates a fresh entry
  // instead of hitting the "reopen" path which can leave ghost state.
  if (existing) {
    store.closeWindow(windowId)
    // Force removal from the array so the next openWindow adds fresh
    useWindowStore.setState((s) => ({
      windows: s.windows.filter((w) => w.id !== windowId),
    }))
  }

  useWindowStore.getState().openWindow({
    id: windowId,
    contentType: 'chat',
    title,
    position: { x: 160, y: 48 },
    size: { width: 520, height: 600 },
    meta: {
      streamName,
      sessionIds,
      activeIndex: 0,
      messages: [],
      loading: true,
      interactive: opts?.interactive,
    },
  })

  // Fetch messages for the first session
  fetch(`/api/chat/history?session=${encodeURIComponent(sessionIds[0])}`)
    .then((res) =>
      res.ok
        ? (res.json() as Promise<{ messages: ChatMessage[] }>)
        : { messages: [] },
    )
    .then((data) => {
      useWindowStore.getState().updateChatMeta(windowId, {
        messages: data.messages ?? [],
        loading: false,
      })
    })
    .catch(() => {
      useWindowStore
        .getState()
        .updateChatMeta(windowId, { messages: [], loading: false })
    })
}
