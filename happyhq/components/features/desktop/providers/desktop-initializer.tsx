'use client'

import { useCurrentUser } from '@/lib/accounts/hooks'
import type { ChatMessage } from '@/lib/chat/types'
import type { DesktopData, TaskItem } from '@/lib/fs/types'
import {
  streamCreateHandoffKey,
  type StreamCreateHandoff,
} from '@/lib/stream-create-handoff'
import { FetchError, fetcher } from '@/lib/swr'
import { desktopDataKey, taskItemsKey } from '@/lib/swr-keys'
import { useDesktopStore } from '@/stores/desktopStore'
import { useStreamsStore } from '@/stores/streamsStore'
import { useWindowStore, type SavedWindowState } from '@/stores/windowStore'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useRef } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'
import { useRunActions } from '../hooks/use-run-actions'
import { useRunActivity } from '../hooks/use-run-activity'
import { openInteractiveChatWindow } from '../windows/chat/open-chat-window'

/**
 * Headless initializer — returns null.
 *
 * Reads stream/task identity from the URL via useParams().
 * One SWR fetch for all desktop data. SWR cache is the source of truth
 * for server data — components read via useDesktopData() hooks.
 * Zustand store holds only client-only state (run activity, run actions, UI).
 */
export function DesktopInitializer() {
  const params = useParams<{ stream?: string; task?: string }>()
  const streamSlug = params.stream ?? ''
  const taskSlug = params.task
  const { token } = useCurrentUser()

  // ── Store reset on stream/task change ───────────────────────────
  // Resets client-only UI state and clears windows on navigation.
  // streamSlug comes from useParams() — components read it directly
  // via useStreamSlug(), so no need to seed it into the store.
  useEffect(() => {
    useWindowStore.getState().clearAll()
    useDesktopStore.getState().reset()
    useStreamsStore.getState().setActiveStreamSlug(streamSlug || null)

    // Consume any one-shot handoff from the Create Stream dialog. Must run
    // after clearAll(), otherwise the window we open here gets wiped.
    if (streamSlug) {
      const raw = sessionStorage.getItem(streamCreateHandoffKey(streamSlug))
      if (raw) {
        sessionStorage.removeItem(streamCreateHandoffKey(streamSlug))
        try {
          const { intent, maximize } = JSON.parse(raw) as StreamCreateHandoff
          openInteractiveChatWindow(streamSlug, {
            initialMode: 'learning',
            intent,
            maximize,
          })
        } catch {
          // Malformed handoff payload — silently drop. The user can chat manually.
        }
      }
    }

    return () => {
      useStreamsStore.getState().setActiveStreamSlug(null)
    }
  }, [streamSlug, taskSlug])

  // ── Window layout restore + persistence ───────────────────────
  useEffect(() => {
    const windowKey = taskSlug
      ? `happyhq:windows:${streamSlug || 'task'}:${taskSlug}`
      : `happyhq:windows:${streamSlug}`

    // Restore
    try {
      const raw = sessionStorage.getItem(windowKey)
      if (raw) {
        const saved = JSON.parse(raw) as SavedWindowState[]
        useWindowStore.getState().restoreLayout(saved)
      }
    } catch {
      // Ignore malformed data
    }

    // Re-fetch content for restored windows
    const { windows } = useWindowStore.getState()
    for (const w of windows) {
      if (w.contentType === 'markdown' && w.meta.filePath) {
        fetch(`/api/fs/file?path=${encodeURIComponent(w.meta.filePath)}`)
          .then((res) => (res.ok ? res.json() : Promise.reject()))
          .then(({ content }: { content: string }) => {
            useWindowStore
              .getState()
              .updateWindowMeta(w.id, { markdown: content, loading: false })
          })
          .catch(() => {
            useWindowStore
              .getState()
              .updateWindowMeta(w.id, { markdown: '', loading: false })
          })
      }
      if (w.contentType === 'directory' && w.meta?.directoryPath) {
        fetch(
          `/api/fs/directory?path=${encodeURIComponent(w.meta.directoryPath)}`,
        )
          .then((res) => (res.ok ? res.json() : Promise.reject()))
          .then(
            ({
              entries,
            }: {
              entries: {
                path: string
                name: string
                type: 'file' | 'directory'
              }[]
            }) => {
              useWindowStore.getState().updateDirectoryMeta(w.id, {
                directoryItems: entries.map((f) => ({
                  id: f.path,
                  name: f.name,
                  type: f.type,
                })),
                loading: false,
              })
            },
          )
          .catch(() => {
            useWindowStore.getState().updateDirectoryMeta(w.id, {
              directoryItems: [],
              loading: false,
            })
          })
      }
      // Read-only chat: fetch messages for the first session.
      // Interactive chat windows are handled by ChatWindowProvider on mount.
      if (
        w.contentType === 'chat' &&
        !w.meta.interactive &&
        w.meta.sessionIds.length > 0
      ) {
        const sid = w.meta.sessionIds[0]
        fetch(`/api/chat/history?session=${encodeURIComponent(sid)}`)
          .then((res) =>
            res.ok
              ? (res.json() as Promise<{ messages: unknown[] }>)
              : { messages: [] },
          )
          .then((data) => {
            useWindowStore.getState().updateChatMeta(w.id, {
              messages: (data.messages ?? []) as ChatMessage[],
              loading: false,
            })
          })
          .catch(() => {
            useWindowStore
              .getState()
              .updateChatMeta(w.id, { messages: [], loading: false })
          })
      }
    }

    // Persist on changes (debounced)
    let saveTimeout: ReturnType<typeof setTimeout>
    const unsub = useWindowStore.subscribe(() => {
      clearTimeout(saveTimeout)
      saveTimeout = setTimeout(() => {
        const { windows } = useWindowStore.getState()
        // Skip interactive chat windows with no session (nothing to restore)
        const layout: SavedWindowState[] = windows
          .filter(
            (w) =>
              !(
                w.contentType === 'chat' &&
                w.meta.interactive &&
                !w.meta.sessionId
              ),
          )
          .map((w) => ({
            id: w.id,
            contentType: w.contentType,
            title: w.title,
            filePath:
              w.contentType === 'markdown' ||
              w.contentType === 'pdf' ||
              w.contentType === 'image'
                ? w.meta.filePath
                : w.contentType === 'email'
                  ? w.meta.jsonPath
                  : undefined,
            directoryPath:
              w.contentType === 'directory'
                ? w.meta?.directoryPath
                : w.contentType === 'email'
                  ? w.meta.dirPath
                  : undefined,
            streamName:
              w.contentType === 'chat' ? w.meta.streamName : undefined,
            sessionId:
              w.contentType === 'chat' && w.meta.interactive
                ? w.meta.sessionId
                : undefined,
            sessionIds:
              w.contentType === 'chat' && !w.meta.interactive
                ? w.meta.sessionIds
                : undefined,
            interactive:
              w.contentType === 'chat' ? w.meta.interactive : undefined,
            position: w.position,
            size: w.size,
            isOpen: w.isOpen,
            isMaximized: w.isMaximized,
            savedBounds: w.savedBounds,
          }))
        sessionStorage.setItem(windowKey, JSON.stringify(layout))
      }, 500)
    })

    return () => {
      unsub()
      clearTimeout(saveTimeout)
    }
  }, [streamSlug, taskSlug])

  // ── Single SWR fetch for all desktop data ─────────────────────────
  // This is the "owner" that triggers the fetch. Components read the
  // same cache via useDesktopData() — SWR deduplicates automatically.
  const { data, mutate: mutateDesktop } = useSWR<DesktopData>(
    streamSlug || taskSlug
      ? desktopDataKey(streamSlug || null, taskSlug)
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      // In mock mode, suppress ALL automatic revalidation so injected
      // mock data isn't overwritten by server fetches.
      isPaused: () => useDesktopStore.getState().mockMode,
    },
  )

  // ── Derived: is a run currently active? ───────────────────────────
  const isRunActive =
    !!taskSlug &&
    (data?.taskContent?.run?.status === 'working' ||
      data?.taskContent?.run?.status === 'planning' ||
      data?.taskContent?.run?.status === 'discovering')

  // ── Real-time activity stream ─────────────────────────────────────
  // In mock mode, suppress the SSE connection — the dev panel injects
  // activity state directly into the store.
  const mockMode = useDesktopStore((s) => s.mockMode)
  const { statusLine, lastResultAt, lastContentChangeAt, activitySteps } =
    useRunActivity(
      isRunActive && !mockMode,
      data?.taskContent?.run?.startedAt ?? null,
      mutateDesktop,
    )

  // Push run state into store (client-only — from SSE, not server data).
  // In mock mode, the dev panel injects state directly — skip to avoid overwriting.
  useEffect(() => {
    if (mockMode) return
    useDesktopStore
      .getState()
      .setRunState({ isRunActive, activitySteps, statusLine })
  }, [isRunActive, activitySteps, statusLine, mockMode])

  // ── Run actions ───────────────────────────────────────────────────
  // Prefer the task's assigned stream (from the task list cache) over the URL
  // stream. After the user assigns a stream from inside the panel, the task
  // cache updates immediately via mutate(taskItemsKey()); the URL only catches
  // up after router.push completes. Without this preference, start() would
  // POST `stream: ''` during the window before navigation lands (#256).
  const { data: allTasks } = useSWR<TaskItem[]>(
    taskSlug ? taskItemsKey() : null,
    fetcher,
  )
  const taskAssignedStream =
    (taskSlug && Array.isArray(allTasks)
      ? (allTasks.find((t) => t.slug === taskSlug)?.frontmatter.stream ?? '')
      : '') || streamSlug
  const runActions = useRunActions(
    taskAssignedStream,
    taskSlug ?? '',
    isRunActive,
    token,
  )

  // Push run actions state into store (client-only — async operation state)
  useEffect(() => {
    useDesktopStore.getState().setRunActionsState({
      isLoading: runActions.isLoading,
      isStopping: runActions.isStopping,
      error: runActions.error,
      approve: runActions.approve,
      continue_: runActions.continue_,
      start: runActions.start,
      stop: runActions.stop,
      answerQuestion: runActions.answerQuestion,
      upgradeNeeded: runActions.upgradeNeeded,
      billingWarning: runActions.billingWarning,
      remainingMinutes: runActions.remainingMinutes,
    })
  }, [
    runActions.isLoading,
    runActions.isStopping,
    runActions.error,
    runActions.approve,
    runActions.continue_,
    runActions.start,
    runActions.stop,
    runActions.answerQuestion,
    runActions.upgradeNeeded,
    runActions.billingWarning,
    runActions.remainingMinutes,
  ])

  // ── Debounced refresh — coalesces multiple triggers into one fetch ──
  // During active runs, uses runOnly=true to skip re-reading static data
  // (playbook, specs, samples, chats) and only fetches task content + task list.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isRunActiveRef = useRef(isRunActive)
  // Mirror `isRunActive` into a ref so the debounced setTimeout below sees
  // the latest value without re-creating the timer when it changes. Effect
  // commits before the next setTimeout tick, so the ref is fresh when read.
  useEffect(() => {
    isRunActiveRef.current = isRunActive
  }, [isRunActive])

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(async () => {
      refreshTimerRef.current = null

      if (isRunActiveRef.current && taskSlug) {
        // Fast path: only fetch task content, merge into cache
        try {
          const url =
            desktopDataKey(streamSlug || null, taskSlug) + '&runOnly=true'
          const partial: {
            taskContent: DesktopData['taskContent']
          } = await fetcher(url)

          mutateDesktop(
            (prev) => {
              if (!prev) return prev
              return { ...prev, taskContent: partial.taskContent }
            },
            { revalidate: false },
          )
          // Refresh global task items cache so sidebar badges stay in sync
          globalMutate(taskItemsKey())
        } catch (err) {
          if (err instanceof FetchError && err.status === 404) return
          // On error, fall back to full refresh
          mutateDesktop()
        }
      } else {
        mutateDesktop()
        globalMutate(taskItemsKey())
      }
    }, 200)
  }, [mutateDesktop, streamSlug, taskSlug])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  // Re-fetch when run produces results or writes files
  useEffect(() => {
    if (lastResultAt) debouncedRefresh()
  }, [lastResultAt, debouncedRefresh])

  useEffect(() => {
    if (lastContentChangeAt) debouncedRefresh()
  }, [lastContentChangeAt, debouncedRefresh])

  // Re-fetch when run ends (active → inactive) to pick up final results.
  // Skip the inactive → active transition — the optimistic update from
  // useRunActions already set the status, and revalidating immediately
  // would race the server (disk write hasn't happened yet), returning
  // stale data that overwrites the optimistic update and causes a flash.
  // In mock mode, skip — mock data in SWR is the source of truth.
  const prevRunActiveRef = useRef(isRunActive)
  useEffect(() => {
    if (mockMode) return
    if (prevRunActiveRef.current !== isRunActive) {
      const wasActive = prevRunActiveRef.current
      prevRunActiveRef.current = isRunActive
      // Only revalidate when run ENDS, not when it starts
      if (wasActive && !isRunActive) {
        mutateDesktop()
        globalMutate(taskItemsKey())
      }
    }
  }, [isRunActive, mutateDesktop, mockMode])

  return null
}
