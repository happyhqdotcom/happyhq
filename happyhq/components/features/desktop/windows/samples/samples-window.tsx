'use client'

import {
  Alert,
  AlertActions,
  AlertDescription,
  AlertTitle,
} from '@/components/common/catalyst/alert'
import { Button } from '@/components/common/catalyst/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/common/ui/context-menu'
import { toastError } from '@/components/common/ui/sonner'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/common/ui/tooltip'
import { useCurrentUser } from '@/lib/accounts/hooks'
import {
  createSampleType,
  deleteSample,
  deleteSampleType,
  ingestSample,
  moveSampleCategory,
  renameSampleCategory,
  writeSampleTitle,
} from '@/lib/actions'
import { displayTitle } from '@/lib/format'
import type { SampleEntry } from '@/lib/fs/types'
import { invalidateStream } from '@/lib/swr-helpers'
import { useStreamSlug } from '@/stores/desktopStore'
import { FolderInput, ListFilter, Pencil, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useStreamContent } from '../../hooks/use-desktop-data'
import { FileContextMenu } from '../shared/file-context-menu'
import { FileIcon } from '../shared/file-icon'
import { FileListContent } from '../shared/file-list-content'
import { FileRow } from '../shared/file-row'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFrame } from '../window-frame'

function InlineRenameInput({
  currentTitle,
  slug,
  onSave,
  onCancel,
  className,
}: {
  currentTitle: string | null
  slug: string
  onSave: (newTitle: string) => void
  onCancel: () => void
  className?: string
}) {
  const [value, setValue] = useState(displayTitle(currentTitle, slug))
  const inputRef = useRef<HTMLInputElement>(null)
  const savedRef = useRef(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [])

  function handleSave() {
    if (savedRef.current) return
    savedRef.current = true
    const trimmed = value.trim()
    if (trimmed && trimmed !== displayTitle(currentTitle, slug)) {
      onSave(trimmed)
    } else {
      onCancel()
    }
  }

  return (
    <input
      ref={inputRef}
      autoFocus
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          handleSave()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          savedRef.current = true
          onCancel()
        }
      }}
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        '-ml-1 min-w-0 flex-1 rounded-sm bg-white pl-1 text-sm text-zinc-700 shadow-[inset_0_0_0_1px_theme(--color-blue-400)] outline-none'
      }
    />
  )
}

const TYPE_HEADER_TEXT =
  'cursor-default rounded-sm px-1 -mx-1 text-xs font-medium text-zinc-400 transition-colors hover:bg-zinc-100 select-none'
const TYPE_HEADER_INPUT =
  'min-w-0 flex-1 bg-transparent text-xs font-medium text-zinc-400 outline-none select-none'

/** Group header for a sample type. "other" is not renameable/deletable. */
function TypeGroupHeader({
  type,
  typeTitle,
  streamSlug,
  sampleCount,
  onRenamed,
  onDeleted,
  onPendingTitle,
  isNew,
  onNewCancelled,
}: {
  type: string
  typeTitle: string | null
  streamSlug: string
  sampleCount: number
  onRenamed: () => void
  onDeleted?: () => void
  onPendingTitle?: (title: string) => void
  isNew?: boolean
  onNewCancelled?: () => void
}) {
  const [renaming, setRenaming] = useState(isNew ?? false)
  const [showDeleteAlert, setShowDeleteAlert] = useState(false)
  const { token } = useCurrentUser()
  const isOther = type === 'other'

  async function handleDelete(deleteSamples: boolean) {
    try {
      await deleteSampleType(
        streamSlug,
        type,
        deleteSamples,
        token ?? undefined,
      )
      onDeleted?.()
    } catch {
      toastError('Failed to delete type')
    }
  }

  const label = renaming ? (
    <InlineRenameInput
      currentTitle={isNew ? '' : typeTitle}
      slug={isNew ? '' : type}
      className={TYPE_HEADER_INPUT}
      onSave={async (newTitle) => {
        setRenaming(false)
        if (!isNew) onPendingTitle?.(newTitle)
        try {
          if (isNew) {
            await createSampleType(streamSlug, newTitle, token ?? undefined)
          } else {
            await renameSampleCategory(
              streamSlug,
              type,
              newTitle,
              token ?? undefined,
            )
          }
          onRenamed()
        } catch {
          onPendingTitle?.('')
          toastError('Failed to save')
          if (isNew) onNewCancelled?.()
        }
      }}
      onCancel={() => {
        setRenaming(false)
        if (isNew) onNewCancelled?.()
      }}
    />
  ) : (
    <span
      className={TYPE_HEADER_TEXT}
      onDoubleClick={isOther ? undefined : () => setRenaming(true)}
    >
      {displayTitle(typeTitle, type)}
    </span>
  )

  if (isOther || isNew) {
    return <div className="flex items-center px-2 pt-3 pb-1">{label}</div>
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="flex items-center px-2 pt-3 pb-1">{label}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => setRenaming(true)}>
          <Pencil data-slot="icon" />
          Rename
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => {
            if (sampleCount > 0) {
              setShowDeleteAlert(true)
            } else {
              handleDelete(false)
            }
          }}
        >
          <Trash2 data-slot="icon" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
      <Alert open={showDeleteAlert} onClose={() => setShowDeleteAlert(false)}>
        <AlertTitle>Delete {displayTitle(typeTitle, type)}?</AlertTitle>
        <AlertDescription>
          {displayTitle(typeTitle, type)} has {sampleCount}{' '}
          {sampleCount === 1 ? 'sample' : 'samples'}. You can move{' '}
          {sampleCount === 1 ? 'it' : 'them'} to Other, or delete the{' '}
          {sampleCount === 1 ? 'sample' : 'samples'} too.
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setShowDeleteAlert(false)}>
            Cancel
          </Button>
          <Button
            outline
            onClick={() => {
              setShowDeleteAlert(false)
              handleDelete(false)
            }}
          >
            Move to Other
          </Button>
          <Button
            color="red"
            onClick={() => {
              setShowDeleteAlert(false)
              handleDelete(true)
            }}
          >
            Delete Samples
          </Button>
        </AlertActions>
      </Alert>
    </ContextMenu>
  )
}

