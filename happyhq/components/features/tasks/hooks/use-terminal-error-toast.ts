'use client'

import { toastError } from '@/components/common/ui/sonner'
import type { RunInfo } from '@/lib/fs/types'
import { useEffect, useRef } from 'react'

/**
 * Toasts terminal run errors observed via SWR-fetched run state.
 *
 * Closes the very-fast fast-fail race in #227: when a run errors before the
 * client's SWR poll observes 'planning'/'working', `useRunActivity` never
 * mounts and the live SSE error broadcast lands in an empty subscriber set.
 * This hook surfaces the toast deterministically once `.run.json` reaches
 * `status='stopped'` with an `error`.
 *
 * Dedupes against the live SSE path via Sonner's `id` (run.startedAt-keyed),
 * so a long working run that errors mid-iteration with the user actively
 * watching produces exactly one toast.
 *
 * On first call we snapshot whatever's already on disk without toasting —
 * stale errors from a prior session must not toast on page load.
 */
export function useTerminalErrorToast(
  run: RunInfo | null | undefined,
  mockMode: boolean,
): void {
  const lastSeenStartedAtRef = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    if (mockMode) return
    const startedAt = run?.startedAt ?? null
    if (lastSeenStartedAtRef.current === undefined) {
      lastSeenStartedAtRef.current = startedAt
      return
    }
    if (
      startedAt &&
      startedAt !== lastSeenStartedAtRef.current &&
      run?.status === 'stopped' &&
      run.error
    ) {
      toastError(run.error, { id: `run-error:${startedAt}` })
    }
    lastSeenStartedAtRef.current = startedAt
  }, [run?.startedAt, run?.status, run?.error, mockMode])
}
