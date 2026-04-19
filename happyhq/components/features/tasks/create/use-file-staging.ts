import { useCallback, useRef, useState } from 'react'

export function useFileStaging() {
  const [stagedFiles, setStagedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const addFiles = useCallback((files: FileList | File[]) => {
    setStagedFiles((prev) => [...prev, ...Array.from(files)])
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
