'use client'

import { useConfig } from '@/lib/config/use-config'
import { cn } from '@/lib/utils'
import type { StagedFile } from '@/stores/chatStore'
import { ArrowUp, Plus, Square } from 'lucide-react'
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'

import { FileCard } from './file-card'

interface ComposerProps {
  onSubmit: (message: string, files?: File[]) => void
  disabled?: boolean
  placeholder?: string
  showStop?: boolean
  onStop?: () => void
  /** When set, shows a clickable busy message instead of the textarea */
  busyMessage?: string
  /** Called when the user clicks the busy message (e.g. to navigate to the active task) */
  onBusyClick?: () => void
  /** Compact pill mode: single-row inline layout (plus | textarea | send) for embedding */
  compact?: boolean
  /** Auto-focus the textarea on mount */
  autoFocus?: boolean
  /** Extra controls rendered in the bottom toolbar, after the plus button */
  actions?: React.ReactNode
  /** Extra controls rendered on the right side of the toolbar, before the send button */
  rightActions?: React.ReactNode
  /** Overlay rendered inside the textarea container (e.g. animated placeholder) */
  overlay?: React.ReactNode
  /** Whether to clear the textarea after submit (default: true). Set false when navigating away. */
  clearOnSubmit?: boolean
  /** Controlled text value (lifted to store for persistence across modes) */
  value?: string
  /** Called when the text value changes */
  onValueChange?: (value: string) => void
  /** Controlled staged files (lifted to store for persistence across modes) */
  stagedFiles?: StagedFile[]
  /** Called when staged files change */
  onStagedFilesChange?: (
    files: StagedFile[] | ((prev: StagedFile[]) => StagedFile[]),
  ) => void
}

