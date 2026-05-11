'use client'

import { useTrackRecentTask } from '@/hooks/use-track-recent'
import { useSidebarOpen, useStreamSlug } from '@/stores/desktopStore'
import { useWindowStore } from '@/stores/windowStore'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { TaskPanel } from '../../tasks/panel'
import { PLAN_WINDOW_ID } from '../constants'
import {
  useActiveTask,
  useDesktopError,
  useDesktopLoading,
  useTaskContent,
  useTaskStatus,
} from '../hooks/use-desktop-data'
import { useOpenPanel } from '../hooks/use-open-panel'
import { useWindowActions } from '../windows/use-window-actions'

/**
 * Task panel with scoped auto-behaviors.
 * Rendered by the task page route, wrapped in SWRConfig fallback.
 */
export function TaskPanelView() {
  const loading = useDesktopLoading()
  const streamSlug = useStreamSlug()
  const params = useParams<{ stream?: string; task?: string }>()
  const activeTaskSlug = params.task
  const activeTask = useActiveTask()
  // Use the route stream param for recents — not useStreamSlug() which can
  // leak an unrelated selectedStream on streamless /task/[task] routes.
  useTrackRecentTask(
    activeTaskSlug,
    activeTask?.frontmatter.title ?? null,
    params.stream,
  )

  const taskContent = useTaskContent()
  const taskStatus = useTaskStatus()
  const streamError = useDesktopError()
  const router = useRouter()

  // Window actions + sidebar state from hooks (no props needed)
  const { openFileWindow, openOrFocusWindow, updateWindowMeta, planFilePath } =
    useWindowActions()
  const openPanel = useOpenPanel()
  const [sidebarOpen, setSidebarOpen] = useSidebarOpen(openPanel.type)

  // Auto-open settings sidebar for streamless tasks
  useEffect(() => {
    if (!streamSlug) setSidebarOpen(true)
  }, [streamSlug, setSidebarOpen])

  // Auto-open file from sessionStorage handoff (click in (app) task card)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('happyhq:pending-open')
      if (!raw) return
      sessionStorage.removeItem('happyhq:pending-open')
      const entry = JSON.parse(raw) as {
        taskSlug: string
        name: string
        path: string
      }
      if (entry.taskSlug !== activeTaskSlug) return
      if (entry.name && entry.path) {
        openFileWindow(entry)
      }
    } catch {
      // Ignore malformed data
    }
  }, [openFileWindow, activeTaskSlug])

  // Auto-open plan window when status transitions to plan_ready
  const hasPlan = taskContent?.plan != null
  const prevTaskStatusRef = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (prevTaskStatusRef.current === undefined) {
      prevTaskStatusRef.current = taskStatus
      return
    }
    if (
      taskStatus === 'plan_ready' &&
      prevTaskStatusRef.current !== 'plan_ready' &&
      hasPlan
    ) {
      openOrFocusWindow(
        PLAN_WINDOW_ID,
        'plan.md',
        planFilePath,
        taskContent?.plan ?? '',
      )
    }
    prevTaskStatusRef.current = taskStatus
  }, [taskStatus, hasPlan, openOrFocusWindow, planFilePath, taskContent?.plan])

  // Keep plan window content in sync when Q updates plan.md during working.
  // Skip if viewing a historical version (historyLabel is set).
  useEffect(() => {
    if (taskContent?.plan != null) {
      const win = useWindowStore
        .getState()
        .windows.find((w) => w.id === PLAN_WINDOW_ID)
      if (win?.contentType === 'markdown' && win.meta.historyLabel) return
      if (
        win?.contentType === 'markdown' &&
        win.meta.markdown === taskContent.plan
      )
        return
      updateWindowMeta(PLAN_WINDOW_ID, { markdown: taskContent.plan })
    }
  }, [taskContent?.plan, updateWindowMeta])

  // 404 redirect
  useEffect(() => {
    if (streamError?.status === 404) {
      if (streamSlug) {
        router.replace(`/tasks/${encodeURIComponent(streamSlug)}`)
      } else {
        router.replace('/tasks')
      }
    }
  }, [streamError, router, streamSlug])

  // Defense in depth — SWRConfig fallback should make this unreachable
  if (loading) return null

  return (
    <TaskPanel
      openFileWindow={openFileWindow}
      sidebarOpen={sidebarOpen}
      onSidebarOpenChange={setSidebarOpen}
    />
  )
}
