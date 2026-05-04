'use client'

import type { ChatHistoryData } from '@/lib/chat/load-history.server'
import type { ChatEntry } from '@/lib/fs/types'
import { desktopDataKey } from '@/lib/swr-keys'
import { useDesktopStore } from '@/stores/desktopStore'
import { useStreamsStore } from '@/stores/streamsStore'
import { useLayoutEffect } from 'react'
import { mutate as globalMutate } from 'swr'
import { ChatSessionProvider } from '../desktop/providers/chat-session-provider'
import { ChatPageContent } from './chat-page-content'

/**
 * Lightweight shell for the /chat/[id] page.
 *
 * Seeds desktopStore with just the stream slug and chats list so that
 * ChatSessionProvider and useChatActions work without the full
 * DesktopDataProvider (no SWR polling, window store, or run machinery).
 *
 * The parent page component sets key={sessionId} on this component,
 * so it always mounts fresh when navigating between chats.
 */
export function ChatPageShell({
  streamSlug,
  sessionId,
  chats,
  initialHistory,
}: {
  streamSlug: string | null
  sessionId: string
  chats: ChatEntry[]
  initialHistory: ChatHistoryData
}) {
  useLayoutEffect(() => {
    useDesktopStore.getState().reset()
    if (streamSlug) {
      useDesktopStore.getState().setSelectedStream(streamSlug)
      // Seed SWR cache with chats so useChatsList() returns data
      // even without the full DesktopDataProvider.
      globalMutate(desktopDataKey(streamSlug), { chats } as any, false)
      useStreamsStore.getState().setActiveStreamSlug(streamSlug)
    }
  }, [])

  return (
    <ChatSessionProvider
      initialSessionId={sessionId}
      initialHistory={initialHistory}
    >
      <ChatPageContent sessionId={sessionId} originStreamSlug={streamSlug} />
    </ChatSessionProvider>
  )
}
