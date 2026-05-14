import type { ChatMessage } from '@/lib/chat/types'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

// ── Types ────────────────────────────────────────────────────────────────

interface WindowStateBase {
  id: string
  title: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
  isOpen: boolean
  isMaximized: boolean
  savedBounds?: {
    position: { x: number; y: number }
    size: { width: number; height: number }
  }
}

export interface MarkdownWindowMeta {
  markdown: string
  filePath: string
  loading?: boolean
  historyLabel?: string | null // non-null when viewing a historical version (e.g. "3 min ago")
  historyHash?: string | null // commit hash of the version being viewed
  lastUpdatedAt?: number // timestamp set when markdown content changes (drives UI indicator)
  rawPath?: string // path to raw.txt for sample files (enables "View Raw" action)
}

export interface MarkdownWindow extends WindowStateBase {
  contentType: 'markdown'
  meta: MarkdownWindowMeta
}

export interface DirectoryWindowMeta {
  directoryPath?: string
  directoryItems?: { id: string; name: string; type?: 'file' | 'directory' }[]
  loading?: boolean
}

export interface DirectoryWindow extends WindowStateBase {
  contentType: 'directory'
  meta?: DirectoryWindowMeta
}

export interface PdfWindowMeta {
  filePath: string
  loading?: boolean
  rawPath?: string // path to raw.txt for sample files (enables "View Raw" action)
  showRawText?: boolean
  rawTextContent?: string
}

export interface PdfWindow extends WindowStateBase {
  contentType: 'pdf'
  meta: PdfWindowMeta
}

export interface ImageWindowMeta {
  filePath: string
  loading?: boolean
}

export interface ImageWindow extends WindowStateBase {
  contentType: 'image'
  meta: ImageWindowMeta
}

export interface EmailWindowMeta {
  /** Path to email.json with structured email data */
  jsonPath: string
  /** Path to the upload directory (for resolving attachment paths) */
  dirPath: string
  loading?: boolean
}

export interface EmailWindow extends WindowStateBase {
  contentType: 'email'
  meta: EmailWindowMeta
}

export interface CsvWindowMeta {
  csv: string
  filePath: string
  loading?: boolean
  historyLabel?: string | null
  historyHash?: string | null
  lastUpdatedAt?: number
}

export interface CsvWindow extends WindowStateBase {
  contentType: 'csv'
  meta: CsvWindowMeta
}

export interface ChatWindowMeta {
  streamName: string
  sessionIds: string[] // all session UUIDs (1 for planning, N for working)
  activeIndex: number // which session is currently displayed
  messages: ChatMessage[] // messages for the active session
  loading: boolean
  interactive?: boolean // when true, render full interactive chat via ChatContent
  sessionId?: string // live session ID for interactive mode (provider manages state)
  initialMode?: 'general' | 'learning' // set at window creation, consumed once by provider
  intent?: string // user's stated intent for the stream; sent as the first user turn on mount, then cleared
  shouldMaximize?: boolean // one-shot: ChatWindow maximizes against its canvas on mount, then clears
}

export interface ChatWindow extends WindowStateBase {
  contentType: 'chat'
  meta: ChatWindowMeta
}

export type WindowState =
  | MarkdownWindow
  | DirectoryWindow
  | PdfWindow
  | ImageWindow
  | EmailWindow
  | CsvWindow
  | ChatWindow

export type WindowConfig =
  | Omit<MarkdownWindow, 'zIndex' | 'isOpen' | 'isMaximized' | 'savedBounds'>
  | Omit<DirectoryWindow, 'zIndex' | 'isOpen' | 'isMaximized' | 'savedBounds'>
  | Omit<PdfWindow, 'zIndex' | 'isOpen' | 'isMaximized' | 'savedBounds'>
  | Omit<ImageWindow, 'zIndex' | 'isOpen' | 'isMaximized' | 'savedBounds'>
  | Omit<EmailWindow, 'zIndex' | 'isOpen' | 'isMaximized' | 'savedBounds'>
  | Omit<CsvWindow, 'zIndex' | 'isOpen' | 'isMaximized' | 'savedBounds'>
  | Omit<ChatWindow, 'zIndex' | 'isOpen' | 'isMaximized' | 'savedBounds'>

export interface SavedWindowState {
  id: string
  contentType:
    | 'markdown'
    | 'directory'
    | 'pdf'
    | 'image'
    | 'email'
    | 'csv'
    | 'chat'
  title: string
  filePath?: string
  directoryPath?: string
  // Chat-specific fields
  streamName?: string
  sessionId?: string // interactive chat: the live session
  sessionIds?: string[] // read-only chat: all sessions to display
  interactive?: boolean
  position: { x: number; y: number }
  size: { width: number; height: number }
  isOpen: boolean
  isMaximized: boolean
  savedBounds?: {
    position: { x: number; y: number }
    size: { width: number; height: number }
  }
}