export function SamplesWindow({
  id,
  canvasRef,
  openFileWindow,
}: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  const [activeTypes, setActiveTypes] = useState<Set<string>>(new Set())
  const [showFilters, setShowFilters] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [creatingNewType, setCreatingNewType] = useState(false)
  const [pendingTitles, setPendingTitles] = useState<Record<string, string>>({})
  const [pendingTypeTitles, setPendingTypeTitles] = useState<
    Record<string, string>
  >({})
  const { token } = useCurrentUser()
  const streamContent = useStreamContent()
  const streamSlug = useStreamSlug()

  if (!result) return null
  const { frameProps, window: w } = result

  const samples: SampleEntry[] = streamContent?.samples ?? []
  const allSampleTypes = streamContent?.sampleTypes ?? []
  const onSampleIngested = () => invalidateStream(streamSlug)

  // Build type list from server data (includes empty directories)
  const types = allSampleTypes
    .map((t) => t.slug)
    .sort((a, b) => {
      if (a === 'other') return 1
      if (b === 'other') return -1
      return a.localeCompare(b)
    })

  const typeTitles: Record<string, string | null> = {}
  for (const t of allSampleTypes) {
    typeTitles[t.slug] = pendingTypeTitles[t.slug] ?? t.title
  }

  const filtered =
    activeTypes.size > 0
      ? samples.filter((s) => activeTypes.has(s.category))
      : samples

  const grouped = new Map<string, SampleEntry[]>()
  for (const type of types) {
    const typeSamples = filtered.filter((s) => s.category === type)
    grouped.set(type, typeSamples)
  }

  async function handleDrop(files: FileList) {
    const fileList = Array.from(files)
    if (fileList.length === 0) return
    setIsUploading(true)
    try {
      for (const file of fileList) {
        const formData = new FormData()
        formData.append('file', file)
        await ingestSample(streamSlug, formData, token ?? undefined)
      }
      onSampleIngested()
    } catch {
      toastError(
        'Something went wrong adding this file. Files must be under 100MB.',
      )
    } finally {
      setIsUploading(false)
    }
  }

  async function handleMove(sample: SampleEntry, toType: string) {
    try {
      await moveSampleCategory(
        streamSlug,
        sample.name,
        sample.category,
        toType,
        token ?? undefined,
      )
      onSampleIngested()
    } catch {
      toastError('Failed to move sample')
    }
  }

  const hasMultipleTypes = types.length > 1

  const contentHeader = (
    <div className="flex items-center gap-1.5 border-b border-zinc-100 px-3 pt-2 pb-1.5">
      {hasMultipleTypes && showFilters ? (
        types.map((type) => (
          <button
            key={type}
            type="button"
            className={`inline-flex cursor-pointer items-center rounded-sm px-1.5 py-0.5 text-xs font-medium transition-colors focus:outline-none ${
              activeTypes.has(type)
                ? 'bg-violet-500/15 text-violet-600'
                : 'bg-zinc-600/10 text-zinc-500 hover:bg-zinc-600/20'
            }`}
            onClick={() =>
              setActiveTypes((prev) => {
                const next = new Set(prev)
                if (next.has(type)) next.delete(type)
                else next.add(type)
                return next
              })
            }
          >
            {displayTitle(typeTitles[type] ?? null, type)}
          </button>
        ))
      ) : (
        <button
          type="button"
          onClick={() => setCreatingNewType(true)}
          className="inline-flex cursor-pointer items-center rounded-sm bg-zinc-600/10 px-1.5 py-0.5 text-xs font-medium text-zinc-500 select-none hover:bg-zinc-600/20"
        >
          New Type
        </button>
      )}
      {hasMultipleTypes && (
        <button
          type="button"
          onClick={() => {
            setShowFilters((prev) => !prev)
            if (showFilters) setActiveTypes(new Set())
          }}
          className={`ml-auto flex h-5 w-5 items-center justify-center rounded ${
            showFilters
              ? 'bg-violet-500/15 text-violet-600'
              : 'text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600'
          }`}
          aria-label="Filter by type"
        >
          <ListFilter className="h-3 w-3" />
        </button>
      )}
    </div>
  )

  function renderSample(sample: SampleEntry) {
    const isEditing = editingKey === sample.originalPath

    const row = isEditing ? (
      <div className="flex h-8 w-full items-center gap-2 rounded-md px-2">
        <FileIcon filename={sample.originalName} />
        <InlineRenameInput
          currentTitle={sample.title}
          slug={sample.name}
          onSave={async (newTitle) => {
            setPendingTitles((prev) => ({
              ...prev,
              [sample.originalPath]: newTitle,
            }))
            setEditingKey(null)
            try {
              await writeSampleTitle(
                streamSlug,
                sample.name,
                sample.category,
                newTitle,
                token ?? undefined,
              )
              onSampleIngested()
            } catch {
              setPendingTitles((prev) => {
                const { [sample.originalPath]: _, ...rest } = prev
                return rest
              })
            }
          }}
          onCancel={() => setEditingKey(null)}
        />
      </div>
    ) : (
      <FileRow
        name={sample.name}
        filename={sample.originalName}
        displayTitle={pendingTitles[sample.originalPath] ?? sample.title}
        onClick={() =>
          openFileWindow({
            name: sample.originalName,
            title: displayTitle(sample.title, sample.name),
            path: sample.originalPath,
            rawPath: sample.rawPath,
          })
        }
      />
    )

    const withTooltip =
      sample.description && !isEditing ? (
        <Tooltip>
          <TooltipTrigger asChild>{row}</TooltipTrigger>
          <TooltipContent side="bottom" align="start" className="z-500">
            {sample.description}
          </TooltipContent>
        </Tooltip>
      ) : (
        row
      )

    const otherTypes = types.filter(
      (t) => t !== sample.category && t !== 'other',
    )
    const canCategorize = otherTypes.length > 0 || sample.category !== 'other'

    return (
      <FileContextMenu
        key={sample.originalPath}
        filePath={sample.originalPath}
        onDelete={async () => {
          await deleteSample(
            streamSlug,
            sample.name,
            sample.category,
            token ?? undefined,
          )
          onSampleIngested()
        }}
        extraContent={
          <>
            <ContextMenuItem
              onSelect={() => setEditingKey(sample.originalPath)}
            >
              <Pencil data-slot="icon" />
              Rename
            </ContextMenuItem>
            {canCategorize && (
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <FolderInput data-slot="icon" />
                  Set Type&hellip;
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {otherTypes.map((type) => (
                    <ContextMenuItem
                      key={type}
                      onSelect={() => handleMove(sample, type)}
                    >
                      {displayTitle(typeTitles[type] ?? null, type)}
                    </ContextMenuItem>
                  ))}
                  {sample.category !== 'other' && (
                    <ContextMenuItem
                      onSelect={() => handleMove(sample, 'other')}
                    >
                      Remove Type
                    </ContextMenuItem>
                  )}
                </ContextMenuSubContent>
              </ContextMenuSub>
            )}
          </>
        }
      >
        {withTooltip}
      </FileContextMenu>
    )
  }

  return (
    <WindowFrame title="Samples" {...frameProps}>
      <FileListContent
        loading={w.meta?.loading}
        isEmpty={samples.length === 0 && allSampleTypes.length === 0}
        emptyMessage="No samples yet"
        emptyDescription="Drop a file here to add your first sample"
        onDrop={handleDrop}
        isUploading={isUploading}
        header={contentHeader}
      >
        {types.length > 0
          ? [...grouped.entries()]
              .filter(
                ([type]) => activeTypes.size === 0 || activeTypes.has(type),
              )
              .map(([type, typeSamples]) => (
                <div key={type}>
                  <TypeGroupHeader
                    type={type}
                    typeTitle={typeTitles[type] ?? null}
                    streamSlug={streamSlug}
                    sampleCount={typeSamples.length}
                    onRenamed={onSampleIngested}
                    onDeleted={onSampleIngested}
                    onPendingTitle={(title) =>
                      setPendingTypeTitles((prev) => {
                        if (title) return { ...prev, [type]: title }
                        const { [type]: _, ...rest } = prev
                        return rest
                      })
                    }
                  />
                  {typeSamples.length > 0 ? (
                    typeSamples.map(renderSample)
                  ) : (
                    <p className="px-2 py-2 text-xs text-zinc-300">
                      No samples yet
                    </p>
                  )}
                </div>
              ))
          : samples.map(renderSample)}
        {creatingNewType && (
          <TypeGroupHeader
            type=""
            typeTitle={null}
            streamSlug={streamSlug}
            sampleCount={0}
            isNew
            onRenamed={() => {
              setCreatingNewType(false)
              onSampleIngested()
            }}
            onNewCancelled={() => setCreatingNewType(false)}
          />
        )}
      </FileListContent>
    </WindowFrame>
  )
}
