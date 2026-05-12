'use client'

import { toastError } from '@/components/common/ui/sonner'
import { useCurrentUser } from '@/lib/accounts/hooks'
import {
  createChatSession,
  createTask,
  deleteChat,
  markTaskCreated,
  markTaskStarted,
  setupTaskFromChat,
  uploadFile,
} from '@/lib/actions'
import { generateTaskSlug } from '@/lib/format'
import type { TaskContent } from '@/lib/fs/types'
import { invalidateStream } from '@/lib/swr-helpers'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { useStreamSlug } from '@/stores/desktopStore'
import { useWindowStore } from '@/stores/windowStore'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useCallback, useRef } from 'react'
import { mutate } from 'swr'
import {
  useChatSessionIdRef,
  useChatSessionStore,
  useChatWindowId,
} from '../providers/chat-session-provider'
import { useDesktopMutate } from './use-desktop-data'

export interface ChatActions {
  ensureSession: () => Promise<string>
  send: (message: string, files?: File[]) => Promise<void>
  stop: () => Promise<void>
  answerQuestion: (answers: Record<string, string>) => Promise<void>
  cancelQuestion: () => Promise<void>
  allowConfirmation: () => Promise<void>
  denyConfirmation: () => Promise<void>
  createTaskFromChat: (
    input: { name: string; textContext: string; files?: string[] },
    toolCallId: string,
  ) => Promise<void>
  startTask: (
    input: { name: string; textContext: string; files?: string[] },
    toolCallId: string,
  ) => Promise<void>
  newChat: () => Promise<void>
  switchChat: (sessionId: string) => Promise<void>
  deleteChat: () => Promise<void>
  exportDebug: () => Promise<void>
}

/**
 * Provides all chat action functions. Reads dependencies from desktopStore
 * and ChatSessionProvider context instead of receiving them as args.
 *
 * Replaces the action portion of the useChat hook. The store instance and
 * session ID come from ChatSessionProvider; navigation, mutate, and UI
 * setters come from desktopStore selectors.
 */
