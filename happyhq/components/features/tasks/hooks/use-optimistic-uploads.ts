import { toastError, toastWarning } from '@/components/common/ui/sonner'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { ingestTaskInput } from '@/lib/actions'
import { friendlyErrorMessage } from '@/lib/errors/friendly-message'
import { useCallback, useRef, useState } from 'react'

function truncate(s: string, max: number) {
  return s.length > max ? s.slice(0, max) + '…' : s
}

type UploadStatus = 'uploading' | 'done' | 'error'

export interface PendingFile {
  clientId: string
  file: File
  status: UploadStatus
}

/** Minimum time (ms) a pending file stays visible so the user always sees feedback. */
const MIN_VISIBLE_MS = 400

/**
 * Slugify a filename the same way the server does (lowercase, alphanumeric + dashes).
 * Used for render-time dedup against resolvedNames from SWR.
 */
function slugify(filename: string): string {
  const ext = filename.lastIndexOf('.')
  const base = ext > 0 ? filename.slice(0, ext) : filename
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'input'
  )
}

export function useOptimisticUploads(opts: {
  taskSlug: string | null | undefined
  refresh: (() => void) | null | undefined
  /** Slugs already confirmed in SWR data — used to retire 'done' pending files. */
  resolvedNames: string[]
}) {
  const { taskSlug, refresh, resolvedNames } = opts
  const { token } = useCurrentUser()
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Auto-clean: remove 'done' pending files once their slug appears in SWR data
  const activePending = pendingFiles.filter((pf) => {
    if (pf.status === 'done') {
      const slug = slugify(pf.file.name)
      // Match if resolvedNames contains the slug or a suffixed version (slug-2, slug-3)
      return !resolvedNames.some((n) => n === slug || n.startsWith(slug + '-'))
    }
    return true
  })

  // If we cleaned some up, schedule state sync (can't setState during render).
  // Use a functional updater so concurrent setPendingFiles calls aren't overwritten.
  if (activePending.length < pendingFiles.length) {
    queueMicrotask(() =>
      setPendingFiles((prev) =>
        prev.filter((pf) => {
          if (pf.status === 'done') {
            const slug = slugify(pf.file.name)
            return !resolvedNames.some(
              (n) => n === slug || n.startsWith(slug + '-'),
            )
          }
          return true
        }),
      ),
    )
  }

  const isUploading = activePending.some((f) => f.status === 'uploading')

  const handleFiles = useCallback(
    (files: FileList) => {
      const fileList = Array.from(files)
      if (fileList.length === 0 || !taskSlug) return

      // Add all files to pending state immediately — this is the "first frame"
      const pending: PendingFile[] = fileList.map((file) => ({
        clientId: `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: 'uploading' as const,
      }))
      setPendingFiles((prev) => [...prev, ...pending])

      // Wait for React to paint the pending state before starting uploads.
      // On localhost the server action can complete in < 16ms, so without this
      // the spinner would be added and removed before the browser ever paints.
      requestAnimationFrame(() => {
        const startedAt = Date.now()

        void Promise.allSettled(
          pending.map(async (pf) => {
            const formData = new FormData()
            formData.append('file', pf.file)
            try {
              const result = await ingestTaskInput(
                taskSlug,
                formData,
                token ?? undefined,
              )
              if (result.quality === 'poor' || result.quality === 'empty') {
                toastWarning(
                  `"${truncate(pf.file.name, 20)}" not optimized for AI comprehension`,
                )
              }
              // Ensure the spinner is visible for at least MIN_VISIBLE_MS
              const elapsed = Date.now() - startedAt
              if (elapsed < MIN_VISIBLE_MS) {
                await new Promise((r) =>
                  setTimeout(r, MIN_VISIBLE_MS - elapsed),
                )
              }
              // Mark as done — stays visible until SWR confirms the real file
              setPendingFiles((prev) =>
                prev.map((f) =>
                  f.clientId === pf.clientId ? { ...f, status: 'done' } : f,
                ),
              )
            } catch (err) {
              setPendingFiles((prev) =>
                prev.map((f) =>
                  f.clientId === pf.clientId ? { ...f, status: 'error' } : f,
                ),
              )
              toastError(
                `Failed to upload ${pf.file.name}: ${friendlyErrorMessage(err, 'Unknown error')}`,
              )
              throw err
            }
          }),
        ).then(() => {
          refresh?.()
        })
      })
    },
    [taskSlug, token, refresh],
  )

  const dismissError = useCallback((clientId: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.clientId !== clientId))
  }, [])

  return {
    pendingFiles: activePending,
    isUploading,
    handleFiles,
    fileInputRef,
    dismissError,
    slugify,
  }
}
