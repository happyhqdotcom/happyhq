import { TaskListHome } from '@/components/features/tasks/list/task-list-home'
import { displayTitle } from '@/lib/format'
import { taskPath } from '@/lib/fs/paths'
import { listAllTaskItems, readTaskContent } from '@/lib/fs/read.server'
import { readTaskMd } from '@/lib/fs/task-md.server'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import type { Metadata } from 'next'
import { SWRConfig } from 'swr'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ task: string }>
}): Promise<Metadata> {
  const { task } = await params
  const taskMd = await readTaskMd(taskPath(task))
  const title = displayTitle(taskMd?.frontmatter.title ?? null, task)
  return { title: `${title} | HappyHQ` }
}

export default async function InboxTaskDetailRoute({
  params,
}: {
  params: Promise<{ task: string }>
}) {
  const { task } = await params

  const [tasks, taskContent] = await Promise.all([
    listAllTaskItems(),
    readTaskContent(task).then((r) => r ?? null),
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
      <TaskListHome selectedTask={task} />
    </SWRConfig>
  )
}
