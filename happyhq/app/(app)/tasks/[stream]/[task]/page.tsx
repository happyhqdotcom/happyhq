import { TaskListStream } from '@/components/features/streams/task-list-stream'
import { displayTitle } from '@/lib/format'
import { streamPath, taskPath } from '@/lib/fs/paths'
import { readPlaybookMd } from '@/lib/fs/playbook-md.server'
import {
  listAllTaskItems,
  readTaskContent,
  streamExists,
} from '@/lib/fs/read.server'
import { readTaskMd } from '@/lib/fs/task-md.server'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SWRConfig } from 'swr'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stream: string; task: string }>
}): Promise<Metadata> {
  const { stream, task } = await params
  const taskMd = await readTaskMd(taskPath(task))
  const title = displayTitle(taskMd?.frontmatter.title ?? null, task)
  return { title: `${title} | HappyHQ` }
}

export default async function TaskDetailRoute({
  params,
}: {
  params: Promise<{ stream: string; task: string }>
}) {
  const { stream, task } = await params

  if (!(await streamExists(stream))) {
    redirect('/tasks')
  }

  const [tasks, taskContent, playbook] = await Promise.all([
    listAllTaskItems(),
    readTaskContent(task).then((r) => r ?? null),
    readPlaybookMd(streamPath(stream)),
  ])

  return (
    <SWRConfig
      value={{
        fallback: {
          [taskItemsKey()]: tasks,
          ...(taskContent && { [taskContentKey(task)]: taskContent }),
        },
      }}
    >
      <TaskListStream
        streamSlug={stream}
        streamTitle={playbook?.frontmatter.title ?? null}
        selectedTask={task}
      />
    </SWRConfig>
  )
}
