'use client'

import type { PendingFile } from '@/components/features/tasks/hooks/use-optimistic-uploads'
import { deleteTaskInput } from '@/lib/actions'
import { ALLOWED_INPUT_ACCEPT } from '@/lib/file-types'
import type { FileItem } from '@/lib/fs/types'
import { useTaskStore } from '@/stores/taskStore'
import type { RefObject } from 'react'
import { useCallback } from 'react'
import { AttachmentList } from '../atoms/attachment-list'
import { useTaskMutate } from '../hooks/use-task-swr'

interface AttachmentsSectionProps {
  visibleInputs: FileItem[]
  pendingFiles: PendingFile[]
  handleFiles: (files: FileList) => void
  fileInputRef: RefObject<HTMLInputElement | null>
}

export function AttachmentsSection({
  visibleInputs,
  pendingFiles,
  handleFiles,
  fileInputRef,
}: AttachmentsSectionProps) {
  const taskSlug = useTaskStore((s) => s.taskSlug)
  const refresh = useTaskMutate()

  const handleDeleteInput = useCallback(
    async (inputName: string) => {
      await deleteTaskInput(taskSlug!, inputName)
      refresh?.()
    },
    [taskSlug, refresh],
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_INPUT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
      <AttachmentList
        inputs={visibleInputs}
        readOnly={false}
        pendingFiles={pendingFiles}
        onAdd={() => fileInputRef.current?.click()}
        onDelete={(name) => handleDeleteInput(name)}
        className="px-2 py-2.5"
      />
    </>
  )
}
