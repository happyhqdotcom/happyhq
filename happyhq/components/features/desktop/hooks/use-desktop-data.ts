'use client'

import type { RunStatus } from '@/components/features/desktop/types'
import type { ChatItem, DesktopData, TaskItem } from '@/lib/fs/types'
import { FetchError, fetcher } from '@/lib/swr'
import { desktopDataKey, taskItemsKey } from '@/lib/swr-keys'
import { useDesktopStore, useStreamSlug } from '@/stores/desktopStore'
import { useStreams } from '@/stores/streamsStore'
import { useParams } from 'next/navigation'
import useSWR from 'swr'

// Stable empty array — avoids new reference on every render (React 19 + useSyncExternalStore)
const EMPTY_CHATS: ChatItem[] = []

/**
 * SWR-backed hook for all desktop server data.
 * Reads stream and task identity from the URL (via useStreamSlug and
 * useParams), then returns the cached data from SWR's global cache.
 *
 * Any component in the tree can call this — SWR deduplicates requests
 * and shares cache globally (no React Context boundary).
 */
export function useDesktopData() {
  const streamSlug = useStreamSlug()
  const taskSlug = useParams<{ task?: string }>().task
  return useSWR<DesktopData, FetchError>(
    streamSlug || taskSlug
      ? desktopDataKey(streamSlug || null, taskSlug)
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      isPaused: () => useDesktopStore.getState().mockMode,
    },
  )
}

// ── Convenience selectors ──────────────────────────────────────────────
// Same API as the old Zustand selector hooks — just a different import path.

export function useStreamContent() {
  const { data } = useDesktopData()
  return data?.streamContent
}

export function useTaskContent() {
  const { data } = useDesktopData()
  return data?.taskContent ?? undefined
}

export function useChatsList(): ChatItem[] {
  const { data } = useDesktopData()
  return data?.chats ?? EMPTY_CHATS
}

export function useDesktopError(): { status?: number } | undefined {
  const { error } = useDesktopData()
  return error ? { status: error.status } : undefined
}

export function useDesktopLoading(): boolean {
  const { data, error } = useDesktopData()
  return !data && !error
}

// ── Derived selectors ──────────────────────────────────────────────────

export function useTaskStatus(): RunStatus {
  const { data } = useDesktopData()
  return data?.taskContent?.run?.status ?? null
}

export function useRunInfo() {
  const { data } = useDesktopData()
  return data?.taskContent?.run ?? null
}

export function useActiveTask(): TaskItem | null {
  const taskSlug = useParams<{ task?: string }>().task
  const { data: allTasks } = useSWR<TaskItem[]>(taskItemsKey(), fetcher)
  if (!taskSlug || !allTasks) return null
  return allTasks.find((t) => t.slug === taskSlug) ?? null
}

export function useStreamTitle(): string | null {
  const streamSlug = useStreamSlug()
  const streams = useStreams()
  return streams.find((st) => st.name === streamSlug)?.title ?? null
}

/** Returns the SWR mutate function for the desktop data cache. */
export function useDesktopMutate() {
  const { mutate } = useDesktopData()
  return mutate
}