export function useChatActions(): ChatActions {
  const { token } = useCurrentUser()
  const store = useChatSessionStore()
  const sessionIdRef = useChatSessionIdRef()
  const windowId = useChatWindowId()

  // Read from desktopStore — no dependency injection needed
  const router = useRouter()
  const pathname = usePathname()
  const rawStreamSlug = useStreamSlug()
  // Normalize empty string to null for server actions that accept string | null
  const streamSlug = rawStreamSlug || null
  const activeTaskSlug = useParams<{ task?: string }>().task
  const mutateChats = useDesktopMutate()

  // Promise lock: concurrent ensureSession() calls (e.g. multi-file drop)
  // await the same creation instead of each creating a separate session.
  const sessionPromiseRef = useRef<Promise<string> | null>(null)

  const ensureSession = useCallback(async (): Promise<string> => {
    if (sessionIdRef.current) return sessionIdRef.current
    if (sessionPromiseRef.current) return sessionPromiseRef.current

    const promise = (async () => {
      const sessionId = crypto.randomUUID()
      await createChatSession(sessionId, streamSlug)
      sessionIdRef.current = sessionId
      // Sync to window store so the sessionId persists in sessionStorage
      if (windowId) {
        useWindowStore.getState().updateChatMeta(windowId, { sessionId })
      }
      return sessionId
    })()

    sessionPromiseRef.current = promise
    try {
      return await promise
    } finally {
      sessionPromiseRef.current = null
    }
  }, [sessionIdRef, streamSlug, windowId])

  const send = useCallback(
    async (message: string, files?: File[]) => {
      // Optimistic UI: show the user message and transition immediately,
      // before the async session creation / file upload completes.
      store.getState().addUserMessage(
        message,
        files?.map((f) => f.name),
      )

      try {
        await ensureSession()
      } catch {
        toastError('Failed to create chat session')
        return
      }

      // Upload files now that a session exists, collect slugs for the agent
      let fileSlugs: string[] | undefined
      if (files?.length) {
        try {
          fileSlugs = await Promise.all(
            files.map((file) => {
              const formData = new FormData()
              formData.append('file', file)
              return uploadFile(sessionIdRef.current!, formData, token)
            }),
          )
        } catch {
          toastError('Failed to upload files')
          return
        }
      }

      store.getState().sendMessage({
        message,
        files: files?.map((f) => f.name),
        fileSlugs,
        sessionId: sessionIdRef.current!,
        streamSlug: streamSlug ?? undefined,
        taskSlug: activeTaskSlug ?? undefined,
        messageAdded: true,
      })
    },
    [ensureSession, sessionIdRef, streamSlug, activeTaskSlug, store, token],
  )

  const stop = useCallback(async () => {
    store.setState({ stoppedByUser: true })
    store.getState().abortStream()
    const res = await fetch('/api/chat/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current }),
    })
    if (res.status === 404) {
      store.setState({ isStreaming: false })
    }
  }, [store, sessionIdRef])

  const answerQuestion = useCallback(
    async (answers: Record<string, string>) => {
      store.setState((state) => {
        const msgs = state.messages.map((m) => {
          if (!m.isStreaming || !m.toolCalls) return m
          const toolCalls = m.toolCalls.map((tc) =>
            tc.name === 'AskUserQuestion' && !tc.answers
              ? { ...tc, answers }
              : tc,
          )
          return { ...m, toolCalls }
        })
        return { messages: msgs, pendingQuestion: null }
      })

      const res = await fetch('/api/chat/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          answers,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Unknown error' }))
        toastError(`Answer failed (${res.status}): ${err.error ?? 'unknown'}`)
      }
    },
    [store, sessionIdRef],
  )

  const cancelQuestion = useCallback(async () => {
    store.setState({ pendingQuestion: null, stoppedByUser: true })
    const res = await fetch('/api/chat/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionIdRef.current }),
    })
    if (res.status === 404) {
      store.setState({ isStreaming: false })
    }
  }, [store, sessionIdRef])

  const allowConfirmation = useCallback(async () => {
    const toolUseId = store.getState().pendingConfirmation?.toolUseId
    store.setState({ pendingConfirmation: null })
    const res = await fetch('/api/chat/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        toolUseId,
        allow: true,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Unknown error' }))
      toastError(`Allow failed (${res.status}): ${err.error ?? 'unknown'}`)
    }
  }, [store, sessionIdRef])

  const denyConfirmation = useCallback(async () => {
    const toolUseId = store.getState().pendingConfirmation?.toolUseId
    store.setState({ pendingConfirmation: null })
    await fetch('/api/chat/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sessionIdRef.current,
        toolUseId,
        deny: true,
      }),
    })
  }, [store, sessionIdRef])

  // Helper: read the persisted taskSlug from the tool call (set by Create).
  // Falls back to regenerating from input.name, but that produces a *different*
  // slug than was actually written (timestamp varies) — only used as a defensive
  // last resort if Start somehow fires before Create's optimistic update lands.
  const taskSlugFor = useCallback(
    (toolCallId: string, fallbackName: string): string => {
      const state = store.getState()
      for (const msg of state.messages) {
        for (const tc of msg.toolCalls ?? []) {
          if (tc.id === toolCallId && tc.taskSlug) return tc.taskSlug
        }
      }
      return generateTaskSlug(fallbackName)
    },
    [store],
  )

  const createTaskFromChat = useCallback(
    async (
      input: { name: string; textContext: string; files?: string[] },
      toolCallId: string,
    ) => {
      const slug = generateTaskSlug(input.name)

      // Optimistic UI — flip bubble to "Created" and stash the slug
      store.setState((state) => ({
        messages: state.messages.map((m) => ({
          ...m,
          toolCalls: m.toolCalls?.map((tc) =>
            tc.id === toolCallId
              ? { ...tc, taskCreated: true, taskSlug: slug }
              : tc,
          ),
        })),
      }))

      // Persist to chat.json (name + slug) so history reload shows Created state
      if (sessionIdRef.current) {
        markTaskCreated(sessionIdRef.current, input.name, slug).catch(() => {})
      }

      await createTask(
        slug,
        input.name,
        streamSlug ?? undefined,
        input.textContext,
      )
      await setupTaskFromChat(slug, sessionIdRef.current!, input.files ?? [])

      // Surface the new task in the user's list
      mutate(taskItemsKey())
      if (streamSlug) invalidateStream(streamSlug)
    },
    [store, sessionIdRef, streamSlug],
  )

  const startTask = useCallback(
    async (
      input: { name: string; textContext: string; files?: string[] },
      toolCallId: string,
    ) => {
      const slug = taskSlugFor(toolCallId, input.name)

      // Optimistic UI — flip bubble to "Started"
      store.setState((state) => ({
        messages: state.messages.map((m) => ({
          ...m,
          toolCalls: m.toolCalls?.map((tc) =>
            tc.id === toolCallId ? { ...tc, taskStarted: true } : tc,
          ),
        })),
      }))

      if (sessionIdRef.current) {
        markTaskStarted(sessionIdRef.current, input.name).catch(() => {})
      }

      // Seed the task content cache so the navigated-to page shows planning
      const now = new Date().toISOString()
      mutate(
        taskContentKey(slug),
        {
          plan: null,
          frontmatter: null,
          description: null,
          run: {
            status: 'planning' as const,
            startedAt: now,
            lastIterationAt: now,
            phases: [],
          },
          inputs: [],
          working: [],
          outputs: [],
        } satisfies TaskContent,
        false,
      )

      if (streamSlug) {
        router.push(
          `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(slug)}`,
        )
      } else {
        router.push('/tasks')
      }

      await fetch('/api/run/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          stream: streamSlug ?? undefined,
          task: slug,
          mode: 'planning',
        }),
      }).catch(() => {})

      if (streamSlug) invalidateStream(streamSlug)
    },
    [store, sessionIdRef, streamSlug, router, token, taskSlugFor],
  )

  const newChat = useCallback(async () => {
    if (store.getState().isStreaming && sessionIdRef.current) {
      await fetch('/api/chat/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionIdRef.current }),
      })
    }
    // Clear ref before reset so the provider's title subscription sees
    // sessionIdRef.current === null and knows this is a true new-chat,
    // not a mid-switchChat transition.
    sessionIdRef.current = null
    store.getState().reset()
  }, [store, sessionIdRef])

  const switchChat = useCallback(
    async (sessionId: string) => {
      if (sessionId === sessionIdRef.current) return
      if (store.getState().isStreaming && sessionIdRef.current) {
        await fetch('/api/chat/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionIdRef.current }),
        })
      }
      store.getState().reset()
      sessionIdRef.current = sessionId
      // Sync to window store so the sessionId persists in sessionStorage
      if (windowId) {
        useWindowStore.getState().updateChatMeta(windowId, { sessionId })
      }
      store
        .getState()
        .loadHistory({ sessionId, streamSlug: streamSlug ?? undefined })
    },
    [store, sessionIdRef, streamSlug, windowId],
  )

  const handleDeleteChat = useCallback(async () => {
    if (!sessionIdRef.current) return
    const onChatPage = pathname.startsWith('/chat/')
    await deleteChat(sessionIdRef.current)
    // Navigate before resetting state to avoid flash of empty/stale UI
    if (onChatPage) {
      router.push('/chat')
    }
    // Clear ref before reset so the provider's title subscription sees
    // sessionIdRef.current === null and knows this is a true delete,
    // not a mid-switchChat transition.
    sessionIdRef.current = null
    store.getState().reset()
    mutateChats()
  }, [sessionIdRef, store, mutateChats, pathname, router])

  const exportDebug = useCallback(async () => {
    if (!sessionIdRef.current) return
    try {
      const params = new URLSearchParams({
        session: sessionIdRef.current,
      })
      if (streamSlug) params.set('stream', streamSlug)
      const res = await fetch(`/api/chat/debug-bundle?${params}`)
      if (!res.ok) {
        toastError('Failed to export bug report')
        return
      }
      const disposition = res.headers.get('Content-Disposition')
      const match = disposition?.match(/filename="(.+)"/)
      const fileName =
        match?.[1] ??
        `debug-${streamSlug ?? 'chat'}-${sessionIdRef.current.slice(0, 8)}.json`
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = fileName
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      toastError('Failed to export bug report')
    }
  }, [sessionIdRef, streamSlug])

  return {
    ensureSession,
    send,
    stop,
    answerQuestion,
    cancelQuestion,
    allowConfirmation,
    denyConfirmation,
    createTaskFromChat,
    startTask,
    newChat,
    switchChat,
    deleteChat: handleDeleteChat,
    exportDebug,
  }
}
