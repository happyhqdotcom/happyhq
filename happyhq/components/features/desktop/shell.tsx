'use client'

import { ErrorBoundary } from '@/components/common/ui/error-boundary'
import { WorkspaceErrorState } from '@/components/common/ui/workspace-error-state'
import { CommandMenu } from '@/components/features/command-menu/command-menu'
import { useCommandMenuStore } from '@/stores/commandMenuStore'
import {
  restoreShellState,
  useDesktopExpanded,
  useIslandHidden,
  useSidebarOpen,
} from '@/stores/desktopStore'
import { useWindowStore } from '@/stores/windowStore'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { DesktopCanvas } from './canvas'
import { FooterBar } from './footer'
import { HeaderBar } from './header'
import { useDesktopError, useTaskStatus } from './hooks/use-desktop-data'
import { useOpenPanel } from './hooks/use-open-panel'
import { useDesktopWindows } from './windows/use-desktop-windows'

/**
 * Persistent desktop chrome — header, footer, canvas, and panel container.
 * Stays mounted across navigations within the (desktop) route group.
 *
 * Panel *content* is rendered by each page route as {children}, wrapped in
 * SWRConfig fallback so data is available on the very first render (no flash).
 */
export function DesktopShell({ children }: { children: ReactNode }) {
  const openPanel = useOpenPanel()
  const desktopError = useDesktopError()
  const taskStatus = useTaskStatus()

  // ── Global keyboard shortcuts ─────────────────────────────────────
  const toggle = useCommandMenuStore((s) => s.toggle)
  const isMenuOpen = useCommandMenuStore((s) => s.isOpen)
  const router = useRouter()
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        (e.target as HTMLElement)?.isContentEditable

      // `/` — toggle command palette
      if (
        e.key === '/' &&
        !isEditable &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey
      ) {
        e.preventDefault()
        toggle()
        return
      }

      // Escape — close open panel (only when nothing else captures it)
      if (
        e.key === 'Escape' &&
        !isMenuOpen &&
        !isEditable &&
        openPanel.type !== 'empty'
      ) {
        e.preventDefault()
        router.push('/desktop')
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [toggle, isMenuOpen, openPanel.type, router])

  // ── Shell layout state (persisted in store across navigations) ────
  // Restore from sessionStorage on mount — runs once, CSS transitions
  // make the state change smooth rather than a flash.
  useEffect(() => restoreShellState(), [])

  const [desktopExpanded, setDesktopExpanded] = useDesktopExpanded()
  const [islandHidden, setIslandHidden] = useIslandHidden()

  const [sidebarOpen] = useSidebarOpen(openPanel.type)

  // ── Windows ───────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLDivElement>(null)
  const { openOrFocusWindow, openFileWindow, openDirectoryWindow } =
    useDesktopWindows(canvasRef)

  // Keep stored canvas size in sync so useDesktopWindows() and WindowFrame's
  // drag bounds work without each consumer needing its own ResizeObserver.
  const setCanvasSize = useWindowStore((s) => s.setCanvasSize)
  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      setCanvasSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [setCanvasSize])

  // ── Derived layout ────────────────────────────────────────────────
  const showPanel = openPanel.type !== 'empty'
  const showQuickOpen = openPanel.type === 'empty'
  const panelWidth = sidebarOpen ? 'w-[720px]' : 'w-[512px]'
  const panelNegMargin = sidebarOpen ? '-ml-[720px]' : '-ml-[512px]'
  const panelPadding =
    (showPanel || showQuickOpen) && !desktopExpanded
      ? sidebarOpen
        ? 'pl-[721px]'
        : 'pl-[513px]'
      : ''

  const islandHasContent =
    openPanel.type === 'task' &&
    taskStatus != null &&
    (taskStatus === 'discovering' ||
      taskStatus === 'planning' ||
      taskStatus === 'working')

  if (desktopError?.status === 404) return null

  return (
    <div className="relative flex h-screen flex-col">
      {/* ── Command Menu ───────────────────────────────────────────── */}
      <CommandMenu />

      {/* ── Left panel slot ───────────────────────────────────────── */}
      {showPanel ? (
        <div
          className={`absolute left-0 z-10 flex flex-col pr-px pl-1.5 transition-[margin,width] duration-200 ease-in-out ${desktopExpanded ? panelNegMargin : 'ml-0'} ${panelWidth}`}
          style={{ top: 'calc(2.25rem)', bottom: 'calc(2.25rem)' }}
        >
          <ErrorBoundary fallback={<WorkspaceErrorState />}>
            {children}
          </ErrorBoundary>
        </div>
      ) : showQuickOpen ? (
        <div
          className={`absolute left-0 z-10 flex w-[512px] flex-col items-center justify-center pr-px pl-1.5 transition-[margin] duration-200 ease-in-out ${desktopExpanded ? '-ml-[512px]' : 'ml-0'}`}
          style={{ top: 'calc(2.25rem)', bottom: 'calc(2.25rem)' }}
        >
          <ErrorBoundary fallback={<WorkspaceErrorState />}>
            {children}
          </ErrorBoundary>
        </div>
      ) : null}

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden pr-1.5 pl-1.5 transition-[padding] duration-200 ease-in-out">
        <HeaderBar
          expanded={desktopExpanded}
          onExpandToggle={() => setDesktopExpanded(!desktopExpanded)}
        />

        <div
          className={`flex min-h-0 flex-1 gap-1 transition-[padding] duration-200 ease-in-out ${panelPadding}`}
        >
          <DesktopCanvas
            canvasRef={canvasRef}
            openFileWindow={openFileWindow}
            islandHidden={islandHidden}
          />
        </div>

        <FooterBar
          openDirectoryWindow={openDirectoryWindow}
          openOrFocusWindow={openOrFocusWindow}
          islandHasContent={islandHasContent}
          islandHidden={islandHidden}
          onIslandHiddenChange={setIslandHidden}
        />
      </div>
    </div>
  )
}
