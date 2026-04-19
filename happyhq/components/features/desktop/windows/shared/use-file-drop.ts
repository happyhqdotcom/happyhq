import { useMemo, useRef, useState } from 'react'

/**
 * Hook for drag-and-drop file handling.
 * Returns isDragOver state and drag event handlers to spread onto a container.
 * Only activates for file drags (ignores text/link drags).
 */
export function useFileDrop(
  onDrop: (files: FileList) => void,
  { enabled = true }: { enabled?: boolean } = {},
) {
  const [isDragOver, setIsDragOver] = useState(false)
  const counterRef = useRef(0)

  const dragHandlers = useMemo(() => {
    if (!enabled) return {}
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
      },
      onDragEnter: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        counterRef.current++
        setIsDragOver(true)
      },
      onDragLeave: (e: React.DragEvent) => {
        e.preventDefault()
        counterRef.current--
        if (counterRef.current === 0) setIsDragOver(false)
      },
      onDrop: (e: React.DragEvent) => {
        e.preventDefault()
        counterRef.current = 0
        setIsDragOver(false)
        if (e.dataTransfer.files.length > 0) onDrop(e.dataTransfer.files)
      },
    }
  }, [onDrop, enabled])

  return { isDragOver: enabled && isDragOver, dragHandlers }
}
