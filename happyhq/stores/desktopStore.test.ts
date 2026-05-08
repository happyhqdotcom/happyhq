import type { ActivityStep } from '@/components/features/desktop/hooks/use-run-activity'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDesktopStore } from './desktopStore'

vi.stubGlobal('window', {
  location: { pathname: '/' },
})

// Mock next/navigation — useStreamSlug reads useParams()
vi.mock('next/navigation', () => ({
  useParams: () => ({ stream: 'test-stream' }),
}))

describe('desktopStore', () => {
  beforeEach(() => {
    useDesktopStore.getState().reset()
  })

  describe('reset', () => {
    it('reset clears selectedStream', () => {
      useDesktopStore.getState().setSelectedStream('renamed')
      expect(useDesktopStore.getState().selectedStream).toBe('renamed')
      useDesktopStore.getState().reset()
      expect(useDesktopStore.getState().selectedStream).toBeNull()
    })
  })

  describe('setSelectedStream', () => {
    it('sets and clears the override', () => {
      useDesktopStore.getState().setSelectedStream('renamed-stream')
      expect(useDesktopStore.getState().selectedStream).toBe('renamed-stream')
      useDesktopStore.getState().setSelectedStream(null)
      expect(useDesktopStore.getState().selectedStream).toBeNull()
    })
  })

  describe('setRunState', () => {
    it('hydrates run activity state', () => {
      const steps: ActivityStep[] = [
        {
          toolUseId: 't1',
          toolName: 'Read',
          label: 'Reading file',
          detail: null,
          linesAdded: null,
          elapsedSeconds: 3,
          isActive: true,
        },
      ]

      useDesktopStore.getState().setRunState({
        isRunActive: true,
        activitySteps: steps,
        statusLine: 'Reading... (3s)',
      })

      const state = useDesktopStore.getState()
      expect(state.isRunActive).toBe(true)
      expect(state.activitySteps).toBe(steps)
      expect(state.statusLine).toBe('Reading... (3s)')
    })
  })

  describe('setRunActionsState', () => {
    it('hydrates run actions loading, stopping, error, and action refs', () => {
      const approve = vi.fn()
      const start = vi.fn()
      const stop = vi.fn()

      useDesktopStore.getState().setRunActionsState({
        isLoading: true,
        isStopping: false,
        error: null,
        approve,
        continue_: vi.fn(),
        start,
        stop,
        answerQuestion: vi.fn(),
        upgradeNeeded: false,
        billingWarning: null,
        remainingMinutes: null,
      })

      const state = useDesktopStore.getState()
      expect(state.runActionsLoading).toBe(true)
      expect(state.runActionsStopping).toBe(false)
      expect(state.runActionsError).toBeNull()
      expect(state.runApprove).toBe(approve)
      expect(state.runStart).toBe(start)
      expect(state.runStop).toBe(stop)
    })

    it('hydrates error state', () => {
      useDesktopStore.getState().setRunActionsState({
        isLoading: false,
        isStopping: false,
        error: 'Failed to approve',
        approve: vi.fn(),
        continue_: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        answerQuestion: vi.fn(),
        upgradeNeeded: false,
        billingWarning: null,
        remainingMinutes: null,
      })

      expect(useDesktopStore.getState().runActionsError).toBe(
        'Failed to approve',
      )
    })
  })

  describe('refs default to null', () => {
    it('run action refs start null', () => {
      expect(useDesktopStore.getState().runApprove).toBeNull()
      expect(useDesktopStore.getState().runStart).toBeNull()
      expect(useDesktopStore.getState().runStop).toBeNull()
    })
  })
})
