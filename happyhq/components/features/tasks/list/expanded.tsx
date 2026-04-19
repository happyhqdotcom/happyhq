'use client'

import { TaskCard } from '@/components/features/tasks'
import type { TaskItem } from '@/lib/fs/types'

export function TaskDetail({ taskItem }: { taskItem: TaskItem }) {
  return (
    <div className="rounded-b-md bg-white">
      <TaskCard taskItem={taskItem} />
    </div>
  )
}
