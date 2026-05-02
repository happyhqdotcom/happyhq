'use client'

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/common/ui/resizable'
import clsx from 'clsx'
import { motion } from 'framer-motion'
import { notFound } from 'next/navigation'
import { useEffect } from 'react'
import { usePanelRef } from 'react-resizable-panels'

import { BottomPanelContent, BottomTabBar } from './_components/bottom-panel'
import { CanvasHeader } from './_components/canvas-header'
import { ComponentBrowser } from './_components/component-browser'
import { ControlsPanel } from './_components/controls-panel'
import { PlaygroundNavbar } from './_components/navbar'
import { PanelLocked, PanelPeekaboo } from './_components/panel-peekaboo'
import { usePlaygroundStore } from './_components/playground-store'
import { findComponent, PLAYGROUND_COMPONENTS } from './_registry'

const NAVBAR_HEIGHT = 44
const PANEL_WIDTH = 350

const SPRING_CONFIG = {
  type: 'spring' as const,
  damping: 30,
  stiffness: 300,
}

export default function PlaygroundLayout({
  children,
}: {
  children: React.ReactNode
}) {
  if (process.env.NODE_ENV !== 'development') {
    notFound()
  }

  // Bottom panel
  const bottomPanelRef = usePanelRef()
  const bottomPanelOpen = usePlaygroundStore((s) => s.bottomPanelOpen)
  const setBottomPanelOpen = usePlaygroundStore((s) => s.setBottomPanelOpen)

  useEffect(() => {
    const panel = bottomPanelRef.current
    if (!panel) return
    if (bottomPanelOpen && panel.isCollapsed()) {
      panel.expand()
    } else if (!bottomPanelOpen && !panel.isCollapsed()) {
      panel.collapse()
    }
  }, [bottomPanelOpen, bottomPanelRef])

  // Panels
  const leftPanel = usePlaygroundStore((s) => s.leftPanel)
  const rightPanel = usePlaygroundStore((s) => s.rightPanel)
  const setLeftPanel = usePlaygroundStore((s) => s.setLeftPanel)
  const setRightPanel = usePlaygroundStore((s) => s.setRightPanel)

  const selectedId = usePlaygroundStore((s) => s.selectedComponent)
  const component = selectedId ? (findComponent(selectedId) ?? null) : null

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-stone-200 px-1">
      <PlaygroundNavbar />

      <div
        className="relative z-1 flex max-w-screen gap-1 overflow-hidden"
        style={{ height: `calc(100svh - ${NAVBAR_HEIGHT}px)` }}
      >
        {/* Left panel — locked inline or peekaboo */}
        {leftPanel.isLocked && (
          <motion.div
            className="shrink-0"
            animate={{ width: PANEL_WIDTH }}
            transition={SPRING_CONFIG}
          >
            <PanelLocked
              side="left"
              title="Components"
              onUnlock={() =>
                setLeftPanel({ isLocked: false, isPeekabooVisible: true })
              }
            >
              <ComponentBrowser components={PLAYGROUND_COMPONENTS} />
            </PanelLocked>
          </motion.div>
        )}
        {!leftPanel.isLocked && (
          <PanelPeekaboo
            side="left"
            title="Components"
            isVisible={leftPanel.isPeekabooVisible}
            onVisibilityChange={(visible) =>
              setLeftPanel({ isPeekabooVisible: visible })
            }
            onLock={() => setLeftPanel({ isLocked: true })}
          >
            <ComponentBrowser components={PLAYGROUND_COMPONENTS} />
          </PanelPeekaboo>
        )}

        {/* Center — canvas + bottom panel. layout prop animates resize when panels lock/unlock */}
        <motion.div
          layout
          transition={SPRING_CONFIG}
          className={clsx(
            'flex min-w-0 flex-1 flex-col',
            'overflow-hidden rounded-t-2xl',
            'border-x border-t border-black/5',
            'bg-black/10',
          )}
        >
          <CanvasHeader component={component} />
          <ResizablePanelGroup orientation="vertical">
            <ResizablePanel defaultSize="75%" minSize="30%">
              {children}
            </ResizablePanel>
            <ResizableHandle className="h-px bg-zinc-200/80 after:hidden" />
            <ResizablePanel
              panelRef={bottomPanelRef}
              defaultSize="25%"
              minSize="10%"
              collapsible
              onResize={(size, _id, prevSize) => {
                if (!prevSize) return
                if (prevSize.asPercentage > 0 && size.asPercentage === 0) {
                  setBottomPanelOpen(false)
                } else if (
                  prevSize.asPercentage === 0 &&
                  size.asPercentage > 0
                ) {
                  setBottomPanelOpen(true)
                }
              }}
            >
              <BottomPanelContent />
            </ResizablePanel>
          </ResizablePanelGroup>
          <BottomTabBar />
        </motion.div>

        {/* Right panel — locked inline or peekaboo */}
        {rightPanel.isLocked && (
          <motion.div
            className="h-full shrink-0"
            animate={{ width: PANEL_WIDTH }}
            transition={SPRING_CONFIG}
          >
            <PanelLocked
              side="right"
              title="Inspector"
              onUnlock={() =>
                setRightPanel({ isLocked: false, isPeekabooVisible: true })
              }
            >
              {component ? (
                <ControlsPanel component={component} />
              ) : (
                <div className="flex h-32 items-center justify-center px-4">
                  <p className="text-center text-xs text-zinc-400">
                    Select a component to inspect
                  </p>
                </div>
              )}
            </PanelLocked>
          </motion.div>
        )}
        {!rightPanel.isLocked && (
          <PanelPeekaboo
            side="right"
            title="Inspector"
            isVisible={rightPanel.isPeekabooVisible}
            onVisibilityChange={(visible) =>
              setRightPanel({ isPeekabooVisible: visible })
            }
            onLock={() => setRightPanel({ isLocked: true })}
          >
            {component ? (
              <ControlsPanel component={component} />
            ) : (
              <div className="flex h-32 items-center justify-center px-4">
                <p className="text-center text-xs text-zinc-400">
                  Select a component to inspect
                </p>
              </div>
            )}
          </PanelPeekaboo>
        )}
      </div>
    </div>
  )
}
