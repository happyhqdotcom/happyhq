import { useDesktopStore } from '@/stores/desktopStore'
import { useWindowStore } from '@/stores/windowStore'
import { act, renderHook } from '@testing-library/react'
import { useDesktopWindows } from './use-desktop-windows'

// ── Mocks ────────────────────────────────────────────────────────────────

let mockParams: Record<string, string> = { stream: 'my-project' }
vi.mock('next/navigation', () => ({
  useParams: () => mockParams,
}))

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  // Reset windowStore between tests so windows don't leak
  useWindowStore.setState({ windows: [], nextZIndex: 31 })
  mockParams = { stream: 'my-project' }
})

describe('useDesktopWindows', () => {
  describe('file path computation', () => {
    it('derives playbookFilePath from streamSlug', () => {
      useDesktopStore.getState().reset()
      const { result } = renderHook(() => useDesktopWindows())

      expect(result.current.playbookFilePath).toBe('my-project/playbook.md')
    })

    it('derives planFilePath from streamSlug and task param', () => {
      mockParams = { stream: 'my-project', task: 'fix-bug' }
      const { result } = renderHook(() => useDesktopWindows())

      expect(result.current.planFilePath).toBe(
        'my-project/tasks/fix-bug/plan.md',
      )
    })

    it('returns empty planFilePath when no active task', () => {
      useDesktopStore.getState().reset()
      const { result } = renderHook(() => useDesktopWindows())

      expect(result.current.planFilePath).toBe('')
    })
  })

  describe('openOrFocusWindow', () => {
    it('opens a new window when none exists with that ID', () => {
      useDesktopStore.getState().reset()
      const { result } = renderHook(() => useDesktopWindows())

      act(() => {
        result.current.openOrFocusWindow(
          'test-win',
          'Test',
          'path/file.md',
          '# Hello',
        )
      })

      const win = useWindowStore
        .getState()
        .windows.find((w) => w.id === 'test-win')
      expect(win).not.toBeNull()
      expect(win?.isOpen).toBe(true)
      expect(win?.title).toBe('Test')
    })

    it('focuses an existing open window instead of opening a duplicate', () => {
      useDesktopStore.getState().reset()
      const { result } = renderHook(() => useDesktopWindows())

      // Open the window first
      act(() => {
        result.current.openOrFocusWindow(
          'test-win',
          'Test',
          'path/file.md',
          '# Hello',
        )
      })

      const initialZIndex = useWindowStore
        .getState()
        .windows.find((w) => w.id === 'test-win')!.zIndex

      // Call again — should focus (raise z-index), not create a new window
      act(() => {
        result.current.openOrFocusWindow(
          'test-win',
          'Test',
          'path/file.md',
          '# Updated',
        )
      })

      const windows = useWindowStore.getState().windows
      const matching = windows.filter((w) => w.id === 'test-win')
      expect(matching).toHaveLength(1)
      expect(matching[0].zIndex).toBeGreaterThan(initialZIndex)
    })
  })

  describe('openDirectoryWindow', () => {
    it('opens a new directory window when none exists', () => {
      useDesktopStore.getState().reset()
      const { result } = renderHook(() => useDesktopWindows())

      act(() => {
        result.current.openDirectoryWindow('dir-specs', 'Specs')
      })

      const win = useWindowStore
        .getState()
        .windows.find((w) => w.id === 'dir-specs')
      expect(win).not.toBeNull()
      expect(win?.isOpen).toBe(true)
      expect(win?.contentType).toBe('directory')
    })

    it('focuses an existing open directory window', () => {
      useDesktopStore.getState().reset()
      const { result } = renderHook(() => useDesktopWindows())

      act(() => {
        result.current.openDirectoryWindow('dir-specs', 'Specs')
      })

      const initialZIndex = useWindowStore
        .getState()
        .windows.find((w) => w.id === 'dir-specs')!.zIndex

      act(() => {
        result.current.openDirectoryWindow('dir-specs', 'Specs')
      })

      const windows = useWindowStore.getState().windows
      const matching = windows.filter((w) => w.id === 'dir-specs')
      expect(matching).toHaveLength(1)
      expect(matching[0].zIndex).toBeGreaterThan(initialZIndex)
    })
  })
})