export const Composer = memo(function Composer({
  onSubmit,
  disabled = false,
  placeholder = 'Teach Q about your work...',
  showStop = false,
  onStop,
  busyMessage,
  onBusyClick,
  compact = false,
  autoFocus = false,
  actions,
  rightActions,
  overlay,
  clearOnSubmit = true,
  value: controlledValue,
  onValueChange,
  stagedFiles: controlledFiles,
  onStagedFilesChange,
}: ComposerProps) {
  const { config } = useConfig()
  const sendWithEnter = config?.general.sendWithEnter ?? true

  // Support both controlled (store-backed) and uncontrolled (local state) modes
  const [localValue, setLocalValue] = useState('')
  const [localFiles, setLocalFiles] = useState<StagedFile[]>([])

  const isControlled = controlledValue !== undefined
  const value = isControlled ? controlledValue : localValue
  const stagedFiles = controlledFiles ?? localFiles

  const setValue = useCallback(
    (v: string) => {
      if (!isControlled) setLocalValue(v)
      onValueChange?.(v)
    },
    [isControlled, onValueChange],
  )
  const setStagedFiles = useCallback(
    (files: StagedFile[] | ((prev: StagedFile[]) => StagedFile[])) => {
      if (onStagedFilesChange) onStagedFilesChange(files)
      else setLocalFiles(files)
    },
    [onStagedFilesChange],
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const [heightExpanded, setHeightExpanded] = useState(false)
  // Track whether the latest value change came from local typing (handleInput already resized)
  const localChangeRef = useRef(false)

  const handleFiles = useCallback((files: FileList) => {
    // Filter to supported types — the <input> has accept but drag-and-drop bypasses it
    const allowed = Array.from(files).filter((f) => {
      const name = f.name.toLowerCase()
      return (
        name.endsWith('.pdf') || name.endsWith('.eml') || name.endsWith('.docx')
      )
    })
    for (const file of allowed) {
      setStagedFiles((prev) => [
        ...prev,
        { id: crypto.randomUUID(), name: file.name, file },
      ])
    }
  }, [])

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim()
    if (!trimmed && stagedFiles.length === 0) return
    if (disabled) return

    onSubmit(
      trimmed,
      stagedFiles.length > 0 ? stagedFiles.map((f) => f.file) : undefined,
    )
    if (clearOnSubmit) {
      setValue('')
      setStagedFiles([])
      // Reset height then refocus
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
        textareaRef.current.focus()
      }
      setHeightExpanded(false)
    }
  }, [value, disabled, onSubmit, stagedFiles, clearOnSubmit])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== 'Enter') return
      if (sendWithEnter) {
        // Enter sends, Shift+Enter inserts newline
        if (!e.shiftKey) {
          e.preventDefault()
          handleSubmit()
        }
      } else {
        // Cmd/Ctrl+Enter sends, plain Enter inserts newline
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault()
          handleSubmit()
        }
      }
    },
    [handleSubmit, sendWithEnter],
  )

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      localChangeRef.current = true
      const el = e.currentTarget
      el.style.height = 'auto'
      const h = el.scrollHeight
      el.style.height = `${h}px`
      if (compact && h > 32) setHeightExpanded(true)
    },
    [compact],
  )

  // Auto-focus on mount when requested
  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  // Collapse the latch when value is cleared
  useEffect(() => {
    if (heightExpanded && value.length === 0) setHeightExpanded(false)
  }, [heightExpanded, value])

  const isExpanded = compact && (value.includes('\n') || heightExpanded)

  // Re-measure textarea height when value changes externally (e.g. store hydration)
  // or after grid layout changes (compact mode expand/collapse).
  // Skip when the change came from local typing — handleInput already resized.
  useLayoutEffect(() => {
    if (localChangeRef.current) {
      localChangeRef.current = false
      return
    }
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
    if (compact && el.scrollHeight > 32) setHeightExpanded(true)
  }, [value, isExpanded, compact])

  const isEmpty = value.trim().length === 0 && stagedFiles.length === 0

  const plusButton = (
    <button
      type="button"
      aria-label="Attach file"
      onClick={(e) => {
        e.stopPropagation()
        fileInputRef.current?.click()
      }}
      className="flex h-9 w-9 shrink-0 cursor-default items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-600"
    >
      <Plus className="h-5 w-5" />
    </button>
  )

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      multiple
      accept=".pdf,.eml,.docx"
      className="hidden"
      onChange={(e) => {
        if (e.target.files?.length) handleFiles(e.target.files)
        e.target.value = ''
      }}
    />
  )

  const sendButton = showStop ? (
    <button
      type="button"
      onClick={onStop}
      aria-label="Stop"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors duration-150 hover:bg-zinc-200"
    >
      <Square className="h-3.5 w-3.5 fill-current" />
    </button>
  ) : (
    <button
      type="button"
      onClick={handleSubmit}
      disabled={disabled || isEmpty}
      aria-label="Send message"
      className={cn(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-white transition-opacity duration-150 disabled:cursor-not-allowed',
        isEmpty || disabled ? 'opacity-40' : 'opacity-100',
      )}
    >
      <ArrowUp className="h-4 w-4" />
    </button>
  )

  const filesDisplay = !busyMessage && stagedFiles.length > 0 && (
    <div className="flex flex-wrap gap-2 px-3 pt-2 pb-2">
      {stagedFiles.map((f) => (
        <FileCard
          key={f.id}
          staged={f}
          onRemove={(id) =>
            setStagedFiles((prev) => prev.filter((s) => s.id !== id))
          }
        />
      ))}
    </div>
  )

  const dragHandlers = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(true)
    },
    onDragEnter: (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(true)
    },
    onDragLeave: (e: React.DragEvent) => {
      e.preventDefault()
      if (!e.currentTarget.contains(e.relatedTarget as Node))
        setIsDragOver(false)
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)
      if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
    },
  }

  /* ── Compact mode: grid pill that rearranges on multiline ─ */
  if (compact) {
    return (
      <div
        className={cn(
          'flex flex-col rounded-[28px] bg-white ring-1 ring-black/10 transition-colors focus-within:ring-4 focus-within:ring-[oklch(0.9_0.058_28/.5)] focus-within:outline-1 focus-within:outline-[oklch(0.795_0.115_28)]',
          !busyMessage && 'cursor-text',
          isDragOver && 'ring-primary/30 bg-primary/5 ring-2',
        )}
        onClick={() => !busyMessage && textareaRef.current?.focus()}
        {...dragHandlers}
      >
        {filesDisplay}
        <div
          className={cn(
            'grid grid-cols-[auto_1fr_auto]',
            isExpanded
              ? "gap-y-1.5 p-2.5 [grid-template-areas:'primary_primary_primary'_'leading_._trailing']"
              : "items-center px-1.5 py-3 [grid-template-areas:'leading_primary_trailing']",
          )}
        >
          {busyMessage ? (
            <button
              type="button"
              onClick={onBusyClick}
              className="col-span-3 w-full cursor-pointer px-3 py-2 text-left text-sm text-black/40 hover:text-black/50"
            >
              {busyMessage}
            </button>
          ) : (
            <>
              <div className="flex items-center [grid-area:leading]">
                {plusButton}
                {fileInput}
              </div>
              <div
                className={cn(
                  'max-h-52 min-w-0 overflow-y-auto [grid-area:primary]',
                  isExpanded ? 'px-2.5' : 'flex items-center py-1.5',
                )}
              >
                <textarea
                  ref={textareaRef}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onInput={handleInput}
                  placeholder={placeholder}
                  disabled={disabled}
                  rows={1}
                  className="w-full resize-none bg-transparent text-sm text-black/80 outline-none placeholder:text-black/40 disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
              <div className="flex items-center [grid-area:trailing]">
                {sendButton}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }

  /* ── Card mode: stacked layout [files / textarea / buttons] ─ */
  return (
    <div
      className={cn(
        'flex flex-col rounded-[28px] bg-white p-2.5 ring-1 ring-black/10 transition-shadow duration-200',
        'shadow-[0_4px_20px_rgba(0,0,0,0.035)] focus-within:ring-4 focus-within:ring-[oklch(0.9_0.058_28/.5)] focus-within:outline-1 focus-within:outline-[oklch(0.795_0.115_28)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.05)]',
        !busyMessage && 'cursor-text',
        isDragOver && 'ring-primary/30 bg-primary/5 ring-2',
      )}
      onClick={() => !busyMessage && textareaRef.current?.focus()}
      {...dragHandlers}
    >
      {stagedFiles.length > 0 && !busyMessage && (
        <div className="-mx-2.5 flex flex-wrap gap-2 px-3 pb-1">
          {stagedFiles.map((f) => (
            <FileCard
              key={f.id}
              staged={f}
              onRemove={(id) =>
                setStagedFiles((prev) => prev.filter((s) => s.id !== id))
              }
            />
          ))}
        </div>
      )}
      <div className="relative max-h-96 overflow-y-auto">
        {busyMessage ? (
          <button
            type="button"
            onClick={onBusyClick}
            className="w-full cursor-pointer p-2 text-left text-base text-zinc-400 hover:text-zinc-500"
          >
            {busyMessage}
          </button>
        ) : (
          <>
            {overlay}
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className="w-full resize-none bg-transparent p-2 text-base text-zinc-900 outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </>
        )}
      </div>
      {!busyMessage && (
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center">
            {plusButton}
            {fileInput}
            {actions}
          </div>
          <div className="flex items-center gap-2">
            {rightActions}
            {sendButton}
          </div>
        </div>
      )}
    </div>
  )
})
