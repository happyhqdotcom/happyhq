'use client'

import type { ChatItem, StreamEntry, TaskItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { allChatsKey, taskItemsKey } from '@/lib/swr-keys'
import useSWR from 'swr'

/**
 * Headless initializer that warms the SWR cache with core app data:
 * streams, tasks, and chats. Mounted in route group layouts so data
 * is available everywhere — components call useSWR with the same keys
 * and get instant cache hits.
 */
export function WorkspaceInitializer({
  initialStreams,
}: {
  initialStreams: StreamEntry[]
}) {
  // ── Core data fetches ─────────────────────────────────────────────
  // These warm the SWR cache so any component calling useSWR with the
  // same key gets an instant cache hit.

  useSWR<StreamEntry[]>('/api/fs/streams', fetcher, {
    revalidateOnMount: false,
    revalidateOnFocus: false,
    fallbackData: initialStreams,
  })

  useSWR<TaskItem[]>(taskItemsKey(), fetcher)
  useSWR<ChatItem[]>(allChatsKey(), fetcher)

  return null
}
