'use client'

import { useEffect, useState } from 'react'

import { useSidebarOptional } from '@/components/common/ui/sidebar'
import { FileRow } from '@/components/features/desktop/windows/shared/file-row'
import { useFileDrop } from '@/components/features/desktop/windows/shared/use-file-drop'
import { StreamPicker } from '@/components/features/tasks/atoms/stream-picker'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { createTask, ingestTaskInput } from '@/lib/actions'
import { ALLOWED_INPUT_ACCEPT } from '@/lib/file-types'
import { generateTaskSlug } from '@/lib/format'
import { taskItemsKey } from '@/lib/swr-keys'
import { useStreams } from '@/stores/streamsStore'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import { Paperclip, X } from 'lucide-react'
import { toast } from 'sonner'
import { useSWRConfig } from 'swr'
import { useFileStaging } from './use-file-staging'

export function TaskCreateDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const sidebar = useSidebarOptional()
  const streams = useStreams()
  const { mutate } = useSWRConfig()
  const { token } = useCurrentUser()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)
  const {
    stagedFiles,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    openFilePicker,
  } = useFileStaging()
  const { isDragOver, dragHandlers } = useFileDrop(addFiles)

  const canSubmit = title.trim().length > 0

  useEffect(() => {
    if (open) {
      // Reset the new-task form each time the dialog (re)opens so the next
      // user sees a clean slate, regardless of whether the underlying Dialog
      // unmounts its children between opens.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTitle('')
      setDescription('')
      setSelectedStream(null)
      clearFiles()
    }
  }, [open, clearFiles])

  const handleClose = () => {
    if (!isCreating) onClose()
  }

  async function handleSubmit() {
    if (!canSubmit || isCreating) return
    const trimmed = title.trim()
    const slug = generateTaskSlug(trimmed)

    setIsCreating(true)
    try {
      await createTask(
        slug,
        trimmed,
        selectedStream ?? undefined,
        description.trim() || undefined,
      )

      // Upload staged files into the newly created task
      for (const file of stagedFiles) {
        const formData = new FormData()
        formData.append('file', file)
        try {
          await ingestTaskInput(slug, formData, token ?? undefined)
        } catch {
          toast.error(`Failed to attach ${file.name}`)
        }
      }

      mutate(taskItemsKey())
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create task')
    } finally {
      setIsCreating(false)
    }
  }

  const sidebarPadding = sidebar
    ? sidebar.isMobile
      ? ''
      : sidebar.open
        ? 'pl-70'
        : 'pl-20'
    : ''

  return (
    <Dialog open={open} onClose={handleClose} className="relative z-1050">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/5 transition duration-100 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      />

      <div
        className={`fixed inset-0 z-1060 grid grid-rows-[1fr_auto_1.618fr] justify-items-center px-6 ${sidebarPadding}`}
      >
        <DialogPanel
          transition
          className="row-start-2 h-fit w-full max-w-xl transition duration-100 data-closed:scale-95 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
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

          <div
            {...dragHandlers}
            className={`flex flex-col rounded-md bg-white p-3 shadow-lg ring-1 transition-shadow ${
              isDragOver
                ? 'shadow-pink-100 ring-pink-400/50'
                : 'ring-zinc-950/5'
            }`}
          >
            {/* Title */}
            <input
              autoFocus
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleSubmit()
                }
              }}
              placeholder="What needs to be done?"
              disabled={isCreating}
              className="min-w-0 flex-1 bg-transparent px-1 text-[15px] font-medium text-zinc-950 placeholder:text-zinc-400 focus:outline-none disabled:opacity-50"
            />

            {/* Description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add context"
              rows={1}
              className="mt-1 w-full resize-none bg-transparent px-1 text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
            />

            {/* Staged files */}
            {stagedFiles.length > 0 && (
              <div className="flex flex-col gap-0.5 pt-2">
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
            <div className="flex items-center gap-1.5 pt-3">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded border border-zinc-950/10 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-950/2.5 disabled:opacity-50"
                disabled={isCreating}
                onClick={openFilePicker}
              >
                <Paperclip className="size-3" />
                Attachments
              </button>

              {streams.length > 0 && (
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
                onClick={handleClose}
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
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
