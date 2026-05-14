'use client'

import { useEffect, useRef, useState } from 'react'

import { toastError, toastWarning } from '@/components/common/ui/sonner'
import { FileRow } from '@/components/features/desktop/windows/shared/file-row'
import { useFileDrop } from '@/components/features/desktop/windows/shared/use-file-drop'
import { StreamPicker } from '@/components/features/tasks/atoms/stream-picker'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { createTask, ingestTaskInput } from '@/lib/actions'
import { ALLOWED_INPUT_ACCEPT } from '@/lib/file-types'
import { generateTaskSlug } from '@/lib/format'
import { taskItemsKey } from '@/lib/swr-keys'
import { useStreams } from '@/stores/streamsStore'
import { AnimatePresence, motion } from 'framer-motion'
import { Paperclip, Plus, X } from 'lucide-react'
import { useSWRConfig } from 'swr'
import { useFileStaging } from './use-file-staging'

export function TaskQuickAdd({
  fixedStream,
}: {
  fixedStream?: string
} = {}) {
  const streams = useStreams()
  const { mutate } = useSWRConfig()
  const { token } = useCurrentUser()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedStream, setSelectedStream] = useState<string | null>(
    fixedStream ?? null,
  )
  const [isCreating, setIsCreating] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const {
    stagedFiles,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    openFilePicker,
  } = useFileStaging()
  const { isDragOver, dragHandlers } = useFileDrop(addFiles, {
    enabled: expanded,
  })

  useEffect(() => {
    function focus() {
      titleRef.current?.focus()
    }
    window.addEventListener('happyhq:focus-quick-add', focus)
    return () => window.removeEventListener('happyhq:focus-quick-add', focus)
  }, [])

  const canSubmit = title.trim().length > 0

  async function handleSubmit() {
    if (!canSubmit || isCreating) return
    const trimmed = title.trim()
    const slug = generateTaskSlug(trimmed)
    if (!slug) return

    setIsCreating(true)
    try {
      await createTask(
        slug,
        trimmed,
        fixedStream ?? selectedStream ?? undefined,
        description.trim() || undefined,
      )

      // Upload staged files into the newly created task
      for (const file of stagedFiles) {
        const formData = new FormData()
        formData.append('file', file)
        try {
          const result = await ingestTaskInput(
            slug,
            formData,
            token ?? undefined,
          )
          if (result.quality === 'poor' || result.quality === 'empty') {
            toastWarning(
              `"${file.name.length > 20 ? file.name.slice(0, 20) + '…' : file.name}" not optimized for AI comprehension`,
            )
          }
        } catch {
          toastError(`Failed to attach ${file.name}`)
        }
      }

      setTitle('')
      setDescription('')
      setSelectedStream(null)
      clearFiles()
      setExpanded(false)
      mutate(taskItemsKey())
      titleRef.current?.focus()
    } catch {
      toastError('Failed to create task')
    } finally {
      setIsCreating(false)
    }
  }

  function handleBlur() {
    // Delay to let portaled dropdowns (Headless UI) settle focus
    setTimeout(() => {
      const active = document.activeElement
      if (
        containerRef.current &&
        !containerRef.current.contains(active) &&
        !document.querySelector('[data-headlessui-state]')
      ) {
        if (!title.trim() && !description.trim() && stagedFiles.length === 0) {
          setExpanded(false)
        }
      }
    }, 100)
  }

  function handleCancel() {
    setTitle('')
    setDescription('')
    setSelectedStream(null)
    clearFiles()
    setExpanded(false)
    titleRef.current?.blur()
  }

  return (
    <div
      ref={containerRef}
      onBlur={handleBlur}
      {...dragHandlers}
      className={`flex flex-col rounded-md transition-shadow ${
        expanded
          ? isDragOver
            ? 'bg-white ring-1 shadow-pink-100 ring-pink-400/50'
            : 'bg-white shadow-sm'
          : 'bg-zinc-800/10 pb-1.5'
      }`}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_INPUT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) addFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* Title row — always stable */}
      <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
        <span className="flex size-5 shrink-0 items-center justify-center">
          <Plus className="size-5 text-zinc-400" />
        </span>
        <input
          ref={titleRef}
          type="text"
          value={title}
          onChange={(e) => {
            if (!expanded) setExpanded(true)
            setTitle(e.target.value)
          }}
          onFocus={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSubmit()
            }
            if (e.key === 'Escape') {
              handleCancel()
            }
          }}
          placeholder={expanded ? 'What needs to be done?' : 'New task'}
          disabled={isCreating}
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-zinc-950 placeholder:text-zinc-400 focus:outline-none disabled:opacity-50"
        />
      </div>

      {/* Expandable section */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden"
          >
            {/* Description */}
            <div className="px-3 pb-1">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add context"
                rows={1}
                className="w-full resize-none bg-transparent pl-7 text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
              />
            </div>

            {/* Staged files */}
            {stagedFiles.length > 0 && (
              <div className="flex flex-col gap-0.5 px-3 pb-1.5 pl-7">
                <h3 className="px-2 text-sm font-medium text-zinc-500">
                  Attachments
                </h3>
                {stagedFiles.map((file, i) => (
                  <FileRow
                    key={`${file.name}-${i}`}
                    name={file.name}
                    filename={file.name}
                    rightSlot={
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="rounded-sm text-zinc-400 hover:text-zinc-600"
                      >
                        <X className="size-3.5" />
                      </button>
                    }
                  />
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 px-3 pb-2 pl-10">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded border border-zinc-950/10 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-950/2.5 disabled:opacity-50"
                disabled={isCreating}
                onClick={openFilePicker}
              >
                <Paperclip className="size-3" />
                Attachments
              </button>

              {!fixedStream && streams.length > 0 && (
                <StreamPicker
                  streams={streams}
                  selected={selectedStream}
                  onSelect={setSelectedStream}
                  disabled={isCreating}
                />
              )}

              <div className="flex-1" />

              <button
                type="button"
                className="rounded px-2.5 py-1 text-xs text-zinc-400 transition-colors hover:text-zinc-600"
                onClick={handleCancel}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-pink-600 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-pink-700 disabled:opacity-40"
                onClick={handleSubmit}
                disabled={!canSubmit || isCreating}
              >
                Add task
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
