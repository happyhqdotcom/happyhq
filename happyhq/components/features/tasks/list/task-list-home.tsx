'use client'

import { Greeting } from '@/components/common/greeting/greeting'
import { TaskQuickAdd } from '@/components/features/tasks/create/quick-add'
import { TaskListItemActions } from '@/components/features/tasks/list/actions'
import { TaskDetail } from '@/components/features/tasks/list/expanded'
import { TaskListItem } from '@/components/features/tasks/list/item'
import {
  idleTaskBlockedHint,
  idleTaskBlockedReason,
} from '@/components/features/tasks/start-gate'
import { useTrackRecentTask } from '@/hooks/use-track-recent'
import type { TaskItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { ListChecks } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
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

  // Nudge counter — incremented each time a user clicks the disabled Start
  // Task button. TaskCardHint keys its animated wrapper on this so the CSS
  // animation auto-fires on the remount. Only one card is expanded at a
  // time, so a single counter suffices.
  const [nudgeCounter, setNudgeCounter] = useState(0)
  const handleAttemptStart = useCallback(() => {
    setNudgeCounter((c) => c + 1)
  }, [])

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
                      {isSelected && (
                        <TaskDetail
                          taskItem={task}
                          onAttemptStart={handleAttemptStart}
                        />
                      )}
                    </div>
                    {isSelected && (
                      <TaskCardHint task={task} nudgeCounter={nudgeCounter} />
                    )}
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

// Persistent-prerequisite hint shown beneath an expanded idle card. Surfaces
// only the user-actionable cases that don't resolve on their own (no-title,
// no-stream). Transient cases (uploading, loading) are left to the disabled
// button to communicate — they clear in seconds and the attachments area
// already shows upload progress.
//
// The row always renders (with a non-breaking space when there's no hint) so
// that filling in the missing prerequisite doesn't cause the tasks below to
// jump up — no layout shift mid-interaction.
function TaskCardHint({
  task,
  nudgeCounter,
}: {
  task: TaskItem
  nudgeCounter: number
}) {
  const hasRun = task.run?.status != null
  const reason = hasRun
    ? null
    : idleTaskBlockedReason({
        streamSlug: task.frontmatter.stream ?? null,
        title: task.frontmatter.title,
        isUploading: false,
        runActionsLoading: false,
        runActionsUpgradeNeeded: false,
      })
  const hint =
    reason === 'no-title' || reason === 'no-stream'
      ? idleTaskBlockedHint(reason)
      : null
  return (
    <div className="mt-2 text-center text-xs">
      {hint ? (
        // Re-key on nudgeCounter so a click on the disabled Start Task
        // button remounts this node and the CSS animation auto-fires.
        // Counter starts at 0 so the first paint doesn't shake.
        <span
          key={nudgeCounter}
          className={nudgeCounter > 0 ? 'animate-nudge inline-block' : ''}
        >
          <span className="font-medium text-zinc-600">Hint:</span>{' '}
          <span className="text-zinc-500">{hint}</span>
        </span>
      ) : (
        ' '
      )}
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
