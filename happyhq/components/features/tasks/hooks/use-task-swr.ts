'use client'

import type { TaskContent } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskContentKey } from '@/lib/swr-keys'
import { useTaskStore } from '@/stores/taskStore'
import { useParams } from 'next/navigation'
import useSWR from 'swr'

// Task identity for the home page card surface comes from the URL
// (`/tasks/inbox/[task]`) — never from a duplicated copy in zustand, never
// via re-subscribing to the items-list SWR cache (which churns every SSE
// tick during a run). The URL is the only source that's both authoritative
// and stable across cache refetches.
export function useActiveTaskSlug(): string | null {
  return useParams<{ task?: string }>().task ?? null
}

/**
 * SWR-backed hook for task card server data.
 * Same pattern as useDesktopData() for the desktop side.
 */
export function useTaskSWR() {
  const taskSlug = useActiveTaskSlug()

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
