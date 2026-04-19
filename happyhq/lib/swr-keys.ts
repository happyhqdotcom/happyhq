/** Shared SWR cache key builders — single source of truth for key format. */

/** Task content (~/HappyHQ/tasks/{slug}). */
export const taskContentKey = (taskSlug: string) =>
  `/api/fs/task?task=${encodeURIComponent(taskSlug)}`

/** Task items (task.md) — Todoist-like home page task list. */
export const taskItemsKey = () => '/api/fs/task-items'

/** All chats across all streams — chat list tab. */
export const allChatsKey = () => '/api/fs/chats'

/** Combined desktop data key — one fetch for stream + task + chats. */
export const desktopDataKey = (
  streamSlug: string | null,
  taskSlug?: string,
) => {
  const params = new URLSearchParams()
  if (streamSlug) params.set('stream', streamSlug)
  if (taskSlug) params.set('task', taskSlug)
  return `/api/fs/desktop?${params}`
}
