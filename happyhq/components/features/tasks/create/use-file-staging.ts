import { useCallback, useRef, useState } from 'react'

export function useFileStaging() {
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((files: FileList | File[]) => {
    // Snapshot here, not inside the updater: HTMLInputElement.files is [SameObject],
    // so resetting `input.value = ''` after this call mutates the same FileList in
    // place. If the updater is queued (e.g. another setState is already pending),
    // it would run after the clear and read an empty list.
    const snapshot = Array.from(files)
    setStagedFiles((prev) => [...prev, ...snapshot])
  }, [])

  const removeFile = useCallback((index: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const clearFiles = useCallback(() => {
    setStagedFiles([])
  }, [])

  const openFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return {
    stagedFiles,
    fileInputRef,
    addFiles,
    removeFile,
    clearFiles,
    openFilePicker,
  }
}
