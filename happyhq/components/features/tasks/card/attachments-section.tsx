'use client'

import { useOptimisticUploads } from '@/components/features/tasks/hooks/use-optimistic-uploads'
import { deleteTaskInput } from '@/lib/actions'
import { useTaskStore } from '@/stores/taskStore'
import { useCallback } from 'react'
import { AttachmentList } from '../atoms/attachment-list'
import { useTaskContentData, useTaskMutate } from '../hooks/use-task-swr'

export function AttachmentsSection() {
  const content = useTaskContentData()
  const taskSlug = useTaskStore((s) => s.taskSlug)
  const refresh = useTaskMutate()

  const visibleInputs =
    content?.inputs.filter((i) => i.name !== 'context') ?? []

  const { pendingFiles, isUploading, handleFiles, fileInputRef } =
    useOptimisticUploads({
      taskSlug,
      refresh,
      resolvedNames: visibleInputs.map((i) => i.name),
    })

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
