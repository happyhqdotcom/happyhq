import { TaskPanelView } from '@/components/features/desktop/panels/task'
import { displayTitle } from '@/lib/format'
import { taskPath } from '@/lib/fs/paths'
import { readTaskContent } from '@/lib/fs/read.server'
import { readTaskMd } from '@/lib/fs/task-md.server'
import { desktopDataKey } from '@/lib/swr-keys'
import type { Metadata } from 'next'
import { SWRConfig } from 'swr'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ task: string }>
}): Promise<Metadata> {
  const { task } = await params
  const taskMd = await readTaskMd(taskPath(task))
  return {
    title: `${displayTitle(taskMd?.frontmatter.title ?? null, task)} | HappyHQ`,
  }
}

export default async function StreamlessTaskRoute({
  params,
}: {
  params: Promise<{ task: string }>
}) {
  const { task } = await params
  const taskContent = (await readTaskContent(task)) ?? null

  return (
    <SWRConfig
      value={{
        fallback: {
          [desktopDataKey(null, task)]: {
            streamContent: null,
            taskContent,
            chats: [],
          },
        },
      }}
    >
      <TaskPanelView />
    </SWRConfig>
  )
}
