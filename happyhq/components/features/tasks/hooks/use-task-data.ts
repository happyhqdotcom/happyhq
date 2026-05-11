'use client'

import { useRunActions } from '@/components/features/desktop/hooks/use-run-actions'
import { useRunActivity } from '@/components/features/desktop/hooks/use-run-activity'
import { useCurrentUser } from '@/lib/accounts/hooks'
import type { TaskContent } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { useTaskStore } from '@/stores/taskStore'
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import useSWR, { mutate as globalMutate } from 'swr'

import { useTerminalErrorToast } from './use-terminal-error-toast'

interface TaskIdentity {
  taskSlug: string
  streamSlug: string | null
}

/**
 * Hook that manages the task card's data lifecycle:
 * SWR fetch, real-time SSE activity, run actions, debounced refresh,
 * and run-end detection.
 *
 * Identity (taskSlug, streamSlug, title) is read directly from props/SWR by
 * the card and its sections — see useActiveTaskItem in use-task-swr.ts.
 * This hook only owns client-only state: run activity + run action handles.
 */
export function useTaskData(task: TaskIdentity | null) {
  const { token } = useCurrentUser()
  const hasStream = task?.streamSlug != null
  const mockMode = useTaskStore((s) => s.mockMode)

  // ── Reset client-only state when the active task changes ─────────────
  // useLayoutEffect fires before paint so sections never see leaked SSE
  // activity from the previous task. Destructured to the scalar so the
  // exhaustive-deps rule doesn't ask for the whole `task` object (which
  // would re-fire on every render — the caller passes a fresh object).
  const activeTaskSlug = task?.taskSlug
  useLayoutEffect(() => {
    if (!activeTaskSlug) return
    useTaskStore.getState().resetForTaskSwitch()
  }, [activeTaskSlug])

  // ── SWR fetch for task content ──────────────────────────────────────
  // This is the "owner" that triggers the fetch. Card components read the
  // same cache via useTaskSWR() — SWR deduplicates automatically.
  // In mock mode, suppress revalidation so injected data isn't overwritten.
  const swrKey = task ? taskContentKey(task.taskSlug) : null

  const { data: content, mutate } = useSWR<TaskContent>(swrKey, fetcher, {
    // Revalidation is handled explicitly by debouncedRefresh and run-end
    // detection — don't let SWR's auto-focus revalidation race our logic.
    revalidateOnFocus: false,
    isPaused: () => useTaskStore.getState().mockMode,
  })

  // ── Derived: is a run currently active? ─────────────────────────────
  const isRunActive =
    content?.run?.status === 'discovering' ||
    content?.run?.status === 'planning' ||
    content?.run?.status === 'working'

  // ── Real-time activity stream ───────────────────────────────────────
  // In mock mode, suppress SSE — the dev panel injects activity directly.
  // The onStreamNotFound callback refetches SWR when the SSE endpoint says
  // there's no active run — covers fast-fails where the run terminated
  // between the optimistic mount and the SSE fetch landing.
  const { activitySteps, statusLine, lastResultAt, lastContentChangeAt } =
    useRunActivity(
      hasStream && isRunActive && !mockMode,
      content?.run?.startedAt ?? null,
      mutate,
    )

  // Push run state into store (client-only — from SSE, not server data).
  // In mock mode, the dev panel injects state directly — skip to avoid overwriting.
  useEffect(() => {
    if (!task || mockMode) return
    useTaskStore
      .getState()
      .setRunState({ isRunActive, activitySteps, statusLine })
  }, [task, isRunActive, activitySteps, statusLine, mockMode])

  // ── Debounced refresh ───────────────────────────────────────────────
  // Coalesces SSE-triggered invalidations into a single SWR refetch.
  // Pattern matches DesktopInitializer's debouncedRefresh.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const debouncedRefresh = useCallback(() => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      mutate()
      globalMutate(taskItemsKey())
    }, 200)
  }, [mutate])

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
    }
  }, [])

  // Re-fetch when run produces results or writes files
  useEffect(() => {
    if (lastResultAt && !mockMode) debouncedRefresh()
  }, [lastResultAt, debouncedRefresh, mockMode])

  useEffect(() => {
    if (lastContentChangeAt && !mockMode) debouncedRefresh()
  }, [lastContentChangeAt, debouncedRefresh, mockMode])

  // ── Terminal-error toast (SWR-observed) ─────────────────────────────
  useTerminalErrorToast(content?.run ?? null, mockMode)

  // ── Run-end detection ───────────────────────────────────────────────
  // When isRunActive transitions true → false, revalidate to pick up
  // final results. Skip false → true — the optimistic update from
  // useRunActions already set the status, and revalidating immediately
  // would race the server (disk write hasn't happened yet).
  const prevRunActiveRef = useRef(isRunActive)
  useEffect(() => {
    if (mockMode) return
    if (prevRunActiveRef.current !== isRunActive) {
      const wasActive = prevRunActiveRef.current
      prevRunActiveRef.current = isRunActive
      if (wasActive && !isRunActive) {
        mutate()
        globalMutate(taskItemsKey())
      }
    }
  }, [isRunActive, mutate, mockMode])

  // ── Run actions ─────────────────────────────────────────────────────
  const runActions = useRunActions(
    task?.streamSlug ?? '',
    task?.taskSlug ?? '',
    hasStream && isRunActive,
    token ?? undefined,
  )

  useEffect(() => {
    if (!task || mockMode) return
    useTaskStore.getState().setRunActionsState({
      isLoading: runActions.isLoading,
      isStopping: runActions.isStopping,
      start: runActions.start,
      stop: runActions.stop,
      approve: runActions.approve,
      continue_: runActions.continue_,
      answerQuestion: runActions.answerQuestion,
      upgradeNeeded: runActions.upgradeNeeded,
      billingWarning: runActions.billingWarning,
    })
  }, [
    task,
    mockMode,
    runActions.isLoading,
    runActions.isStopping,
    runActions.start,
    runActions.stop,
    runActions.approve,
    runActions.continue_,
    runActions.answerQuestion,
    runActions.upgradeNeeded,
    runActions.billingWarning,
  ])
}