interface WindowStoreState {
  windows: WindowState[]
  nextZIndex: number
  /** Last-known canvas width — set by the shell, read by useDesktopWindows. */
  canvasWidth: number | null
  /** Last-known canvas height — set by the shell, read by WindowFrame for drag bounds. */
  canvasHeight: number | null

  setCanvasSize: (size: { width: number; height: number }) => void
  openWindow: (config: WindowConfig, canvasWidth?: number) => void
  closeWindow: (id: string) => void
  focusWindow: (id: string) => void
  moveWindow: (id: string, position: { x: number; y: number }) => void
  resizeWindow: (id: string, size: { width: number; height: number }) => void
  updateWindowMeta: (id: string, meta: Partial<MarkdownWindowMeta>) => void
  updateDirectoryMeta: (id: string, meta: Partial<DirectoryWindowMeta>) => void
  updatePdfMeta: (id: string, meta: Partial<PdfWindowMeta>) => void
  updateCsvMeta: (id: string, meta: Partial<CsvWindowMeta>) => void
  updateChatMeta: (id: string, meta: Partial<ChatWindowMeta>) => void
  toggleMaximize: (
    id: string,
    canvasBounds: { width: number; height: number },
  ) => void
  restoreWindow: (id: string) => void
  restoreLayout: (saved: SavedWindowState[]) => void
  rewriteTaskPaths: (oldPrefix: string, newPrefix: string) => void
  closeWindowForFile: (filePath: string) => void
  closeTaskWindows: (
    streamSlug: string,
    taskSlug: string,
    leavingTaskMode?: boolean,
  ) => void
  clearAll: () => void
}

// ── Store ────────────────────────────────────────────────────────────────

