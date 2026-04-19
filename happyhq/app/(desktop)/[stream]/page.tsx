import { StreamPanelView } from '@/components/features/desktop/panels/stream'
import { displayTitle } from '@/lib/format'
import { streamPath } from '@/lib/fs/paths'
import { readPlaybookMd } from '@/lib/fs/playbook-md.server'
import {
  listChats,
  readStreamContent,
  streamExists,
} from '@/lib/fs/read.server'
import { desktopDataKey } from '@/lib/swr-keys'
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { SWRConfig } from 'swr'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stream: string }>
}): Promise<Metadata> {
  const { stream } = await params
  const playbook = await readPlaybookMd(streamPath(stream))
  return {
    title: `${displayTitle(playbook?.frontmatter.title ?? null, stream)} | HappyHQ`,
  }
}

// Note: no loading.tsx — old page stays visible during navigation.
// See [task]/page.tsx for rationale.
export default async function StreamDesktopRoute({
  params,
}: {
  params: Promise<{ stream: string }>
}) {
  const { stream } = await params
  if (!(await streamExists(stream))) redirect('/tasks')

  const [streamContent, chats] = await Promise.all([
    readStreamContent(stream),
    listChats(stream),
  ])

  return (
    <SWRConfig
      value={{
        fallback: {
          [desktopDataKey(stream)]: {
            streamContent,
            taskContent: null,
            chats,
          },
        },
      }}
    >
      <StreamPanelView />
    </SWRConfig>
  )
}
