'use client'

import { TaskCard } from '@/components/features/tasks'
import type { TaskItem } from '@/lib/fs/types'

export function TaskDetail({
  taskItem,
  onAttemptStart,
}: {
  taskItem: TaskItem
  onAttemptStart?: () => void
}) {
  return (
    <div className="rounded-b-md bg-white">
      <TaskCard taskItem={taskItem} onAttemptStart={onAttemptStart} />
    </div>
  )
}
