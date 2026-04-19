import { mutate } from 'swr'

import { allChatsKey, taskItemsKey } from './swr-keys'

/**
 * Invalidate all SWR caches related to a stream.
 * Call this after any mutation that changes stream data (task
 * rename/delete, run start/stop, chat creation, file writes).
 *
 * Uses SWR's filter function to match all desktop and task keys
 * for this stream — impossible to miss a cache.
 */
export function invalidateStream(streamSlug: string) {
  const encoded = encodeURIComponent(streamSlug)
  // Revalidate all matching keys WITHOUT clearing cached data.
  // Previously passed `undefined` as the data arg, which set the cache to
  // undefined before the refetch completed — components saw undefined data
  // mid-flight and the task panel flashed to the "Start Task" state.
  mutate(
    (key) =>
      typeof key === 'string' &&
      (key.startsWith(`/api/fs/desktop?stream=${encoded}`) ||
        key.startsWith(`/api/fs/task?stream=${encoded}`)),
  )
  mutate(taskItemsKey())
  mutate(allChatsKey())
}
