import { beforeEach, describe, expect, it } from 'vitest'
import type { SavedWindowState, WindowConfig } from './windowStore'
import { useWindowStore } from './windowStore'

// ── Fixtures ──────────────────────────────────────────────────────────────

const markdownConfig: WindowConfig = {
  id: 'plan',
  title: 'Plan',
  contentType: 'markdown',
  position: { x: 200, y: 24 },
  size: { width: 576, height: 600 },
  meta: { markdown: '# Plan', filePath: '/plan.md' },
}

const directoryConfig: WindowConfig = {
  id: 'specs',
  title: 'Specs',
  contentType: 'directory',
  position: { x: 160, y: 48 },
  size: { width: 380, height: 420 },
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('windowStore', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: [], nextZIndex: 31 })
  })

  describe('openWindow', () => {
    it('adds a new window with isOpen true and the current nextZIndex', () => {
      useWindowStore.getState().openWindow(markdownConfig)

      const { windows, nextZIndex } = useWindowStore.getState()
      expect(windows).toHaveLength(1)
      expect(windows[0].id).toBe('plan')
      expect(windows[0].isOpen).toBe(true)
      expect(windows[0].zIndex).toBe(31)
      expect(nextZIndex).toBe(32)
    })

    it('reopens a closed window with isOpen true and a new zIndex', () => {
      const { openWindow, closeWindow } = useWindowStore.getState()
      openWindow(markdownConfig)
      closeWindow('plan')

      expect(useWindowStore.getState().windows[0].isOpen).toBe(false)

      useWindowStore.getState().openWindow(markdownConfig)

      const { windows } = useWindowStore.getState()
      expect(windows).toHaveLength(1) // no duplicate entry
      expect(windows[0].isOpen).toBe(true)
      expect(windows[0].zIndex).toBe(32)
    })

    it('focuses an already-open window by assigning a new zIndex', () => {
      const { openWindow } = useWindowStore.getState()
      openWindow(markdownConfig)
      openWindow(directoryConfig)

      // Re-open the first window — should get a higher zIndex
      useWindowStore.getState().openWindow(markdownConfig)

      const { windows } = useWindowStore.getState()
      const plan = windows.find((w) => w.id === 'plan')!
      const specs = windows.find((w) => w.id === 'specs')!
      expect(plan.zIndex).toBeGreaterThan(specs.zIndex)
    })

    it('updates meta when reopening a markdown window', () => {
      useWindowStore.getState().openWindow(markdownConfig)

      const updatedConfig: WindowConfig = {
        ...markdownConfig,
        meta: { markdown: '# Updated Plan', filePath: '/plan.md' },
      }
      useWindowStore.getState().openWindow(updatedConfig)

      const win = useWindowStore.getState().windows[0]
      expect(win.contentType).toBe('markdown')
      if (win.contentType === 'markdown') {
        expect(win.meta.markdown).toBe('# Updated Plan')
      }
    })
  })

  describe('closeWindow', () => {
    it('sets isOpen to false without removing the window', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      useWindowStore.getState().closeWindow('plan')

      const { windows } = useWindowStore.getState()
      expect(windows).toHaveLength(1)
      expect(windows[0].isOpen).toBe(false)
    })
  })

  describe('focusWindow', () => {
    it('assigns the next zIndex and increments the counter', () => {
      const { openWindow } = useWindowStore.getState()
      openWindow(markdownConfig)
      openWindow(directoryConfig)

      // Focus the first window — should now have the highest zIndex
      useWindowStore.getState().focusWindow('plan')

      const { windows, nextZIndex } = useWindowStore.getState()
      const plan = windows.find((w) => w.id === 'plan')!
      const specs = windows.find((w) => w.id === 'specs')!
      expect(plan.zIndex).toBeGreaterThan(specs.zIndex)
      expect(nextZIndex).toBe(34) // 31 (open plan) + 32 (open specs) + 33 (focus plan) -> next is 34
    })
  })

  describe('moveWindow', () => {
    it('updates position for the target window only', () => {
      const { openWindow } = useWindowStore.getState()
      openWindow(markdownConfig)
      openWindow(directoryConfig)

      useWindowStore.getState().moveWindow('plan', { x: 500, y: 300 })

      const { windows } = useWindowStore.getState()
      const plan = windows.find((w) => w.id === 'plan')!
      const specs = windows.find((w) => w.id === 'specs')!
      expect(plan.position).toEqual({ x: 500, y: 300 })
      // directoryConfig was opened 2nd, so cascade offsets by 1 step (24px)
      expect(specs.position).toEqual({
        x: directoryConfig.position.x + 24,
        y: directoryConfig.position.y + 24,
      })
    })
  })

  describe('resizeWindow', () => {
    it('updates size for the target window only', () => {
      const { openWindow } = useWindowStore.getState()
      openWindow(markdownConfig)
      openWindow(directoryConfig)

      useWindowStore.getState().resizeWindow('specs', {
        width: 800,
        height: 600,
      })

      const { windows } = useWindowStore.getState()
      const plan = windows.find((w) => w.id === 'plan')!
      const specs = windows.find((w) => w.id === 'specs')!
      expect(specs.size).toEqual({ width: 800, height: 600 })
      expect(plan.size).toEqual(markdownConfig.size) // unchanged
    })
  })

  describe('updateWindowMeta', () => {
    it('merges partial meta into a markdown window', () => {
      useWindowStore.getState().openWindow(markdownConfig)

      useWindowStore
        .getState()
        .updateWindowMeta('plan', { markdown: '# Updated' })

      const win = useWindowStore.getState().windows[0]
      expect(win.contentType).toBe('markdown')
      if (win.contentType === 'markdown') {
        expect(win.meta.markdown).toBe('# Updated')
        expect(win.meta.filePath).toBe('/plan.md') // preserved
      }
    })

    it('sets lastUpdatedAt when updating non-empty markdown', () => {
      useWindowStore.getState().openWindow(markdownConfig) // markdown: '# Plan'

      useWindowStore
        .getState()
        .updateWindowMeta('plan', { markdown: '# Updated Plan' })

      const win = useWindowStore.getState().windows[0]
      if (win.contentType === 'markdown') {
        expect(win.meta.lastUpdatedAt).toBeTypeOf('number')
      }
    })

    it('does not set lastUpdatedAt when populating empty markdown', () => {
      useWindowStore.getState().openWindow({
        ...markdownConfig,
        meta: { markdown: '', filePath: '/plan.md' },
      })

      useWindowStore
        .getState()
        .updateWindowMeta('plan', { markdown: '# Content' })

      const win = useWindowStore.getState().windows[0]
      if (win.contentType === 'markdown') {
        expect(win.meta.lastUpdatedAt).toBeUndefined()
      }
    })

    it('does not set lastUpdatedAt on initial load transition', () => {
      useWindowStore.getState().openWindow({
        ...markdownConfig,
        meta: { markdown: '', filePath: '/plan.md', loading: true },
      })

      useWindowStore
        .getState()
        .updateWindowMeta('plan', { markdown: '# Content', loading: false })

      const win = useWindowStore.getState().windows[0]
      if (win.contentType === 'markdown') {
        expect(win.meta.lastUpdatedAt).toBeUndefined()
      }
    })

    it('is a no-op for directory windows', () => {
      useWindowStore.getState().openWindow(directoryConfig)

      useWindowStore
        .getState()
        .updateWindowMeta('specs', { markdown: 'injected' })

      const win = useWindowStore.getState().windows[0]
      expect(win.contentType).toBe('directory')
      // Directory windows don't have meta — should be unchanged
      expect('meta' in win).toBe(false)
    })
  })

  describe('toggleMaximize', () => {
    it('saves current bounds and fills canvas when maximizing', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      const before = useWindowStore.getState().windows[0]
      const originalPosition = { ...before.position }
      const originalSize = { ...before.size }

      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })

      const win = useWindowStore.getState().windows[0]
      expect(win.isMaximized).toBe(true)
      expect(win.position).toEqual({ x: 0, y: 0 })
      expect(win.size).toEqual({ width: 1200, height: 800 })
      expect(win.savedBounds).toEqual({
        position: originalPosition,
        size: originalSize,
      })
    })

    it('restores saved bounds when un-maximizing', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      const before = useWindowStore.getState().windows[0]
      const originalPosition = { ...before.position }
      const originalSize = { ...before.size }

      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })
      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })

      const win = useWindowStore.getState().windows[0]
      expect(win.isMaximized).toBe(false)
      expect(win.position).toEqual(originalPosition)
      expect(win.size).toEqual(originalSize)
      expect(win.savedBounds).toBeUndefined()
    })

    it('bumps zIndex when maximizing (focuses the window)', () => {
      const { openWindow } = useWindowStore.getState()
      openWindow(markdownConfig)
      openWindow(directoryConfig)

      const specsBefore = useWindowStore
        .getState()
        .windows.find((w) => w.id === 'specs')!

      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })

      const plan = useWindowStore
        .getState()
        .windows.find((w) => w.id === 'plan')!
      expect(plan.zIndex).toBeGreaterThan(specsBefore.zIndex)
    })

    it('does not bump zIndex when restoring', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })

      const zIndexBefore = useWindowStore.getState().nextZIndex

      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })

      expect(useWindowStore.getState().nextZIndex).toBe(zIndexBefore)
    })
  })

  describe('restoreWindow', () => {
    it('restores a maximized window to its saved bounds', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      const before = useWindowStore.getState().windows[0]
      const originalPosition = { ...before.position }
      const originalSize = { ...before.size }

      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })
      useWindowStore.getState().restoreWindow('plan')

      const win = useWindowStore.getState().windows[0]
      expect(win.isMaximized).toBe(false)
      expect(win.position).toEqual(originalPosition)
      expect(win.size).toEqual(originalSize)
      expect(win.savedBounds).toBeUndefined()
    })

    it('is a no-op for a non-maximized window', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      const before = useWindowStore.getState().windows[0]
      const positionBefore = { ...before.position }
      const sizeBefore = { ...before.size }

      useWindowStore.getState().restoreWindow('plan')

      const win = useWindowStore.getState().windows[0]
      expect(win.isMaximized).toBe(false)
      expect(win.position).toEqual(positionBefore)
      expect(win.size).toEqual(sizeBefore)
    })
  })

  describe('openWindow preserves layout for already-open windows', () => {
    it('preserves position and size when called for an already-open window', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      useWindowStore.getState().moveWindow('plan', { x: 500, y: 300 })
      useWindowStore
        .getState()
        .resizeWindow('plan', { width: 800, height: 700 })

      const updatedConfig: WindowConfig = {
        ...markdownConfig,
        meta: { markdown: '# Updated', filePath: '/plan.md' },
      }
      useWindowStore.getState().openWindow(updatedConfig)

      const win = useWindowStore.getState().windows[0]
      expect(win.position).toEqual({ x: 500, y: 300 })
      expect(win.size).toEqual({ width: 800, height: 700 })
      if (win.contentType === 'markdown') {
        expect(win.meta.markdown).toBe('# Updated')
      }
    })

    it('preserves isMaximized when called for an already-open window', () => {
      useWindowStore.getState().openWindow(markdownConfig)
      useWindowStore
        .getState()
        .toggleMaximize('plan', { width: 1200, height: 800 })

      const updatedConfig: WindowConfig = {
        ...markdownConfig,
        meta: { markdown: '# Updated', filePath: '/plan.md' },
      }
      useWindowStore.getState().openWindow(updatedConfig)

      const win = useWindowStore.getState().windows[0]
      expect(win.isMaximized).toBe(true)
      expect(win.savedBounds).toBeDefined()
    })
  })

  describe('z-index ordering', () => {
    it('each open/focus assigns a strictly higher zIndex than the previous', () => {
      const { openWindow } = useWindowStore.getState()
      openWindow(markdownConfig)
      openWindow(directoryConfig)

      const thirdConfig: WindowConfig = {
        id: 'samples',
        title: 'Samples',
        contentType: 'directory',
        position: { x: 100, y: 100 },
        size: { width: 380, height: 420 },
      }
      useWindowStore.getState().openWindow(thirdConfig)
      useWindowStore.getState().focusWindow('plan')

      const { windows } = useWindowStore.getState()
      const zIndexes = windows.map((w) => w.zIndex)

      // plan was opened first (31), then specs (32), then samples (33), then plan focused (34)
      expect(windows.find((w) => w.id === 'plan')!.zIndex).toBe(34)
      expect(windows.find((w) => w.id === 'specs')!.zIndex).toBe(32)
      expect(windows.find((w) => w.id === 'samples')!.zIndex).toBe(33)

      // All z-indexes are unique
      const unique = new Set(zIndexes)
      expect(unique.size).toBe(zIndexes.length)
    })
  })

  describe('restoreLayout', () => {
    it('restores window positions, sizes, and maximize state from saved layout', () => {
      const saved: SavedWindowState[] = [
        {
          id: 'plan',
          contentType: 'markdown',
          title: 'plan.md',
          filePath: '/plan.md',
          position: { x: 100, y: 50 },
          size: { width: 600, height: 400 },
          isOpen: true,
          isMaximized: false,
        },
        {
          id: 'specs',
          contentType: 'directory',
          title: 'Specs',
          position: { x: 300, y: 200 },
          size: { width: 400, height: 350 },
          isOpen: true,
          isMaximized: true,
          savedBounds: {
            position: { x: 50, y: 30 },
            size: { width: 380, height: 420 },
          },
        },
      ]

      useWindowStore.getState().restoreLayout(saved)

      const { windows } = useWindowStore.getState()
      expect(windows).toHaveLength(2)

      const plan = windows.find((w) => w.id === 'plan')!
      expect(plan.position).toEqual({ x: 100, y: 50 })
      expect(plan.size).toEqual({ width: 600, height: 400 })
      expect(plan.isOpen).toBe(true)
      expect(plan.isMaximized).toBe(false)
      expect(plan.contentType).toBe('markdown')
      expect(plan.title).toBe('plan.md')
      if (plan.contentType === 'markdown') {
        expect(plan.meta.filePath).toBe('/plan.md')
        expect(plan.meta.loading).toBe(true)
      }

      const specs = windows.find((w) => w.id === 'specs')!
      expect(specs.position).toEqual({ x: 300, y: 200 })
      expect(specs.size).toEqual({ width: 400, height: 350 })
      expect(specs.isMaximized).toBe(true)
      expect(specs.savedBounds).toEqual({
        position: { x: 50, y: 30 },
        size: { width: 380, height: 420 },
      })
    })

    it('filters out closed windows — only restores open entries', () => {
      const saved: SavedWindowState[] = [
        {
          id: 'plan',
          contentType: 'markdown',
          title: 'plan.md',
          position: { x: 100, y: 50 },
          size: { width: 600, height: 400 },
          isOpen: true,
          isMaximized: false,
        },
        {
          id: 'closed-one',
          contentType: 'directory',
          title: 'Closed',
          position: { x: 0, y: 0 },
          size: { width: 380, height: 420 },
          isOpen: false,
          isMaximized: false,
        },
      ]

      useWindowStore.getState().restoreLayout(saved)

      const { windows } = useWindowStore.getState()
      expect(windows).toHaveLength(1)
      expect(windows[0].id).toBe('plan')
    })

    it('is a no-op for an empty array', () => {
      useWindowStore.getState().restoreLayout([])

      const { windows, nextZIndex } = useWindowStore.getState()
      expect(windows).toHaveLength(0)
      expect(nextZIndex).toBe(31) // unchanged
    })

    it('assigns sequential zIndexes to restored windows', () => {
      const saved: SavedWindowState[] = [
        {
          id: 'a',
          contentType: 'markdown',
          title: 'A',
          position: { x: 0, y: 0 },
          size: { width: 400, height: 300 },
          isOpen: true,
          isMaximized: false,
        },
        {
          id: 'b',
          contentType: 'directory',
          title: 'B',
          position: { x: 100, y: 100 },
          size: { width: 400, height: 300 },
          isOpen: true,
          isMaximized: false,
        },
      ]

      useWindowStore.getState().restoreLayout(saved)

      const { windows, nextZIndex } = useWindowStore.getState()
      expect(windows[0].zIndex).toBe(31)
      expect(windows[1].zIndex).toBe(32)
      expect(nextZIndex).toBe(33)
    })
  })

  describe('restoreLayout + openWindow integration', () => {
    it('openWindow preserves restored layout but updates content', () => {
      // Restore a placeholder markdown window
      const saved: SavedWindowState[] = [
        {
          id: 'plan',
          contentType: 'markdown',
          title: 'plan.md',
          position: { x: 100, y: 50 },
          size: { width: 600, height: 400 },
          isOpen: true,
          isMaximized: false,
        },
      ]
      useWindowStore.getState().restoreLayout(saved)

      // SWR hydration calls openWindow with content
      useWindowStore.getState().openWindow({
        id: 'plan',
        contentType: 'markdown',
        title: 'Plan',
        position: { x: 200, y: 24 }, // different from restored position
        size: { width: 576, height: 600 }, // different from restored size
        meta: { markdown: '# Real content', filePath: '/plan.md' },
      })

      const win = useWindowStore.getState().windows[0]
      // Layout preserved from restore, not overwritten by openWindow
      expect(win.position).toEqual({ x: 100, y: 50 })
      expect(win.size).toEqual({ width: 600, height: 400 })
      // Content updated
      if (win.contentType === 'markdown') {
        expect(win.meta.markdown).toBe('# Real content')
        expect(win.meta.filePath).toBe('/plan.md')
      }
      expect(win.title).toBe('Plan')
    })

    it('openWindow preserves maximized state after restore', () => {
      const saved: SavedWindowState[] = [
        {
          id: 'plan',
          contentType: 'markdown',
          title: 'plan.md',
          position: { x: 0, y: 0 },
          size: { width: 1200, height: 800 },
          isOpen: true,
          isMaximized: true,
          savedBounds: {
            position: { x: 100, y: 50 },
            size: { width: 600, height: 400 },
          },
        },
      ]
      useWindowStore.getState().restoreLayout(saved)

      // openWindow for the same id should preserve maximize state
      useWindowStore.getState().openWindow({
        id: 'plan',
        contentType: 'markdown',
        title: 'Plan',
        position: { x: 200, y: 24 },
        size: { width: 576, height: 600 },
        meta: { markdown: '# Plan', filePath: '/plan.md' },
      })

      const win = useWindowStore.getState().windows[0]
      expect(win.isMaximized).toBe(true)
      expect(win.savedBounds).toEqual({
        position: { x: 100, y: 50 },
        size: { width: 600, height: 400 },
      })
    })
  })
})
