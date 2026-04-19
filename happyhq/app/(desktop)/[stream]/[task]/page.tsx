import { TaskPanelView } from '@/components/features/desktop/panels/task'
import { displayTitle } from '@/lib/format'
import { taskPath } from '@/lib/fs/paths'
import {
  listChats,
  readStreamContent,
  readTaskContent,
  streamExists,
} from '@/lib/fs/read.server'
import { readTaskMd } from '@/lib/fs/task-md.server'
import { desktopDataKey } from '@/lib/swr-keys'
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
  return {
    title: `${displayTitle(taskMd?.frontmatter.title ?? null, task)} | HappyHQ`,
  }
}

// Note: there is no loading.tsx in this directory — intentionally deleted.
// Without it, Next.js keeps the old page visible during navigation instead
// of showing a blank gap. This works because the server reads are fast
// (local filesystem, ~5ms). If you ever add remote data sources here,
// add a loading.tsx with a proper skeleton instead of returning null.
export default async function TaskDesktopRoute({
  params,
}: {
  params: Promise<{ stream: string; task: string }>
}) {
  const { stream, task } = await params
  if (!(await streamExists(stream))) redirect('/tasks')

  const [streamContent, taskContent, chats] = await Promise.all([
    readStreamContent(stream),
    readTaskContent(task).then((r) => r ?? null),
    listChats(stream),
  ])

  return (
    <SWRConfig
      value={{
        fallback: {
          [desktopDataKey(stream, task)]: { streamContent, taskContent, chats },
        },
      }}
    >
      <TaskPanelView />
    </SWRConfig>
  )
}
