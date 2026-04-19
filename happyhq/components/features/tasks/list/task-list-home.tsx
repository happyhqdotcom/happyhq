'use client'

import { Greeting } from '@/components/common/greeting/greeting'
import { TaskQuickAdd } from '@/components/features/tasks/create/quick-add'
import { TaskListItemActions } from '@/components/features/tasks/list/actions'
import { TaskDetail } from '@/components/features/tasks/list/expanded'
import { TaskListItem } from '@/components/features/tasks/list/item'
import { useTrackRecentTask } from '@/hooks/use-track-recent'
import type { TaskItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { ListChecks } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'
import useSWR, { preload } from 'swr'

const MockTaskPanel =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@/components/features/tasks/card/debug/mock-task-panel').then(
            (m) => m.MockTaskPanel,
          ),
        { ssr: false },
      )
    : () => null

const EMPTY_TASKS: TaskItem[] = []

function prefetchTask(task: TaskItem) {
  preload(taskContentKey(task.slug), fetcher)
}

export function TaskListHome({ selectedTask }: { selectedTask?: string } = {}) {
  const router = useRouter()
  const { data: allTasks = EMPTY_TASKS } = useSWR<TaskItem[]>(
    taskItemsKey(),
    fetcher,
    { revalidateOnFocus: true },
  )
  const tasks = useMemo(
    () => allTasks.filter((t) => !t.frontmatter.completedAt),
    [allTasks],
  )

  // Track task visit for recents
  const selectedTaskItem = selectedTask
    ? allTasks.find((t) => t.slug === selectedTask)
    : undefined
  useTrackRecentTask(
    selectedTask,
    selectedTaskItem?.frontmatter.title ?? null,
    selectedTaskItem?.frontmatter.stream ?? undefined,
  )

  function handleSelectTask(task: TaskItem) {
    if (task.slug === selectedTask) {
      // Collapse
      router.push('/tasks', { scroll: false })
    } else {
      // Select — always open inline on the home page (inbox model)
      prefetchTask(task)
      router.push(`/tasks/inbox/${encodeURIComponent(task.slug)}`, {
        scroll: false,
      })
    }
  }

  function handleCollapse() {
    router.push('/tasks', { scroll: false })
  }

  return (
    <div className="flex h-svh flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-16 pb-24">
        <Greeting />

        <div className="mt-8">
          <TaskQuickAdd />
          {selectedTask && <MockTaskPanel />}
          <div className="mt-3 flex flex-col gap-1">
            {tasks.length > 0 ? (
              tasks.map((task) => {
                const isSelected = task.slug === selectedTask
                const dimmed = selectedTask != null && !isSelected
                return (
                  <div
                    key={task.slug}
                    onMouseEnter={() => prefetchTask(task)}
                    style={{
                      marginTop: isSelected ? 24 : 0,
                      marginBottom: isSelected ? 44 : 0,
                      opacity: dimmed ? 0.4 : 1,
                    }}
                  >
                    {isSelected && (
                      <TaskListItemActions
                        task={task}
                        onCollapse={handleCollapse}
                      />
                    )}
                    <div className={isSelected ? 'rounded-md shadow-sm' : ''}>
                      <TaskListItem
                        task={task}
                        selected={isSelected}
                        onSelect={() => handleSelectTask(task)}
                      />
                      {isSelected && <TaskDetail taskItem={task} />}
                    </div>
                  </div>
                )
              })
            ) : (
              <EmptyState />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center py-16 text-center">
      <div className="bg-muted flex size-12 items-center justify-center rounded-xl">
        <ListChecks className="text-muted-foreground size-6" />
      </div>
      <p className="text-muted-foreground mt-4 text-sm">
        No tasks yet. Add one above to get started.
      </p>
    </div>
  )
}
