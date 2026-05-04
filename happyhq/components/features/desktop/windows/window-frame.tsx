'use client'

import { useWindowStore } from '@/stores/windowStore'
import { motion, useDragControls, useMotionValue } from 'framer-motion'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { type RefObject, useCallback, useEffect, useRef } from 'react'

interface WindowFrameProps {
  id?: string
  title: string
  position: { x: number; y: number }
  zIndex: number
  size: { width: number; height: number }
  onClose: () => void
  onFocus: () => void
  onDragEnd: (position: { x: number; y: number }) => void
  dragConstraintsRef: RefObject<HTMLElement | null>
  navigation?: React.ReactNode
  afterTitle?: React.ReactNode
  actions?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  onResize?: (size: { width: number; height: number }) => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
  onRestoreFromMaximize?: () => void
}

type ResizeEdge =
  | 'top'
  | 'right'
  | 'bottom'
  | 'left'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'corner'

interface ResizeState {
  edge: ResizeEdge
  startX: number
  startY: number
  startWidth: number
  startHeight: number
  startPosX: number
  startPosY: number
}

const MIN_WIDTH = 320
const MIN_HEIGHT = 200

export function WindowFrame({
  id,
  title,
  position,
  zIndex,
  size,
  onClose,
  onFocus,
  onDragEnd,
  dragConstraintsRef,
  navigation,
  afterTitle,
  actions,
  footer,
  children,
  onResize,
  isMaximized,
  onToggleMaximize,
  onRestoreFromMaximize,
}: WindowFrameProps) {
  const controls = useDragControls()
  const x = useMotionValue(position.x)
  const y = useMotionValue(position.y)
  const width = useMotionValue(size.width)
  const height = useMotionValue(size.height)
  const windowRef = useRef<HTMLDivElement>(null)
  const resizeStateRef = useRef<ResizeState | null>(null)
  const resizeAbortRef = useRef<AbortController | null>(null)

  // Sync from store when position/size changes externally (e.g. window reopened, maximize)
  useEffect(() => {
    x.set(position.x)
    y.set(position.y)
  }, [position.x, position.y, x, y])

  useEffect(() => {
    width.set(size.width)
    height.set(size.height)
  }, [size.width, size.height, width, height])

  const handleResizeMove = useCallback(
    (e: PointerEvent) => {
      const state = resizeStateRef.current
      if (!state) return

      const canvas = dragConstraintsRef.current
      const windowEl = windowRef.current
      if (!canvas || !windowEl) return

      const canvasRect = canvas.getBoundingClientRect()
      const windowRect = windowEl.getBoundingClientRect()

      // Max size is bounded by distance from window's left/top edge to canvas right/bottom edge
      const maxWidth = canvasRect.right - windowRect.left
      const maxHeight = canvasRect.bottom - windowRect.top

      const deltaX = e.clientX - state.startX
      const deltaY = e.clientY - state.startY

      const resizesRight =
        state.edge === 'right' ||
        state.edge === 'corner' ||
        state.edge === 'top-right'
      const resizesLeft =
        state.edge === 'left' ||
        state.edge === 'top-left' ||
        state.edge === 'bottom-left'
      const resizesBottom =
        state.edge === 'bottom' ||
        state.edge === 'corner' ||
        state.edge === 'bottom-left'
      const resizesTop =
        state.edge === 'top' ||
        state.edge === 'top-left' ||
        state.edge === 'top-right'

      if (resizesRight) {
        const newWidth = Math.min(
          Math.max(state.startWidth + deltaX, MIN_WIDTH),
          maxWidth,
        )
        width.set(newWidth)
      }

      if (resizesLeft) {
        const newWidth = Math.max(state.startWidth - deltaX, MIN_WIDTH)
        const actualDelta = state.startWidth - newWidth
        width.set(newWidth)
        x.set(state.startPosX + actualDelta)
      }

      if (resizesBottom) {
        const newHeight = Math.min(
          Math.max(state.startHeight + deltaY, MIN_HEIGHT),
          maxHeight,
        )
        height.set(newHeight)
      }

      if (resizesTop) {
        const newHeight = Math.max(state.startHeight - deltaY, MIN_HEIGHT)
        const actualDelta = state.startHeight - newHeight
        height.set(newHeight)
        y.set(state.startPosY + actualDelta)
      }
    },
    [dragConstraintsRef, width, height, x, y],
  )

  const handleResizeEnd = useCallback(
    (e: PointerEvent) => {
      resizeStateRef.current = null
      document.body.style.userSelect = ''
      ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
      resizeAbortRef.current?.abort()
      resizeAbortRef.current = null
      onResize?.({ width: width.get(), height: height.get() })
      onDragEnd({ x: x.get(), y: y.get() })
    },
    [onResize, onDragEnd, width, height, x, y],
  )

  const handleResizeStart = useCallback(
    (edge: ResizeEdge, e: React.PointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      ;(e.target as Element).setPointerCapture(e.pointerId)
      onFocus()

      // If maximized, restore first, then use restored size as starting size
      if (isMaximized && onRestoreFromMaximize) {
        onRestoreFromMaximize()
      }

      resizeStateRef.current = {
        edge,
        startX: e.clientX,
        startY: e.clientY,
        startWidth: width.get(),
        startHeight: height.get(),
        startPosX: x.get(),
        startPosY: y.get(),
      }

      document.body.style.userSelect = 'none'
      // Defensive: abort any in-flight resize before starting a new one, so a
      // double pointerdown can't leak the previous gesture's listeners.
      resizeAbortRef.current?.abort()
      const controller = new AbortController()
      resizeAbortRef.current = controller
      document.addEventListener('pointermove', handleResizeMove, {
        signal: controller.signal,
      })
      document.addEventListener('pointerup', handleResizeEnd, {
        signal: controller.signal,
      })
    },
    [
      onFocus,
      isMaximized,
      onRestoreFromMaximize,
      width,
      height,
      handleResizeMove,
      handleResizeEnd,
    ],
  )

  return (
    <motion.div
      ref={windowRef}
      drag
      dragMomentum={false}
      dragListener={false}
      dragControls={controls}
      dragConstraints={dragConstraintsRef}
      style={
        isMaximized
          ? { zIndex, inset: 0, width: '100%', height: '100%' }
          : { x, y, zIndex, width, height }
      }
      onDragEnd={() => {
        document.body.style.userSelect = ''
        onDragEnd({ x: x.get(), y: y.get() })
      }}
      onPointerDown={onFocus}
      className={`absolute top-0 left-0 flex flex-col overflow-hidden bg-white shadow-lg ring-1 ring-zinc-950/10 ${isMaximized ? 'rounded-t-xl' : 'rounded-t-xl rounded-b-[30px]'}`}
    >
      {/* Title bar — drag handle */}
      <div
        onPointerDown={(e) => {
          // Ignore pointer events from title bar buttons (close, maximize, etc.)
          if ((e.target as Element).closest('button')) return
          e.preventDefault()

          if (isMaximized && onRestoreFromMaximize) {
            // Don't restore immediately — wait for actual pointer movement
            // so a plain click on the header doesn't unmaximize.
            const startX = e.clientX
            const startY = e.clientY
            const DRAG_THRESHOLD = 3

            const onMove = (moveEvent: PointerEvent) => {
              const dx = moveEvent.clientX - startX
              const dy = moveEvent.clientY - startY
              if (
                Math.abs(dx) < DRAG_THRESHOLD &&
                Math.abs(dy) < DRAG_THRESHOLD
              )
                return

              // Pointer moved — restore from maximize, then start drag
              document.removeEventListener('pointermove', onMove)
              document.removeEventListener('pointerup', onUp)

              onRestoreFromMaximize()
              const store = useWindowStore.getState()
              const win = store.windows.find((w) => w.id === id)
              if (win) {
                x.set(win.position.x)
                y.set(win.position.y)
                width.set(win.size.width)
                height.set(win.size.height)
              }
              document.body.style.userSelect = 'none'
              controls.start(e)
            }

            const onUp = () => {
              // Click without drag — stay maximized
              document.removeEventListener('pointermove', onMove)
              document.removeEventListener('pointerup', onUp)
            }

            document.addEventListener('pointermove', onMove)
            document.addEventListener('pointerup', onUp)
            return
          }
          document.body.style.userSelect = 'none'
          controls.start(e)
        }}
        onDoubleClick={onToggleMaximize}
        className={`flex h-10 shrink-0 cursor-default items-center justify-between border-b border-zinc-200 bg-zinc-50 pr-2 ${navigation ? 'pl-2' : 'pl-4'}`}
      >
        <div
          className="flex max-w-72 min-w-0 items-center gap-1.5"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {navigation}
          <span className="text-xs font-medium text-zinc-400 select-none">
            {title}
          </span>
          {afterTitle}
        </div>
        <div
          className="flex items-center gap-0.5"
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {actions}
          {onToggleMaximize && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onToggleMaximize()
              }}
              className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
              aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
            >
              {isMaximized ? (
                <Minimize2 className="h-3 w-3" />
              ) : (
                <Maximize2 className="h-3 w-3" />
              )}
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onClose()
            }}
            className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
            aria-label="Close window"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content — contain:content isolates repaints from the parent
          motion.div transform layer, preventing white-flash on scroll
          during rapid re-renders. */}
      <div className="flex-1 overflow-hidden" style={{ contain: 'content' }}>
        {children}
      </div>

      {/* Optional footer — sticky below content, above resize handles */}
      {footer}

      {/* Resize handles — hidden when maximized */}
      {!isMaximized && (
        <>
          {/* Edge handles */}
          <div
            onPointerDown={(e) => handleResizeStart('top', e)}
            className="absolute top-0 right-0 left-0 z-10 h-1.5 cursor-row-resize"
          />
          <div
            onPointerDown={(e) => handleResizeStart('right', e)}
            className="absolute top-0 right-0 bottom-0 z-10 w-1.5 cursor-col-resize"
          />
          <div
            onPointerDown={(e) => handleResizeStart('bottom', e)}
            className="absolute right-0 bottom-0 left-0 z-10 h-1.5 cursor-row-resize"
          />
          <div
            onPointerDown={(e) => handleResizeStart('left', e)}
            className="absolute top-0 bottom-0 left-0 z-10 w-1.5 cursor-col-resize"
          />
          {/* Corner handles */}
          <div
            onPointerDown={(e) => handleResizeStart('top-left', e)}
            className="absolute top-0 left-0 z-20 h-3 w-3 cursor-nwse-resize"
          />
          <div
            onPointerDown={(e) => handleResizeStart('top-right', e)}
            className="absolute top-0 right-0 z-20 h-3 w-3 cursor-nesw-resize"
          />
          <div
            onPointerDown={(e) => handleResizeStart('bottom-left', e)}
            className="absolute bottom-0 left-0 z-20 h-3 w-3 cursor-nesw-resize"
          />
          <div
            onPointerDown={(e) => handleResizeStart('corner', e)}
            className="absolute right-0 bottom-0 z-20 h-3 w-3 cursor-nwse-resize"
          />
        </>
      )}
    </motion.div>
  )
}
