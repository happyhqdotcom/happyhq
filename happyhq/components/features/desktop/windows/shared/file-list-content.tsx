'use client'

import { UploadIndicator } from './upload-indicator'
import { useFileDrop } from './use-file-drop'

interface FileListContentProps {
  loading?: boolean
  isEmpty: boolean
  emptyMessage?: string
  emptyDescription?: string
  /** Enable drag-drop upload. When set, drop zone styling + upload indicator are active. */
  onDrop?: (files: FileList) => void
  isUploading?: boolean
  /** Optional content above the file list (e.g. category filter pills). */
  header?: React.ReactNode
  children: React.ReactNode
}

/**
 * Content area for file-list windows. Handles loading, empty, and droppable states.
 * Renders INSIDE a WindowFrame — not around it.
 */
export function FileListContent({
  loading,
  isEmpty,
  emptyMessage = 'No items',
  emptyDescription,
  onDrop,
  isUploading,
  header,
  children,
}: FileListContentProps) {
  const { isDragOver, dragHandlers } = useFileDrop(onDrop ?? (() => {}))
  const isDroppable = !!onDrop

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="text-sm text-zinc-400">Loading...</p>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div
        className={`flex min-h-full flex-col items-center p-8 pt-[38.2%] text-center transition-colors ${isDroppable && isDragOver ? 'rounded-b-xl bg-blue-50/40 ring-2 ring-blue-400/30 ring-inset' : ''}`}
        {...(isDroppable ? dragHandlers : {})}
      >
        <p className="text-sm font-medium text-zinc-400">{emptyMessage}</p>
        {emptyDescription && (
          <p className="mt-2 max-w-[240px] text-xs leading-relaxed text-zinc-300">
            {emptyDescription}
          </p>
        )}
      </div>
    )
  }

  return (
    <div
      className={`relative flex h-full flex-col transition-colors ${isDroppable && isDragOver ? 'rounded-b-xl bg-blue-50/40 ring-2 ring-blue-400/30 ring-inset' : ''}`}
      {...(isDroppable ? dragHandlers : {})}
    >
      {header}
      <div className="flex flex-1 flex-col px-1.5 py-1">{children}</div>
      <UploadIndicator visible={!!isUploading} />
    </div>
  )
}
