'use client'

import { ErrorBoundary } from '@/components/common/ui/error-boundary'
import { WorkspaceErrorState } from '@/components/common/ui/workspace-error-state'
import { useRunActions, useStreamSlug } from '@/stores/desktopStore'
import { useOpenWindowIds } from '@/stores/windowStore'
import type { RefObject } from 'react'
import { TaskSetupChecklist } from '../chat/interaction/task-setup-checklist'
import { CANVAS_GRID_OVERLAY } from './constants'
import {
  useDesktopError,
  useDesktopLoading,
  useTaskStatus,
} from './hooks/use-desktop-data'
import { useOpenPanel } from './hooks/use-open-panel'
import { DynamicIsland } from './island/dynamic-island'
import { DesktopWindow } from './windows/desktop-window'

interface DesktopCanvasProps {
  canvasRef: RefObject<HTMLDivElement | null>
  openFileWindow: (entry: {
    name: string
    title?: string
    path: string
    rawPath?: string | null
  }) => void
  islandHidden: boolean
}

export function DesktopCanvas({
  canvasRef,
  openFileWindow,
  islandHidden,
}: DesktopCanvasProps) {
  const streamSlug = useStreamSlug()
  const desktopLoading = useDesktopLoading()
  const desktopError = useDesktopError()
  const openWindowIds = useOpenWindowIds()

  const showCanvasLoading = streamSlug && desktopLoading
  const showCanvasError =
    streamSlug && desktopError && desktopError.status !== 404

  return (
    <div
      ref={canvasRef}
      data-desktop-canvas
      className="relative flex min-w-0 flex-1 overflow-hidden rounded-2xl border border-black/5 bg-black/5"
    >
      <ErrorBoundary fallback={<WorkspaceErrorState />}>
        <div className="absolute inset-0" style={CANVAS_GRID_OVERLAY} />

        {showCanvasLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-black/10 border-t-black/40" />
          </div>
        )}
        {showCanvasError && !showCanvasLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center">
            <p className="text-sm text-black/40">Something went wrong.</p>
          </div>
        )}

        <CanvasEmptyState />

        {openWindowIds.map((id) => (
          <DesktopWindow
            key={id}
            id={id}
            canvasRef={canvasRef}
            openFileWindow={openFileWindow}
          />
        ))}

        <CanvasIsland islandHidden={islandHidden} />
      </ErrorBoundary>
    </div>
  )
}

// ── Empty state — extensible per content type ─────────────────────────

function CanvasEmptyState() {
  const openPanel = useOpenPanel()
  const desktopLoading = useDesktopLoading()
  const taskStatus = useTaskStatus()
  const runActions = useRunActions()

  // Task idle state — show setup checklist.
  // Wait for data to load first (canvas is in the shell, outside the page's
  // SWRConfig fallback, so useSWR returns undefined until the fetch completes).
  if (
    openPanel.type === 'task' &&
    !desktopLoading &&
    taskStatus === null &&
    !runActions.upgradeNeeded
  ) {
    return (
      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
        <div className="pointer-events-auto">
          <TaskSetupChecklist />
        </div>
      </div>
    )
  }

  // Future: stream empty state, chat empty state, etc.

  return null
}

// ── Island — positioned at bottom of canvas ───────────────────────────

function CanvasIsland({ islandHidden }: { islandHidden: boolean }) {
  const openPanel = useOpenPanel()
  const taskStatus = useTaskStatus()

  // Island is hidden when: manually hidden, no panel open, or no active run content
  const hasContent =
    openPanel.type === 'task' &&
    taskStatus != null &&
    taskStatus !== 'plan_ready' &&
    taskStatus !== 'completed' &&
    taskStatus !== 'stopped'
  const hidden = islandHidden || openPanel.type === 'empty' || !hasContent

  return (
    <div
      className={`pointer-events-none absolute inset-x-0 bottom-4 z-1000 flex flex-col items-center gap-2 transition-all duration-200 ${hidden ? 'translate-y-4 opacity-0' : ''}`}
    >
      <div className="pointer-events-auto w-full max-w-3xl px-6">
        <DynamicIsland />
      </div>
    </div>
  )
}
