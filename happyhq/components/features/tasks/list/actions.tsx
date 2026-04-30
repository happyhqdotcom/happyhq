'use client'

import { useState } from 'react'

import { DeleteAlert } from '@/components/common/shared/delete-alert'
import { StreamPicker } from '@/components/features/tasks/atoms/stream-picker'
import { deleteTaskByLocation, updateTaskStream } from '@/lib/actions'
import type { TaskItem } from '@/lib/fs/types'
import { invalidateStream } from '@/lib/swr-helpers'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { useStreams } from '@/stores/streamsStore'
import { ArrowUpRight, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useSWRConfig } from 'swr'

const btnClass =
  'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-black/40 transition-colors hover:bg-black/5 hover:text-black/60 cursor-pointer'

export function TaskListItemActions({
  task,
  onCollapse,
}: {
  task: TaskItem
  onCollapse: () => void
}) {
  const router = useRouter()
  const { mutate } = useSWRConfig()
  const [deleteOpen, setDeleteOpen] = useState(false)
  const streams = useStreams()

  const streamSlug = task.frontmatter.stream ?? null
  const isRunning =
    task.run?.status === 'planning' || task.run?.status === 'working'
  const showAssign = !isRunning && streams.length > 0

  function handleOpen() {
    if (streamSlug) {
      router.push(
        `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(task.slug)}`,
      )
    } else {
      router.push(`/task/${encodeURIComponent(task.slug)}`)
    }
  }

  async function handleStreamChange(slug: string | null) {
    const prevStream = streamSlug
    await updateTaskStream(task.slug, slug)
    if (prevStream) invalidateStream(prevStream)
    if (slug) invalidateStream(slug)
    await mutate(taskContentKey(task.slug))
    await mutate(taskItemsKey())
  }

  async function handleDelete() {
    await deleteTaskByLocation(task.slug)
    await mutate(taskItemsKey())
    onCollapse()
    setDeleteOpen(false)
  }

  const deleteDescription = isRunning
    ? 'This will permanently delete this task and all its contents. This task is currently running.'
    : 'This will permanently delete this task and all its contents.'

  return (
    <>
      <div className="flex items-center pb-1">
        <button type="button" onClick={handleOpen} className={btnClass}>
          <ArrowUpRight className="h-3.5 w-3.5" />
          Open task
        </button>

        <div className="ml-auto flex items-center">
          {showAssign && (
            <StreamPicker
              streams={streams}
              selected={streamSlug}
              onSelect={handleStreamChange}
              disabled={false}
              variant="ghost"
              label={streamSlug ? 'Reassign' : 'Assign'}
            />
          )}

          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className={btnClass}
          >
            <Trash2 className="h-3 w-3" />
            Delete
          </button>

          <button
            type="button"
            onClick={onCollapse}
            className="cursor-pointer rounded-lg p-1 text-black/40 transition-colors hover:bg-black/5 hover:text-black/60"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <DeleteAlert
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete task?"
        description={deleteDescription}
        onDelete={handleDelete}
      />
    </>
  )
}
