'use client'

import { toastError } from '@/components/common/ui/sonner'
import { useBillingData } from '@/components/features/billing/use-billing-data'
import type { DesktopData, RunInfo, TaskContent } from '@/lib/fs/types'
import { invalidateStream } from '@/lib/swr-helpers'
import { desktopDataKey, taskContentKey } from '@/lib/swr-keys'
import { useWindowStore } from '@/stores/windowStore'
import { useCallback, useEffect, useRef, useState } from 'react'
import { mutate } from 'swr'

interface RunActions {
  approve: () => Promise<void>
  continue_: (mode?: 'planning' | 'working') => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  isLoading: boolean
  isStopping: boolean
  error: string | null
  /** True when the last run start was rejected due to runtime limit (403 + upgrade:true). */
  upgradeNeeded: boolean
  /** Low balance warning from a successful run start. */
  billingWarning: string | null
  /** Remaining minutes when billingWarning is 'low_balance'. */
  remainingMinutes: number | null
}

export function useRunActions(
  streamSlug: string,
  taskSlug: string,
  isRunActive: boolean,
  token?: string,
): RunActions {
  const [isLoading, setIsLoading] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [upgradeNeeded, setUpgradeNeeded] = useState(false)
  const [billingWarning, setBillingWarning] = useState<string | null>(null)
  const [remainingMinutes, setRemainingMinutes] = useState<number | null>(null)
  // Track in-flight start/approve/continue fetch so stop() can wait for it.
  // Without this, a quick Continue→Stop sequence can race: stop arrives at
  // the server before start, finds no active run, and silently no-ops.
  const pendingStartRef = useRef<Promise<Response> | null>(null)

  // Client-side gate: when the browser already knows runtime is exhausted,
  // short-circuit to the upgrade prompt so the UI never flickers through
  // an optimistic "planning"/"working" status before the server returns 403.
  // Returns null when billing data isn't available (CE / no user) — in that
  // case the server-side check in /api/run/start remains the source of truth.
  const billingData = useBillingData()
  const isRuntimeExhausted =
    billingData !== null && billingData.remainingMinutes <= 0

  // Track previous isRunActive to detect transition to false
  const prevActiveRef = useRef(isRunActive)

  // Clear isStopping when isRunActive transitions to false
  useEffect(() => {
    if (prevActiveRef.current && !isRunActive) {
      setIsStopping(false)
    }
    prevActiveRef.current = isRunActive
  }, [isRunActive])

  /** Optimistically set run status in SWR caches.
   *  Updates both the desktop combined key and the individual task key
   *  so the status change is visible on both the desktop and home page. */
  const optimisticRun = useCallback(
    (status: RunInfo['status']) => {
      const now = new Date().toISOString()
      const fallbackRun: RunInfo = {
        status,
        startedAt: now,
        lastIterationAt: now,
        phases: [],
      }

      // When restarting from planning, clear stale plan/working/outputs
      // so the old content disappears immediately (server deletes on disk
      // inside setImmediate, but the SWR cache would show stale data until
      // the next refresh).
      const clearContent = status === 'planning'

      // Desktop cache — combined endpoint
      mutate(
        desktopDataKey(streamSlug, taskSlug),
        (current: DesktopData | undefined) => {
          if (!current?.taskContent) return current
          const run = current.taskContent.run
            ? {
                ...current.taskContent.run,
                status,
                lastIterationAt: now,
                error: undefined,
              }
            : fallbackRun
          return {
            ...current,
            taskContent: {
              ...current.taskContent,
              run,
              ...(clearContent && {
                plan: null,
                working: [],
                outputs: [],
              }),
            },
          }
        },
        false,
      )

      // Home page task card cache — individual endpoint
      mutate(
        taskContentKey(taskSlug),
        (current: TaskContent | undefined) => {
          if (!current) return current
          const run = current.run
            ? { ...current.run, status, lastIterationAt: now, error: undefined }
            : fallbackRun
          return {
            ...current,
            run,
            ...(clearContent && {
              plan: null,
              working: [],
              outputs: [],
            }),
          }
        },
        false,
      )
    },
    [streamSlug, taskSlug],
  )

  const approve = useCallback(async () => {
    if (isRuntimeExhausted) {
      setUpgradeNeeded(true)
      return
    }
    setIsLoading(true)
    setError(null)
    setUpgradeNeeded(false)
    optimisticRun('working')
    const fetchPromise = fetch('/api/run/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        stream: streamSlug,
        task: taskSlug,
        mode: 'working',
      }),
    })
    pendingStartRef.current = fetchPromise
    try {
      const res = await fetchPromise
      if (!res.ok) {
        const data = await res.json()
        if (data.upgrade) setUpgradeNeeded(true)
        throw new Error(data.error || 'Failed to approve')
      }
      const data = await res.json()
      if (data.warning === 'low_balance') {
        setBillingWarning('low_balance')
        setRemainingMinutes(data.remainingMinutes ?? null)
      }
      // No invalidateStream() on success — the SSE-driven debouncedRefresh()
      // in desktop-data-provider handles live updates, and calling it here
      // would fight the optimistic update we just set above.
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to approve'
      setError(msg)
      toastError(msg)
      // Revalidate to undo optimistic update on failure
      invalidateStream(streamSlug)
    } finally {
      pendingStartRef.current = null
      setIsLoading(false)
    }
  }, [streamSlug, taskSlug, optimisticRun, token, isRuntimeExhausted])

  // Resume from stopped — same endpoint as approve, but sends
  // resume:true so the server preserves working dir instead of cleaning up.
  // Accepts optional mode for resuming planning vs working.
  const continue_ = useCallback(
    async (continueMode: 'planning' | 'working' = 'working') => {
      if (isRuntimeExhausted) {
        setUpgradeNeeded(true)
        return
      }
      setIsLoading(true)
      setError(null)
      optimisticRun(continueMode)
      const fetchPromise = fetch('/api/run/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({
          stream: streamSlug,
          task: taskSlug,
          mode: continueMode,
          resume: true,
        }),
      })
      pendingStartRef.current = fetchPromise
      try {
        const res = await fetchPromise
        if (!res.ok) {
          const data = await res.json()
          if (data.upgrade) {
            throw new Error('Usage limit still active')
          }
          throw new Error(data.error || 'Failed to continue')
        }
        const data = await res.json()
        if (data.warning === 'low_balance') {
          setBillingWarning('low_balance')
          setRemainingMinutes(data.remainingMinutes ?? null)
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to continue'
        setError(msg)
        toastError(msg)
        invalidateStream(streamSlug)
      } finally {
        pendingStartRef.current = null
        setIsLoading(false)
      }
    },
    [streamSlug, taskSlug, optimisticRun, token, isRuntimeExhausted],
  )

  const start = useCallback(async () => {
    if (isRuntimeExhausted) {
      setUpgradeNeeded(true)
      return
    }
    setIsStopping(false)
    setIsLoading(true)
    setError(null)
    setUpgradeNeeded(false)
    optimisticRun('planning')
    // Close any open plan/output/working windows — server deletes these files
    useWindowStore.getState().closeWindowForFile(`tasks/${taskSlug}/plan.md`)
    const fetchPromise = fetch('/api/run/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
      },
      body: JSON.stringify({
        stream: streamSlug,
        task: taskSlug,
        mode: 'planning',
      }),
    })
    pendingStartRef.current = fetchPromise
    try {
      const res = await fetchPromise
      if (!res.ok) {
        const data = await res.json()
        if (data.upgrade) setUpgradeNeeded(true)
        throw new Error(data.error || 'Failed to start')
      }
      const data = await res.json()
      if (data.warning === 'low_balance') {
        setBillingWarning('low_balance')
        setRemainingMinutes(data.remainingMinutes ?? null)
      }
      // No invalidateStream() on success — same reasoning as approve().
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start'
      setError(msg)
      toastError(msg)
      // Revalidate to undo optimistic update on failure
      invalidateStream(streamSlug)
    } finally {
      pendingStartRef.current = null
      setIsLoading(false)
    }
  }, [streamSlug, taskSlug, optimisticRun, token, isRuntimeExhausted])

  const stop = useCallback(async () => {
    setIsStopping(true)
    setIsLoading(true)
    setError(null)
    // Wait for any in-flight start/continue fetch to land before stopping,
    // otherwise the stop arrives first and silently no-ops.
    if (pendingStartRef.current) {
      await pendingStartRef.current.catch(() => {})
    }
    try {
      const res = await fetch('/api/run/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stream: streamSlug, task: taskSlug }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to stop')
      }
      invalidateStream(streamSlug)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to stop'
      setError(msg)
      toastError(msg)
      setIsStopping(false)
    } finally {
      setIsLoading(false)
    }
  }, [streamSlug, taskSlug])

  return {
    approve,
    continue_,
    start,
    stop,
    isLoading,
    isStopping,
    error,
    upgradeNeeded,
    billingWarning,
    remainingMinutes,
  }
}
