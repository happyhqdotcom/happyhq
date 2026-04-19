import { ChatPageShell } from '@/components/features/chat/chat-page-shell'
import { loadChatHistory } from '@/lib/chat/load-history.server'
import { findStreamForSession, listChats } from '@/lib/fs/read.server'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const result = await findStreamForSession(id)
  if (!result) return { title: 'Chat Not Found | HappyHQ' }
  return {
    title: `${result.chat.name ?? 'Chat'} | HappyHQ`,
  }
}

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const result = await findStreamForSession(id)
  if (!result) notFound()

  const [history, chats] = await Promise.all([
    loadChatHistory(id),
    result.streamName
      ? listChats(result.streamName)
      : Promise.resolve([result.chat]),
  ])

  return (
    <ChatPageShell
      key={id}
      streamSlug={result.streamName}
      sessionId={id}
      chats={chats}
      initialHistory={history}
    />
  )
}
