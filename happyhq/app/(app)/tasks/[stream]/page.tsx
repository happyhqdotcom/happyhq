import { TaskListStream } from '@/components/features/streams/task-list-stream'
import { displayTitle } from '@/lib/format'
import { streamPath } from '@/lib/fs/paths'
import { readPlaybookMd } from '@/lib/fs/playbook-md.server'
import { listAllTaskItems, streamExists } from '@/lib/fs/read.server'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

// UUID pattern from crypto.randomUUID() used as temp slug during stream creation
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stream: string }>
}): Promise<Metadata> {
  const { stream } = await params
  if (UUID_RE.test(stream)) return { title: 'New Stream | HappyHQ' }
  const playbook = await readPlaybookMd(streamPath(stream))
  const title = displayTitle(playbook?.frontmatter.title ?? null, stream)
  return { title: `${title} | HappyHQ` }
}

export default async function StreamTasksRoute({
  params,
}: {
  params: Promise<{ stream: string }>
}) {
  const { stream } = await params

  if (!(await streamExists(stream))) {
    redirect('/tasks')
  }

  const [tasks, playbook] = await Promise.all([
    listAllTaskItems(),
    readPlaybookMd(streamPath(stream)),
  ])

  return (
    <TaskListStream
      streamSlug={stream}
      streamTitle={playbook?.frontmatter.title ?? null}
      initialTasks={tasks}
    />
  )
}
