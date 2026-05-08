'use client'

import { useState } from 'react'

import { Badge } from '@/components/common/catalyst/badge'
import { toggleTaskDone } from '@/lib/actions'
import { formatSlug } from '@/lib/format'
import type { RunInfo, TaskItem } from '@/lib/fs/types'
import { taskItemsKey } from '@/lib/swr-keys'
import { LoaderCircle } from 'lucide-react'
import { useSWRConfig } from 'swr'

export function TaskListItem({
  task,
  selected,
  onSelect,
  hideStreamLabel,
}: {
  task: TaskItem
  selected: boolean
  onSelect: () => void
  hideStreamLabel?: boolean
}) {
  const { mutate } = useSWRConfig()
  const { frontmatter, slug } = task
  const isDone = !!frontmatter.completedAt
  const [optimisticDone, setOptimisticDone] = useState(isDone)
  const [lastServerDone, setLastServerDone] = useState(isDone)

  // Sync when server state changes (SWR refetch) — inline setState during render
  if (isDone !== lastServerDone) {
    setLastServerDone(isDone)
    setOptimisticDone(isDone)
  }
  const isRunning =
    task.run?.status === 'discovering' ||
    task.run?.status === 'planning' ||
    task.run?.status === 'working'

  const streamLabel = frontmatter.stream ? formatSlug(frontmatter.stream) : null
  // "Needs clarification" wins over the run-status label so the human-action
  // ask is visible at a glance — discovery has paused itself awaiting answers.
  const statusLabel =
    frontmatter.pending === 'clarification'
      ? ({ text: 'Needs clarification', badgeColor: 'amber' } as const)
      : getRunStatusLabel(task.run?.status, task.run?.stopReason)

  async function handleToggle() {
    const prev = optimisticDone
    setOptimisticDone(!prev)
    try {
      await toggleTaskDone(slug)
      await mutate(taskItemsKey())
    } catch {
      setOptimisticDone(prev)
    }
  }

  return (
    <div
      onClick={onSelect}
      className={`flex h-11 cursor-pointer items-center bg-white px-4 py-2.5 transition-opacity duration-200 ${
        selected ? 'rounded-t-md' : 'rounded-md shadow-sm'
      }`}
    >
      {/* Checkbox */}
      <button
        type="button"
        className="flex min-w-0 grow cursor-pointer items-center gap-3 text-left hover:opacity-75"
        onClick={(e) => {
          e.stopPropagation()
          onSelect()
        }}
      >
        <span
          className="flex size-5 shrink-0 items-center justify-center"
          onClick={(e) => {
            e.stopPropagation()
            if (!isRunning) handleToggle()
          }}
        >
          {isRunning ? (
            <LoaderCircle className="text-muted-foreground size-4 animate-spin" />
          ) : optimisticDone ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-zinc-400 transition-all active:scale-80 active:rotate-6">
              <svg
                className="size-3 text-white"
                viewBox="0 0 12 12"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 6.5L5 9L9.5 3" />
              </svg>
            </span>
          ) : (
            <span className="size-5 rounded-full border border-zinc-300 transition-all hover:border-zinc-400 active:scale-80 active:rotate-6" />
          )}
        </span>

        {/* Title + stream snippet */}
        <div className="flex min-w-0 grow items-center gap-2">
          <span
            className={`truncate text-sm font-medium ${
              optimisticDone
                ? 'text-zinc-400 line-through opacity-70'
                : 'text-zinc-700'
            }`}
          >
            {frontmatter.title}
          </span>

          {streamLabel && !hideStreamLabel && (
            <>
              <span className="text-zinc-400">&bull;</span>
              <span className="shrink-0 truncate text-xs text-zinc-500">
                {streamLabel}
              </span>
            </>
          )}
        </div>

        {/* Right-side badge */}
        {!optimisticDone && statusLabel && (
          <Badge color={statusLabel.badgeColor}>{statusLabel.text}</Badge>
        )}
      </button>
    </div>
  )
}

function getRunStatusLabel(
  status: RunInfo['status'] | undefined,
  stopReason: RunInfo['stopReason'],
): {
  text: string
  badgeColor: 'zinc' | 'blue' | 'amber' | 'orange' | 'violet'
} | null {
  switch (status) {
    case 'discovering':
      return { text: 'Reviewing', badgeColor: 'zinc' }
    case 'planning':
      return { text: 'Planning', badgeColor: 'zinc' }
    case 'working':
      return { text: 'Working', badgeColor: 'zinc' }
    case 'plan_ready':
      return { text: 'Plan ready', badgeColor: 'blue' }
    case 'completed':
      return { text: 'Review', badgeColor: 'blue' }
    case 'stopped':
      return stopReason === 'budget'
        ? { text: 'Paused', badgeColor: 'violet' }
        : { text: 'Stopped', badgeColor: 'amber' }
    default:
      return null
  }
}
