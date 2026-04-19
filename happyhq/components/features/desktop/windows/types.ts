import type { RefObject } from 'react'

export interface WindowFrameProps {
  id?: string
  position: { x: number; y: number }
  zIndex: number
  size: { width: number; height: number }
  onClose: () => void
  onFocus: () => void
  onDragEnd: (position: { x: number; y: number }) => void
  dragConstraintsRef: RefObject<HTMLElement | null>
  onResize?: (size: { width: number; height: number }) => void
  isMaximized?: boolean
  onToggleMaximize?: () => void
  onRestoreFromMaximize?: () => void
}

/** Props shared by all window type components. */
export interface WindowComponentProps {
  id: string
  canvasRef: RefObject<HTMLDivElement | null>
  openFileWindow: (entry: {
    name: string
    title?: string
    path: string
    rawPath?: string | null
  }) => void
}
