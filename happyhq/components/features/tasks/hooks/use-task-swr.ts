'use client'

import type { TaskContent } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskContentKey } from '@/lib/swr-keys'
import { useTaskStore } from '@/stores/taskStore'
import useSWR from 'swr'

/**
 * SWR-backed hook for task card server data.
 * Reads task identity from taskStore (client-only state)
 * and returns the cached content from SWR's global cache.
 *
 * Same pattern as useDesktopData() for the desktop side.
 */
export function useTaskSWR() {
  const taskSlug = useTaskStore((s) => s.taskSlug)

  const swrKey = taskSlug ? taskContentKey(taskSlug) : null

  return useSWR<TaskContent>(swrKey, fetcher, {
    // Pure cache reader — useTaskData is the single owner responsible
    // for all revalidation (debounced refresh, run-end detection).
    // Without this, section components mounting/unmounting during state
    // transitions trigger background fetches that race optimistic updates.
    revalidateIfStale: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    isPaused: () => useTaskStore.getState().mockMode,
  })
}

// ── Convenience selectors ──────────────────────────────────────────────

export function useTaskContentData(): TaskContent | null {
  const { data } = useTaskSWR()
  return data ?? null
}

export function useTaskMutate() {
  const { mutate } = useTaskSWR()
  return mutate
}
