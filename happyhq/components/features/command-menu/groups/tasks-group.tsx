// Tasks Group
// Recent non-completed tasks as command menu items

'use client'

import { displayTitle, formatRelativeTime } from '@/lib/format'
import type { TaskItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskItemsKey } from '@/lib/swr-keys'
import { useCommandMenuStore } from '@/stores/commandMenuStore'
import { useStreams } from '@/stores/streamsStore'
import { ListTodo } from 'lucide-react'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { CommandMenuGroup, CommandMenuItem } from '../atoms'

export function TasksGroup() {
  const { data: tasks = [] } = useSWR<TaskItem[]>(taskItemsKey(), fetcher)
  const streams = useStreams()
  const router = useRouter()
  const close = useCommandMenuStore((s) => s.close)

  const recentTasks = tasks.filter((t) => !t.frontmatter.completedAt)

  if (recentTasks.length === 0) return null

  return (
    <CommandMenuGroup heading="Tasks">
      {recentTasks.map((task) => {
        const streamSlug = task.frontmatter.stream ?? null
        const streamTitle = streamSlug
          ? (streams.find((s) => s.name === streamSlug)?.title ?? null)
          : null

        return (
          <CommandMenuItem
            key={task.slug}
            id={`task-${task.slug}`}
            label={displayTitle(task.frontmatter.title, task.slug)}
            icon={ListTodo}
            action={
              streamSlug
                ? displayTitle(streamTitle, streamSlug)
                : formatRelativeTime(
                    task.run?.lastIterationAt ??
                      task.frontmatter.updatedAt ??
                      task.frontmatter.createdAt,
                  )
            }
            iconColor="ghost"
            keywords={[
              task.slug,
              task.frontmatter.title ?? '',
              streamSlug ?? '',
            ].filter(Boolean)}
            onSelect={() => {
              if (streamSlug) {
                router.push(
                  `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(task.slug)}`,
                )
              } else {
                router.push(`/task/${encodeURIComponent(task.slug)}`)
              }
              close()
            }}
          />
        )
      })}
    </CommandMenuGroup>
  )
}