export const useWindowStore = create<WindowStoreState>((set, get) => ({
  windows: [],
  nextZIndex: 31,
  canvasWidth: null,
  canvasHeight: null,

  setCanvasSize: ({ width, height }) =>
    set((s) => ({
      canvasWidth: width,
      canvasHeight: height,
      // Keep maximized windows full-bleed when the canvas resizes (previously
      // handled implicitly by CSS width:100%/inset:0; now the maximized size
      // lives in the store, so we update it explicitly here).
      windows: s.windows.map((w) =>
        w.isMaximized ? { ...w, size: { width, height } } : w,
      ),
    })),
  openWindow: (config, canvasWidth) => {
    const { windows, nextZIndex } = get()
    const existing = windows.find((w) => w.id === config.id)
    const autoMaximize = canvasWidth != null && canvasWidth < 700

    if (existing && existing.isOpen) {
      // Already open — focus and update content, but preserve layout
      const updated = {
        ...existing,
        ...config,
        position: existing.position,
        size: existing.size,
        zIndex: nextZIndex,
        isOpen: true,
        isMaximized: existing.isMaximized,
        savedBounds: existing.savedBounds,
      } as WindowState
      set({
        windows: windows.map((w) => (w.id === config.id ? updated : w)),
        nextZIndex: nextZIndex + 1,
      })
      return
    }

    // Cascade: offset new windows so they don't stack on top of each other
    const CASCADE_OFFSET = 24
    const CASCADE_MAX = 8
    const openCount = windows.filter((w) => w.isOpen).length
    const step = openCount % CASCADE_MAX
    const position = {
      x: config.position.x + step * CASCADE_OFFSET,
      y: config.position.y + step * CASCADE_OFFSET,
    }

    const newWindow = {
      ...config,
      position,
      zIndex: nextZIndex,
      isOpen: true,
      isMaximized: autoMaximize,
      savedBounds: autoMaximize ? { position, size: config.size } : undefined,
    } as WindowState

    if (existing) {
      // Reopen a closed window — reset layout
      set({
        windows: windows.map((w) => (w.id === config.id ? newWindow : w)),
        nextZIndex: nextZIndex + 1,
      })
    } else {
      set({
        windows: [...windows, newWindow],
        nextZIndex: nextZIndex + 1,
      })
    }
  },

  closeWindow: (id) =>
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, isOpen: false } : w,
      ),
    })),

  closeWindowForFile: (filePath) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (!w.isOpen) return w
        const meta = w.meta as { filePath?: string }
        return meta?.filePath === filePath ? { ...w, isOpen: false } : w
      }),
    })),

  focusWindow: (id) => {
    const { nextZIndex } = get()
    set((s) => ({
      windows: s.windows.map((w) =>
        w.id === id ? { ...w, zIndex: nextZIndex } : w,
      ),
      nextZIndex: nextZIndex + 1,
    }))
  },

  moveWindow: (id, position) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, position } : w)),
    })),

  resizeWindow: (id, size) =>
    set((s) => ({
      windows: s.windows.map((w) => (w.id === id ? { ...w, size } : w)),
    })),

  updateWindowMeta: (id, meta) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id || w.contentType !== 'markdown') return w
        const hasNewContent =
          meta.markdown != null && w.meta.markdown !== meta.markdown
        // Don't flag initial load (loading → loaded) as an update
        const isInitialLoad = w.meta.loading && meta.loading === false
        // Don't flag first content population (empty → content) as an update
        const isFirstPopulation = !w.meta.markdown
        return {
          ...w,
          meta: {
            ...w.meta,
            ...meta,
            ...(hasNewContent && !isInitialLoad && !isFirstPopulation
              ? { lastUpdatedAt: Date.now() }
              : {}),
          },
        }
      }),
    })),

  updateDirectoryMeta: (id, meta) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id || w.contentType !== 'directory') return w
        return { ...w, meta: { ...w.meta, ...meta } }
      }),
    })),

  updatePdfMeta: (id, meta) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id || w.contentType !== 'pdf') return w
        return { ...w, meta: { ...w.meta, ...meta } }
      }),
    })),

  updateCsvMeta: (id, meta) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id || w.contentType !== 'csv') return w
        const hasNewContent = meta.csv != null && w.meta.csv !== meta.csv
        const isInitialLoad = w.meta.loading && meta.loading === false
        const isFirstPopulation = !w.meta.csv
        return {
          ...w,
          meta: {
            ...w.meta,
            ...meta,
            ...(hasNewContent && !isInitialLoad && !isFirstPopulation
              ? { lastUpdatedAt: Date.now() }
              : {}),
          },
        }
      }),
    })),

  updateChatMeta: (id, meta) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id || w.contentType !== 'chat') return w
        return { ...w, meta: { ...w.meta, ...meta } }
      }),
    })),

  toggleMaximize: (id, canvasBounds) => {
    const { windows, nextZIndex } = get()
    set({
      windows: windows.map((w) => {
        if (w.id !== id) return w
        if (w.isMaximized) {
          // Restore to saved bounds
          return {
            ...w,
            position: w.savedBounds?.position ?? w.position,
            size: w.savedBounds?.size ?? w.size,
            isMaximized: false,
            savedBounds: undefined,
          }
        }
        // Maximize: save current bounds and fill canvas
        return {
          ...w,
          savedBounds: { position: w.position, size: w.size },
          position: { x: 0, y: 0 },
          size: { width: canvasBounds.width, height: canvasBounds.height },
          isMaximized: true,
          zIndex: nextZIndex,
        }
      }),
      nextZIndex: windows.some((w) => w.id === id && !w.isMaximized)
        ? nextZIndex + 1
        : nextZIndex,
    })
  },

  restoreWindow: (id) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        if (w.id !== id || !w.isMaximized) return w
        return {
          ...w,
          position: w.savedBounds?.position ?? w.position,
          size: w.savedBounds?.size ?? w.size,
          isMaximized: false,
          savedBounds: undefined,
        }
      }),
    })),

  restoreLayout: (saved) => {
    const { nextZIndex } = get()
    // Skip interactive chat windows with no session (nothing to restore)
    const openEntries = saved.filter(
      (s) =>
        s.isOpen &&
        !(s.contentType === 'chat' && s.interactive && !s.sessionId),
    )
    if (openEntries.length === 0) return

    const windows: WindowState[] = openEntries.map((entry, i) => {
      const base: WindowStateBase = {
        id: entry.id,
        title: entry.title,
        position: entry.position,
        size: entry.size,
        zIndex: nextZIndex + i,
        isOpen: true,
        isMaximized: entry.isMaximized,
        savedBounds: entry.savedBounds,
      }

      if (entry.contentType === 'chat') {
        return {
          ...base,
          contentType: 'chat' as const,
          meta: {
            streamName: entry.streamName ?? '',
            sessionIds: entry.sessionIds ?? [],
            activeIndex: 0,
            messages: [],
            loading: !entry.interactive,
            interactive: entry.interactive,
            sessionId: entry.sessionId,
          },
        }
      }
      if (entry.contentType === 'markdown') {
        const filePath = entry.filePath ?? ''
        return {
          ...base,
          contentType: 'markdown' as const,
          meta: { markdown: '', filePath, loading: !!filePath },
        }
      }
      if (entry.contentType === 'pdf') {
        return {
          ...base,
          contentType: 'pdf' as const,
          meta: { filePath: entry.filePath ?? '', loading: false },
        }
      }
      if (entry.contentType === 'image') {
        return {
          ...base,
          contentType: 'image' as const,
          meta: { filePath: entry.filePath ?? '' },
        }
      }
      if (entry.contentType === 'email') {
        return {
          ...base,
          contentType: 'email' as const,
          meta: {
            jsonPath: entry.filePath ?? '',
            dirPath: entry.directoryPath ?? '',
          },
        }
      }
      if (entry.contentType === 'csv') {
        const filePath = entry.filePath ?? ''
        return {
          ...base,
          contentType: 'csv' as const,
          meta: { csv: '', filePath, loading: !!filePath },
        }
      }
      if (entry.directoryPath) {
        return {
          ...base,
          contentType: 'directory' as const,
          meta: {
            directoryPath: entry.directoryPath,
            directoryItems: [],
            loading: true,
          },
        }
      }
      return {
        ...base,
        contentType: 'directory' as const,
      }
    })

    set({ windows, nextZIndex: nextZIndex + openEntries.length })
  },

  rewriteTaskPaths: (oldPrefix, newPrefix) =>
    set((s) => ({
      windows: s.windows.map((w) => {
        const id = w.id.includes(oldPrefix)
          ? w.id.replace(oldPrefix, newPrefix)
          : w.id

        if (w.contentType === 'markdown') {
          const filePath = w.meta.filePath.includes(oldPrefix)
            ? w.meta.filePath.replace(oldPrefix, newPrefix)
            : w.meta.filePath
          return { ...w, id, meta: { ...w.meta, filePath } }
        }
        if (w.contentType === 'pdf') {
          const filePath = w.meta.filePath.includes(oldPrefix)
            ? w.meta.filePath.replace(oldPrefix, newPrefix)
            : w.meta.filePath
          return { ...w, id, meta: { ...w.meta, filePath } }
        }
        if (w.contentType === 'csv') {
          const filePath = w.meta.filePath.includes(oldPrefix)
            ? w.meta.filePath.replace(oldPrefix, newPrefix)
            : w.meta.filePath
          return { ...w, id, meta: { ...w.meta, filePath } }
        }
        if (w.contentType === 'directory' && w.meta?.directoryPath) {
          const directoryPath = w.meta.directoryPath.includes(oldPrefix)
            ? w.meta.directoryPath.replace(oldPrefix, newPrefix)
            : w.meta.directoryPath
          return { ...w, id, meta: { ...w.meta, directoryPath } }
        }
        return { ...w, id }
      }),
    })),

  // Close windows belonging to a specific task. Two categories:
  //
  // 1. Path-based windows (plan, working files, outputs): matched by filePath
  //    or directoryPath prefix. Because rewriteTaskPaths rewrites paths during
  //    rename BEFORE this runs, closeTaskWindows(oldSlug) finds nothing to
  //    remove — renamed windows stay open.
  //
  // 2. Virtual task windows (inputs, debug panels): have constant IDs with no
  //    task-scoped paths. Only closed when leavingTaskMode is true (navigating
  //    to stream view). They stay open during task switches since they read
  //    live data from the desktop store reactively.
  closeTaskWindows: (streamSlug, taskSlug, leavingTaskMode = false) => {
    const taskPath = `${streamSlug}/tasks/${taskSlug}/`
    const virtualTaskWindows = new Set([
      'debug-activity',
      'debug-git-log',
      'debug-mock-run',
    ])
    set((s) => ({
      windows: s.windows.filter((w) => {
        // Path-based: check file/directory paths
        if (
          w.contentType === 'markdown' ||
          w.contentType === 'pdf' ||
          w.contentType === 'csv'
        ) {
          if (w.meta.filePath?.startsWith(taskPath)) return false
        }
        if (w.contentType === 'directory') {
          if (w.meta?.directoryPath?.startsWith(taskPath)) return false
        }
        if (w.id.startsWith(`file-${taskPath}`)) return false
        // Virtual: only close when leaving task mode entirely
        if (leavingTaskMode && virtualTaskWindows.has(w.id)) return false
        return true
      }),
    }))
  },

  clearAll: () => set({ windows: [], nextZIndex: 31 }),
}))

// ── Per-window selectors ──────────────────────────────────────────────────
// These let individual window components subscribe to only their own state,
// so updating window A's markdown doesn't re-render window B.

/** Returns just the IDs of open windows (stable via shallow comparison). */
export function useOpenWindowIds(): string[] {
  return useWindowStore(
    useShallow((s) => s.windows.filter((w) => w.isOpen).map((w) => w.id)),
  )
}

/** Returns a single window's state by ID. */
export function useWindowById(id: string): WindowState | undefined {
  return useWindowStore((s) => s.windows.find((w) => w.id === id))
}
