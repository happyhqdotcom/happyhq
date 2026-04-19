import { useWindowById, useWindowStore } from '@/stores/windowStore'
import type { RefObject } from 'react'
import type { WindowFrameProps } from './types'

/**
 * Builds the common WindowFrame props for a given window ID.
 * Each window type calls this once to get frame-level props,
 * then composes WindowFrame with its own header/actions/content.
 */
export function useFrameProps(
  id: string,
  canvasRef: RefObject<HTMLDivElement | null>,
) {
  const w = useWindowById(id)
  if (!w || !w.isOpen) return null

  const {
    closeWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
    toggleMaximize,
    restoreWindow,
  } = useWindowStore.getState()

  const handleToggleMaximize = () => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (rect) toggleMaximize(w.id, { width: rect.width, height: rect.height })
  }

  const frameProps: WindowFrameProps = {
    id: w.id,
    position: w.position,
    zIndex: w.zIndex,
    size: w.size,
    onClose: () => closeWindow(w.id),
    onFocus: () => focusWindow(w.id),
    onDragEnd: (pos: { x: number; y: number }) => moveWindow(w.id, pos),
    dragConstraintsRef: canvasRef,
    onResize: (size: { width: number; height: number }) =>
      resizeWindow(w.id, size),
    isMaximized: w.isMaximized,
    onToggleMaximize: handleToggleMaximize,
    onRestoreFromMaximize: () => restoreWindow(w.id),
  }

  return { frameProps, window: w }
}
