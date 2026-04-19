'use client'

import { useEffect } from 'react'

import { Button } from '@/components/common/ui/button'
import { TaskQuickAdd } from '@/components/features/tasks/create/quick-add'
import { TaskListItemActions } from '@/components/features/tasks/list/actions'
import { TaskDetail } from '@/components/features/tasks/list/expanded'
import { TaskListItem } from '@/components/features/tasks/list/item'
import {
  useTrackRecentStream,
  useTrackRecentTask,
} from '@/hooks/use-track-recent'
import { displayTitle } from '@/lib/format'
import type { TaskItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { useStreamsStore } from '@/stores/streamsStore'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpRight, ListChecks } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
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

function prefetchTask(task: TaskItem) {
  preload(taskContentKey(task.slug), fetcher)
}

export function TaskListStream({
  streamSlug,
  streamTitle,
  initialTasks,
  selectedTask,
}: {
  streamSlug: string
  streamTitle: string | null
  initialTasks?: TaskItem[]
  selectedTask?: string
}) {
  const router = useRouter()
  const { data: allTasks = [] } = useSWR<TaskItem[]>(taskItemsKey(), fetcher, {
    revalidateOnFocus: true,
    ...(initialTasks && { fallbackData: initialTasks }),
  })

  // Track stream and task visits for recents
  useTrackRecentStream(streamSlug, streamTitle)
  const selectedTaskItem = selectedTask
    ? allTasks.find((t) => t.slug === selectedTask)
    : undefined
  useTrackRecentTask(
    selectedTask,
    selectedTaskItem?.frontmatter.title ?? null,
    streamSlug,
  )

  const streamTasks = allTasks.filter(
    (t) => t.frontmatter.stream === streamSlug,
  )
  const activeTasks = streamTasks.filter((t) => !t.frontmatter.completedAt)
  const completedTasks = streamTasks.filter((t) => !!t.frontmatter.completedAt)

  const title = displayTitle(streamTitle, streamSlug)

  const showCompleted = useStreamsStore((s) => s.showCompletedTasks)
  const setShowCompleted = useStreamsStore((s) => s.setShowCompletedTasks)
  const selectedIsCompleted = selectedTask
    ? completedTasks.some((t) => t.slug === selectedTask)
    : false
  const showCompletedSection = showCompleted || selectedIsCompleted

  // Set active stream slug for sidebar highlighting
  useEffect(() => {
    useStreamsStore.getState().setActiveStreamSlug(streamSlug)
    return () => {
      useStreamsStore.getState().setActiveStreamSlug(null)
    }
  }, [streamSlug])

  function handleSelectTask(task: TaskItem) {
    if (task.slug === selectedTask) {
      // Collapse — navigate back to stream list
      router.push(`/tasks/${encodeURIComponent(streamSlug)}`, { scroll: false })
    } else {
      // Select — navigate to task detail route (preload enriches cache)
      prefetchTask(task)
      router.push(
        `/tasks/${encodeURIComponent(streamSlug)}/${encodeURIComponent(task.slug)}`,
        { scroll: false },
      )
    }
  }

  function handleCollapse() {
    router.push(`/tasks/${encodeURIComponent(streamSlug)}`, { scroll: false })
  }

  return (
    <div className="flex h-svh flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 pt-16 pb-24">
        <div className="group/header">
          <div className="flex">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="-ml-2 h-7 px-1.5 text-black/40 hover:bg-black/5 hover:text-black/60"
            >
              <Link href={`/${streamSlug}`}>
                <ArrowUpRight className="h-4 w-4" />
                Open Stream
              </Link>
            </Button>
          </div>
          <h1 className="font-display text-2xl font-medium tracking-tight text-zinc-950 sm:text-[28px] md:text-[32px]">
            {title}
          </h1>
        </div>

        <div className="mt-8">
          <TaskQuickAdd fixedStream={streamSlug} />
          {selectedTask && <MockTaskPanel />}
          <div className="mt-3 flex flex-col gap-1">
            <AnimatePresence initial={false}>
              {activeTasks.map((task) => (
                <TaskItemRow
                  key={task.slug}
                  task={task}
                  selectedTask={selectedTask}
                  onSelect={() => handleSelectTask(task)}
                  onCollapse={handleCollapse}
                  onHover={() => prefetchTask(task)}
                  hideStreamLabel
                />
              ))}
            </AnimatePresence>
            {activeTasks.length === 0 && <EmptyState />}

            {completedTasks.length > 0 && (
              <>
                <div className="mt-6 flex">
                  <button
                    type="button"
                    onClick={() => setShowCompleted((v) => !v)}
                    className="w-[200px] cursor-pointer rounded-md bg-zinc-800/10 px-3 py-1.5 text-center text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-800/15 hover:text-zinc-600"
                  >
                    {showCompletedSection
                      ? 'Hide Completed Tasks'
                      : 'Show Completed Tasks'}
                  </button>
                </div>

                <AnimatePresence initial={false}>
                  {showCompletedSection && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                      className="-mx-1 -mb-1 overflow-hidden px-1 pb-1"
                    >
                      <div className="mt-3 flex flex-col gap-1">
                        <AnimatePresence initial={false}>
                          {completedTasks.map((task) => (
                            <TaskItemRow
                              key={task.slug}
                              task={task}
                              selectedTask={selectedTask}
                              onSelect={() => handleSelectTask(task)}
                              onCollapse={handleCollapse}
                              onHover={() => prefetchTask(task)}
                              hideStreamLabel
                            />
                          ))}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function TaskItemRow({
  task,
  selectedTask,
  onSelect,
  onCollapse,
  onHover,
  hideStreamLabel,
}: {
  task: TaskItem
  selectedTask?: string
  onSelect: () => void
  onCollapse: () => void
  onHover: () => void
  hideStreamLabel?: boolean
}) {
  const isSelected = task.slug === selectedTask
  const dimmed = selectedTask != null && !isSelected
  return (
    <div
      onMouseEnter={onHover}
      style={{
        marginTop: isSelected ? 24 : 0,
        marginBottom: isSelected ? 44 : 0,
        opacity: dimmed ? 0.4 : 1,
      }}
    >
      {isSelected && (
        <TaskListItemActions task={task} onCollapse={onCollapse} />
      )}
      <div className={isSelected ? 'rounded-md shadow-sm' : ''}>
        <TaskListItem
          task={task}
          selected={isSelected}
          onSelect={onSelect}
          hideStreamLabel={hideStreamLabel}
        />
        {isSelected && <TaskDetail taskItem={task} />}
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
