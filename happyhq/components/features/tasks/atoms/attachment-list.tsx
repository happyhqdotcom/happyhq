'use client'

import { ExcelIcon, PDFIcon, PowerpointIcon } from '@/components/common/icons'
import { FileTypeIcon } from '@/components/common/icons/file-type-icon'
import { GoogleDriveIcon } from '@/components/common/icons/google-drive'
import { SlackIcon } from '@/components/common/icons/slack'
import { YouTubeIcon } from '@/components/common/icons/youtube'
import { Kbd } from '@/components/common/ui/kbd'
import { FileContextMenu } from '@/components/features/desktop/windows/shared/file-context-menu'
import { FileRow } from '@/components/features/desktop/windows/shared/file-row'
import type { PendingFile } from '@/components/features/tasks/hooks/use-optimistic-uploads'
import type { FileItem } from '@/lib/fs/types'
import { AlertTriangle, MoreHorizontal } from 'lucide-react'

interface AttachmentListProps {
  inputs: FileItem[]
  readOnly?: boolean
  /** Suppress the big drop-zone empty state — show "None" instead while keeping add/delete active. */
  hideDropZone?: boolean
  // Editable mode
  pendingFiles?: PendingFile[]
  onAdd?: () => void
  onDelete?: (inputName: string) => void | Promise<void>
  // Both modes
  onFileClick?: (input: FileItem) => void
  className?: string
}

/**
 * Shared presentational component for rendering task input attachments.
 * Used by both the desktop TaskPanel and the home page TaskCard.
 *
 * Data fetching + uploads stay with the parent — this component only renders.
 */
export function AttachmentList({
  inputs,
  readOnly,
  hideDropZone,
  pendingFiles,
  onAdd,
  onDelete,
  onFileClick,
  className,
}: AttachmentListProps) {
  const isEmpty =
    inputs.length === 0 && (!pendingFiles || pendingFiles.length === 0)

  return (
    <div className={`flex flex-col gap-0.5 ${className ?? ''}`}>
      <div className="mb-1 flex items-center px-2">
        <h3 className="flex-1 text-sm font-medium text-zinc-500">
          Attachments
        </h3>
        {!readOnly && onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-600 disabled:opacity-50"
          >
            + Add
          </button>
        )}
      </div>

      {/* Pending uploads (optimistic) */}
      {pendingFiles?.map((pf) => (
        <FileRow
          key={pf.clientId}
          name={slugify(pf.file.name)}
          filename={pf.file.name}
          iconSlot={<FileTypeIcon filename={pf.file.name} />}
          className={pf.status !== 'done' ? 'opacity-60' : ''}
          rightSlot={
            pf.status === 'uploading' ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-400" />
            ) : pf.status === 'error' ? (
              <span className="text-xs text-red-500">Failed</span>
            ) : null
          }
        />
      ))}

      {/* Resolved inputs */}
      {inputs.map((input) => (
        <InputRow
          key={input.originalPath}
          input={input}
          onDelete={
            !readOnly && onDelete ? () => onDelete(input.name) : undefined
          }
          onClick={onFileClick ? () => onFileClick(input) : undefined}
        />
      ))}

      {/* Empty state */}
      {isEmpty && !readOnly && !hideDropZone && <AttachmentsEmptyState />}
      {isEmpty && (readOnly || hideDropZone) && (
        <p className="px-2 text-xs text-zinc-400">None</p>
      )}
    </div>
  )
}

// ── Input row with quality annotation ────────────────────────────────────

function InputRow({
  input,
  onDelete,
  onClick,
}: {
  input: FileItem
  onDelete?: () => void
  onClick?: () => void
}) {
  const hasQualityIssue = input.quality === 'poor' || input.quality === 'empty'

  const row = (
    <div>
      <FileRow
        name={input.name}
        filename={input.originalName}
        displayTitle={input.title}
        iconSlot={
          input.favicon ? (
            <>
              <img
                src={input.favicon}
                alt=""
                className="h-[18px] w-[18px] shrink-0 rounded-sm"
                onError={(e) => {
                  // Fall back to generic web icon on favicon load failure
                  e.currentTarget.style.display = 'none'
                  e.currentTarget.parentElement
                    ?.querySelector('[data-fallback-icon]')
                    ?.removeAttribute('hidden')
                }}
              />
              <span data-fallback-icon hidden>
                <FileTypeIcon filename="link.www" />
              </span>
            </>
          ) : (
            <FileTypeIcon
              filename={
                input.name.startsWith('web/') ? 'link.www' : input.originalName
              }
            />
          )
        }
        onClick={onClick}
        rightSlot={
          onDelete ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                const el = e.currentTarget.closest(
                  '[role="button"]',
                ) as HTMLElement | null
                if (el) {
                  el.dispatchEvent(
                    new MouseEvent('contextmenu', {
                      bubbles: true,
                      clientX: e.clientX,
                      clientY: e.clientY,
                    }),
                  )
                }
              }}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-zinc-200/80 hover:text-zinc-600"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          ) : undefined
        }
      />
      {hasQualityIssue && (
        <div className="flex h-8 items-center gap-2 rounded-md bg-amber-50 px-2">
          <span className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          </span>
          <span className="min-w-0 flex-1 text-xs text-amber-600/80">
            Not optimized for AI comprehension
          </span>
          {/* TODO: wire up extractWithAI with batched page processing */}
        </div>
      )}
    </div>
  )

  if (onDelete) {
    return (
      <FileContextMenu
        filePath={input.originalPath}
        onDelete={async () => onDelete()}
      >
        {row}
      </FileContextMenu>
    )
  }

  return row
}

// ── Empty state ─────────────────────────────────────────────────────────

function AttachmentsEmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="rounded-lg bg-zinc-100/20 px-4 py-3 text-center text-sm text-zinc-500/80 select-none">
        <div className="-ml-1 flex items-center justify-center gap-1">
          <span>Drop</span>
          <span className="relative">
            files
            <span className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 items-end gap-0.5">
              <PDFIcon size={15} className="-rotate-6 text-red-500" />
              <ExcelIcon size={15} className="-translate-y-1 text-green-600" />
              <PowerpointIcon size={15} className="rotate-6 text-orange-500" />
            </span>
          </span>
          <span className="text-zinc-400">&ndash;</span>
          <span>click to</span>
          <span className="relative">
            browse
            <span className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2 items-end gap-0.5">
              <SlackIcon size={15} className="-translate-x-0.5 -rotate-6" />
              <GoogleDriveIcon size={15} className="-translate-y-1" />
              <YouTubeIcon size={15} className="translate-x-0.5 rotate-6" />
            </span>
          </span>
          <span className="text-zinc-400">&ndash; or tap</span>
          <Kbd className="bg-zinc-200 text-zinc-600">/</Kbd>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────

/** Slugify a filename the same way the server does. */
function slugify(filename: string): string {
  const ext = filename.lastIndexOf('.')
  const base = ext > 0 ? filename.slice(0, ext) : filename
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'file'
  )
}
