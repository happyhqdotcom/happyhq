'use client'

import { PanelToggleIcon } from '@/components/common/icons/panel-toggle-icon'
import { Button } from '@/components/common/ui/button'
import { AnimatePresence, motion } from 'framer-motion'
import { ReactNode, useEffect, useRef, useState } from 'react'

const PANEL_WIDTH = 350
const PANEL_SLIDE_DISTANCE = 370
const PEEKABOO_RAIL_WIDTH = 12
const PEEKABOO_PANEL_PADDING = 32
const PEEKABOO_HIDE_DELAY = 300

const SPRING_CONFIG = {
  type: 'spring' as const,
  damping: 30,
  stiffness: 300,
}

const NAVBAR_HEIGHT = 44

// ---------------------------------------------------------------------------
// PanelPeekaboo — hover-triggered overlay panel
// ---------------------------------------------------------------------------

interface PanelPeekabooProps {
  side: 'left' | 'right'
  title: string
  isVisible: boolean
  onVisibilityChange: (visible: boolean) => void
  onLock: () => void
  children?: ReactNode
}

export function PanelPeekaboo({
  side,
  title,
  isVisible,
  onVisibilityChange,
  onLock,
  children,
}: PanelPeekabooProps) {
  const hideTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isLeft = side === 'left'

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const scheduleHide = () => {
    clearHideTimer()
    hideTimerRef.current = setTimeout(() => {
      onVisibilityChange(false)
    }, PEEKABOO_HIDE_DELAY)
  }

  const handleRailEnter = () => {
    clearHideTimer()
    onVisibilityChange(true)
  }

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isVisible) {
        onVisibilityChange(false)
      }
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isVisible, onVisibilityChange])

  useEffect(() => {
    return () => clearHideTimer()
  }, [])

  const railPositionClass = isLeft ? 'left-0' : 'right-0'
  const panelPositionClass = isLeft ? 'left-0' : 'right-0'
  const slideFrom = isLeft ? -PANEL_SLIDE_DISTANCE : PANEL_SLIDE_DISTANCE

  return (
    <>
      {/* Invisible hover rail */}
      <div
        className={`fixed z-40 ${railPositionClass}`}
        style={{
          width: PEEKABOO_RAIL_WIDTH,
          top: `${NAVBAR_HEIGHT}px`,
          height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
        }}
        onMouseEnter={handleRailEnter}
        aria-hidden="true"
      />

      {/* Sliding panel */}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            className={`fixed z-50 flex items-center ${panelPositionClass}`}
            style={{
              paddingTop: PEEKABOO_PANEL_PADDING,
              paddingBottom: PEEKABOO_PANEL_PADDING,
              top: `${NAVBAR_HEIGHT}px`,
              height: `calc(100vh - ${NAVBAR_HEIGHT}px)`,
            }}
            initial={{ x: slideFrom }}
            animate={{ x: 0 }}
            exit={{ x: slideFrom }}
            transition={SPRING_CONFIG}
            onMouseEnter={clearHideTimer}
            onMouseLeave={scheduleHide}
          >
            <PanelContainer isLocked={false} side={side}>
              <PanelHeader
                title={title}
                isLocked={false}
                side={side}
                onToggleLock={onLock}
              />
              <PanelBody>{children}</PanelBody>
            </PanelContainer>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

// ---------------------------------------------------------------------------
// Locked inline panel — pushes content aside
// ---------------------------------------------------------------------------

interface PanelLockedProps {
  side: 'left' | 'right'
  title: string
  onUnlock: () => void
  children?: ReactNode
}

export function PanelLocked({
  side,
  title,
  onUnlock,
  children,
}: PanelLockedProps) {
  return (
    <PanelContainer isLocked={true} side={side}>
      <PanelHeader
        title={title}
        isLocked={true}
        side={side}
        onToggleLock={onUnlock}
      />
      <PanelBody>{children}</PanelBody>
    </PanelContainer>
  )
}

// ---------------------------------------------------------------------------
// PanelContainer — styling wrapper
// ---------------------------------------------------------------------------

function PanelContainer({
  isLocked,
  side,
  children,
}: {
  isLocked: boolean
  side: 'left' | 'right'
  children: ReactNode
}) {
  const isLeft = side === 'left'

  const containerRounding = isLocked
    ? 'rounded-t-2xl'
    : isLeft
      ? 'rounded-r-2xl'
      : 'rounded-l-2xl'

  return (
    <motion.div
      layoutId={`${side}-panel`}
      layout="position"
      className={`flex h-full flex-col overflow-hidden ${containerRounding} ${
        isLocked
          ? 'border-x border-t border-black/5 bg-black/10'
          : 'border border-zinc-300/80 bg-white shadow-2xl'
      }`}
      style={{ width: PANEL_WIDTH }}
      transition={SPRING_CONFIG}
    >
      {children}
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// PanelHeader — title + pin/hide toggle
// ---------------------------------------------------------------------------

function PanelHeader({
  title,
  isLocked,
  side,
  onToggleLock,
}: {
  title: string
  isLocked: boolean
  side: 'left' | 'right'
  onToggleLock: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  const isLeft = side === 'left'

  const headerRounding = isLocked
    ? 'rounded-t-xl'
    : isLeft
      ? 'rounded-tr-2xl'
      : 'rounded-tl-2xl'

  return (
    <div
      className={`flex h-10 shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-100 px-3 ${headerRounding}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <span className="truncate text-sm font-semibold text-zinc-700 select-none">
        {title}
      </span>
      <Button
        variant="ghost"
        size="icon"
        onClick={onToggleLock}
        className="group h-6 w-6 transition-colors hover:bg-zinc-200/40"
        aria-label={isLocked ? `Hide ${title}` : `Pin ${title}`}
      >
        <PanelToggleIcon
          isLocked={isLocked}
          isHovered={isHovered}
          side={side}
          className="text-zinc-600 transition-all will-change-transform group-hover:scale-110 group-active:scale-90"
        />
      </Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PanelBody — scrollable content area
// ---------------------------------------------------------------------------

function PanelBody({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
      {children}
    </div>
  )
}
