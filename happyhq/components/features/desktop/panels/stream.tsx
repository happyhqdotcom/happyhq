'use client'

import { useTrackRecentStream } from '@/hooks/use-track-recent'
import { useSidebarOpen, useStreamSlug } from '@/stores/desktopStore'
import { useOpenWindowIds, useWindowStore } from '@/stores/windowStore'
import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { StreamPanel } from '../../streams/panel'
import {
  useDesktopError,
  useDesktopLoading,
  useStreamContent,
  useStreamTitle,
} from '../hooks/use-desktop-data'
import { useOpenPanel } from '../hooks/use-open-panel'
import { openInteractiveChatWindow } from '../windows/chat/open-chat-window'
import { useWindowActions } from '../windows/use-window-actions'

/**
 * Stream panel with scoped auto-behaviors.
 * Rendered by the stream page route, wrapped in SWRConfig fallback.
 */
export function StreamPanelView() {
  const streamSlug = useStreamSlug()
  const streamTitle = useStreamTitle()
  useTrackRecentStream(streamSlug || undefined, streamTitle)

  const streamContent = useStreamContent()
  const streamLoading = useDesktopLoading()
  const streamError = useDesktopError()
  const openWindowIds = useOpenWindowIds()
  const router = useRouter()

  // Window actions + sidebar state from hooks (no props needed)
  const { openFileWindow, openDirectoryWindow, openOrFocusWindow } =
    useWindowActions()
  const openPanel = useOpenPanel()
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen(openPanel.type)

  // Auto-open a chat window in learning mode for empty streams.
  // Fires once: when stream data arrives and reveals no playbook content.
  const didAutoOpenChat = useRef(false)
  useEffect(() => {
    if (didAutoOpenChat.current) return
    if (!streamContent || streamLoading) return
    if ((streamContent.playbookBody ?? '').trim()) return
    if (openWindowIds.length > 0) return
    didAutoOpenChat.current = true
    const windowId = openInteractiveChatWindow(streamSlug, {
      initialMode: 'learning',
    })
    // Auto-maximize the chat window
    const canvas = document.querySelector('[data-desktop-canvas]')
    if (canvas) {
      useWindowStore
        .getState()
        .toggleMaximize(windowId, canvas.getBoundingClientRect())
    }
  }, [streamContent, streamLoading, openWindowIds, streamSlug])

  // 404 redirect
  useEffect(() => {
    if (streamError?.status === 404) {
      router.replace('/tasks')
    }
  }, [streamError, router])

  // Defense in depth — SWRConfig fallback should make this unreachable
  if (streamLoading) return null

  return (
    <StreamPanel
      openFileWindow={openFileWindow}
      openDirectoryWindow={openDirectoryWindow}
      openOrFocusWindow={openOrFocusWindow}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
    />
  )
}
