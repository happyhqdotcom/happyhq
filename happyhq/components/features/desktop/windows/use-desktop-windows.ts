import type { FileEntry } from '@/lib/fs/types'
import { useStreamSlug } from '@/stores/desktopStore'
import { useWindowStore } from '@/stores/windowStore'
import { useParams } from 'next/navigation'
import { type RefObject, useCallback } from 'react'
import { PLAN_WINDOW_ID } from '../constants'

export function useDesktopWindows(
  canvasRef?: RefObject<HTMLDivElement | null>,
) {
  const streamSlug = useStreamSlug()
  const activeTaskSlug = useParams<{ task?: string }>().task

  // Subscribe to windows array (needed for render) and action functions
  // (stable references from Zustand's create()) separately.
  const windows = useWindowStore((s) => s.windows)
  const openWindowRaw = useWindowStore((s) => s.openWindow)
  // Read canvasWidth from the store at call time (getState), not as a
  // subscription. Subscribing would re-render on every ResizeObserver
  // frame during CSS transitions, causing jank in heavy components.
  // Memoised so the downstream useCallbacks below have a stable
  // dependency and don't churn on every render.
  const openWindow = useCallback<typeof openWindowRaw>(
    (config) =>
      openWindowRaw(
        config,
        canvasRef?.current?.getBoundingClientRect().width ??
          useWindowStore.getState().canvasWidth ??
          undefined,
      ),
    [openWindowRaw, canvasRef],
  )
  const closeWindow = useWindowStore((s) => s.closeWindow)
  const focusWindow = useWindowStore((s) => s.focusWindow)
  const moveWindow = useWindowStore((s) => s.moveWindow)
  const resizeWindow = useWindowStore((s) => s.resizeWindow)
  const toggleMaximize = useWindowStore((s) => s.toggleMaximize)
  const restoreWindow = useWindowStore((s) => s.restoreWindow)
  const updateWindowMeta = useWindowStore((s) => s.updateWindowMeta)
  const updateDirectoryMeta = useWindowStore((s) => s.updateDirectoryMeta)
  const updateCsvMeta = useWindowStore((s) => s.updateCsvMeta)

  const playbookFilePath = `${streamSlug}/playbook.md`
  const taskBasePath = activeTaskSlug
    ? `${streamSlug}/tasks/${activeTaskSlug}`
    : ''
  const planFilePath = taskBasePath ? `${taskBasePath}/plan.md` : ''

  // Use getState() inside callbacks to avoid closing over `windows`,
  // which would invalidate these callbacks on every store change.
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
      // Reuse the well-known plan window ID so the footer/approval logic works
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

      // Route by file extension
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
        // email.json sits next to original.eml in the same directory
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
        // content.md sits next to original.docx in the same directory
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

      // Open markdown window with loading state
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

      // Fetch content in background, then update
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
    windows,
    closeWindow,
    focusWindow,
    moveWindow,
    resizeWindow,
    toggleMaximize,
    restoreWindow,
    playbookFilePath,
    planFilePath,
    openOrFocusWindow,
    openFileWindow,
    openDirectoryWindow,
    openDynamicDirectoryWindow,
    updateWindowMeta,
  }
}
