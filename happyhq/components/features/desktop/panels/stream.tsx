'use client'

import { useTrackRecentStream } from '@/hooks/use-track-recent'
import { useSidebarOpen, useStreamSlug } from '@/stores/desktopStore'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { StreamPanel } from '../../streams/panel'
import {
  useDesktopError,
  useDesktopLoading,
  useStreamTitle,
} from '../hooks/use-desktop-data'
import { useOpenPanel } from '../hooks/use-open-panel'
import { useWindowActions } from '../windows/use-window-actions'

/**
 * Stream panel with scoped auto-behaviors.
 * Rendered by the stream page route, wrapped in SWRConfig fallback.
 */
export function StreamPanelView() {
  const streamSlug = useStreamSlug()
  const streamTitle = useStreamTitle()
  useTrackRecentStream(streamSlug || undefined, streamTitle)

  const streamLoading = useDesktopLoading()
  const streamError = useDesktopError()
  const router = useRouter()

  // Window actions + sidebar state from hooks (no props needed)
  const { openFileWindow, openDirectoryWindow, openOrFocusWindow } =
    useWindowActions()
  const openPanel = useOpenPanel()
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen(openPanel.type)

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
