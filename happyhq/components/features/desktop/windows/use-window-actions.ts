import type { FileEntry } from '@/lib/fs/types'
import { useStreamSlug } from '@/stores/desktopStore'
import { type WindowConfig, useWindowStore } from '@/stores/windowStore'
import { useParams } from 'next/navigation'
import { useCallback } from 'react'
import { PLAN_WINDOW_ID } from '../constants'

/**
 * Actions-only window hook — no `windows` array subscription.
 *
 * Use this in panel views that need to open/focus windows but don't
 * render the windows list. Avoids re-renders on every window drag/resize.
 *
 * The shell/canvas should use `useDesktopWindows(canvasRef)` instead,
 * which includes the `windows` array for rendering.
 */
export function useWindowActions() {
  const streamSlug = useStreamSlug()
  const activeTaskSlug = useParams<{ task?: string }>().task

  // Store functions — stable references from Zustand create(), never change.
  const openWindowRaw = useWindowStore((s) => s.openWindow)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const updateWindowMeta = useWindowStore((s) => s.updateWindowMeta)
  const updateDirectoryMeta = useWindowStore((s) => s.updateDirectoryMeta)
  const updateCsvMeta = useWindowStore((s) => s.updateCsvMeta)

  // Stable wrapper — reads canvasWidth from store at call time (not a subscription).
  const openWindow = useCallback(
    (config: WindowConfig) =>
      openWindowRaw(config, useWindowStore.getState().canvasWidth ?? undefined),
    [openWindowRaw],
  )

  const playbookFilePath = `${streamSlug}/playbook.md`
  const taskBasePath = activeTaskSlug ? `tasks/${activeTaskSlug}` : ''
  const planFilePath = taskBasePath ? `${taskBasePath}/plan.md` : ''

  const openOrFocusWindow = useCallback(
    (id: string, title: string, filePath: string, markdown: string) => {
      const existing = useWindowStore
        .getState()
        .windows.find((w) => w.id === id)
      if (existing?.isOpen) {
        focusWindow(id)
      } else {
        openWindow({
          id,
          contentType: 'markdown',
          title,
          position: { x: 160, y: 48 },
          size: { width: 576, height: 600 },
          meta: { markdown, filePath },
        })
      }
    },
    [focusWindow, openWindow],
  )

  const openFileWindow = useCallback(
    (entry: {
      name: string
      title?: string
      path: string
      rawPath?: string | null
    }) => {
      const windowId =
        entry.path === planFilePath && planFilePath
          ? PLAN_WINDOW_ID
          : `file-${entry.path}`
      const existing = useWindowStore
        .getState()
        .windows.find((w) => w.id === windowId)
      if (existing?.isOpen) {
        focusWindow(windowId)
        return
      }

      const lowerName = entry.name.toLowerCase()
      const isPdf = lowerName.endsWith('.pdf')
      const isEml = lowerName.endsWith('.eml')
      const isDocx = lowerName.endsWith('.docx')
      const isCsv = lowerName.endsWith('.csv')
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
      const isImage = imageExts.some((ext) => lowerName.endsWith(ext))

      if (isPdf) {
        openWindow({
          id: windowId,
          contentType: 'pdf',
          title: entry.title ?? entry.name,
          position: { x: 160, y: 48 },
          size: { width: 640, height: 700 },
          meta: { filePath: entry.path, rawPath: entry.rawPath ?? undefined },
        })
        return
      }

      if (isEml) {
        const dirPath = entry.path.replace(/\/[^/]+$/, '')
        const jsonPath = `${dirPath}/email.json`
        openWindow({
          id: windowId,
          contentType: 'email',
          title: entry.title ?? entry.name,
          position: { x: 160, y: 48 },
          size: { width: 520, height: 560 },
          meta: { jsonPath, dirPath },
        })
        return
      }

      if (isDocx) {
        const dirPath = entry.path.replace(/\/[^/]+$/, '')
        const mdPath = `${dirPath}/content.md`
        openWindow({
          id: windowId,
          contentType: 'markdown',
          title: entry.title ?? entry.name,
          position: { x: 160, y: 48 },
          size: { width: 576, height: 600 },
          meta: {
            markdown: '',
            filePath: mdPath,
            loading: true,
            rawPath: entry.rawPath ?? undefined,
          },
        })

        fetch(`/api/fs/file?path=${encodeURIComponent(mdPath)}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json() as Promise<{ content: string }>
          })
          .then(({ content }) => {
            updateWindowMeta(windowId, { markdown: content, loading: false })
          })
          .catch(() => {
            updateWindowMeta(windowId, { markdown: '', loading: false })
          })
        return
      }

      if (isImage) {
        openWindow({
          id: windowId,
          contentType: 'image',
          title: entry.title ?? entry.name,
          position: { x: 160, y: 48 },
          size: { width: 400, height: 400 },
          meta: { filePath: entry.path },
        })
        return
      }

      if (isCsv) {
        openWindow({
          id: windowId,
          contentType: 'csv',
          title: entry.title ?? entry.name,
          position: { x: 160, y: 48 },
          size: { width: 640, height: 500 },
          meta: { csv: '', filePath: entry.path, loading: true },
        })

        fetch(`/api/fs/file?path=${encodeURIComponent(entry.path)}`)
          .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            return res.json() as Promise<{ content: string }>
          })
          .then(({ content }) => {
            updateCsvMeta(windowId, { csv: content, loading: false })
          })
          .catch(() => {
            updateCsvMeta(windowId, { csv: '', loading: false })
          })
        return
      }

      openWindow({
        id: windowId,
        contentType: 'markdown',
        title: entry.title ?? entry.name,
        position: { x: 160, y: 48 },
        size: { width: 576, height: 600 },
        meta: {
          markdown: '',
          filePath: entry.path,
          loading: true,
          rawPath: entry.rawPath ?? undefined,
        },
      })

      fetch(`/api/fs/file?path=${encodeURIComponent(entry.path)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<{ content: string }>
        })
        .then(({ content }) => {
          updateWindowMeta(windowId, { markdown: content, loading: false })
        })
        .catch(() => {
          updateWindowMeta(windowId, { markdown: '', loading: false })
        })
    },
    [focusWindow, openWindow, updateWindowMeta, updateCsvMeta, planFilePath],
  )

  const openDirectoryWindow = useCallback(
    (id: string, title: string) => {
      const existing = useWindowStore
        .getState()
        .windows.find((w) => w.id === id)
      if (existing?.isOpen) {
        focusWindow(id)
      } else {
        openWindow({
          id,
          contentType: 'directory',
          title,
          position: { x: 160, y: 48 },
          size: { width: 380, height: 420 },
        })
      }
    },
    [focusWindow, openWindow],
  )

  const openDynamicDirectoryWindow = useCallback(
    (dirPath: string, title: string) => {
      const windowId = `dir-${dirPath}`
      const existing = useWindowStore
        .getState()
        .windows.find((w) => w.id === windowId)
      if (existing?.isOpen) {
        focusWindow(windowId)
        return
      }

      openWindow({
        id: windowId,
        contentType: 'directory',
        title,
        position: { x: 160, y: 48 },
        size: { width: 380, height: 420 },
        meta: { directoryPath: dirPath, directoryItems: [], loading: true },
      })

      fetch(`/api/fs/directory?path=${encodeURIComponent(dirPath)}`)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<{ entries: FileEntry[] }>
        })
        .then(({ entries }) => {
          updateDirectoryMeta(windowId, {
            directoryItems: entries.map((f) => ({
              id: f.path,
              name: f.name,
              type: f.type,
            })),
            loading: false,
          })
        })
        .catch(() => {
          updateDirectoryMeta(windowId, {
            directoryItems: [],
            loading: false,
          })
        })
    },
    [focusWindow, openWindow, updateDirectoryMeta],
  )

  return {
    playbookFilePath,
    planFilePath,
    openOrFocusWindow,
    openFileWindow,
    openDirectoryWindow,
    openDynamicDirectoryWindow,
    updateWindowMeta,
  }
}
