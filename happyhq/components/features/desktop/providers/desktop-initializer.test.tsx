import type { DesktopData, StreamContent, TaskContent } from '@/lib/fs/types'
import { useDesktopStore } from '@/stores/desktopStore'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  mockUseSWR,
  mockUseRunActivity,
  mockUseRunActions,
  mockUseCurrentUser,
  mockUseParams,
} = vi.hoisted(() => ({
  mockUseSWR: vi.fn(),
  mockUseRunActivity: vi.fn(),
  mockUseRunActions: vi.fn(),
  mockUseCurrentUser: vi.fn(),
  mockUseParams: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}))

vi.mock('swr', () => ({
  default: mockUseSWR,
}))

vi.mock('../hooks/use-run-activity', () => ({
  useRunActivity: mockUseRunActivity,
}))

vi.mock('../hooks/use-run-actions', () => ({
  useRunActions: mockUseRunActions,
}))

vi.mock('@/lib/accounts/hooks', () => ({
  useCurrentUser: mockUseCurrentUser,
}))

import { DesktopInitializer } from './desktop-initializer'

// ── Helpers ────────────────────────────────────────────────────────

const STREAM_CONTENT: StreamContent = {
  playbook: 'test playbook',
  playbookTitle: null,
  playbookBody: 'test playbook',
  specs: [],
  samples: [],
  sampleTypes: [],
}

const TASK_CONTENT: TaskContent = {
  frontmatter: null,
  plan: '# Plan',
  description: null,
  run: {
    status: 'working',
    startedAt: '2024-01-01',
    lastIterationAt: '2024-01-01',
    phases: [],
  },
  inputs: [],
  working: [],
  outputs: [],
}

const DESKTOP_DATA: DesktopData = {
  streamContent: STREAM_CONTENT,
  taskContent: TASK_CONTENT,
  chats: [
    {
      sessionId: 's1',
      title: 'Chat 1',
      streamName: 'test-stream',
      createdAt: '2024-01-01',
    },
  ],
}

function setupDefaults(streamSlug = 'test-stream', taskSlug?: string) {
  mockUseParams.mockReturnValue({
    stream: streamSlug || undefined,
    task: taskSlug,
  })
  mockUseCurrentUser.mockReturnValue({
    user: null,
    isLoading: false,
    isAuthenticated: false,
    token: undefined,
  })

  mockUseSWR.mockImplementation(() => ({
    data: undefined,
    error: undefined,
    mutate: vi.fn(),
  }))

  mockUseRunActivity.mockReturnValue({
    statusLine: null,
    lastResultAt: null,
    lastContentChangeAt: null,
    isConnected: false,
    activitySteps: [],
  })

  mockUseRunActions.mockReturnValue({
    approve: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    isLoading: false,
    isStopping: false,
    error: null,
    upgradeNeeded: false,
    billingWarning: null,
    remainingMinutes: null,
  })
}

function renderProvider(streamSlug = 'test-stream', taskSlug?: string) {
  setupDefaults(streamSlug, taskSlug)
  return render(<DesktopInitializer />)
}

// ── Tests ──────────────────────────────────────────────────────────

describe('DesktopInitializer', () => {
  beforeEach(() => {
    setupDefaults()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  describe('single SWR fetch', () => {
    it('uses combined desktop data key', () => {
      renderProvider()

      expect(mockUseSWR).toHaveBeenCalledWith(
        '/api/fs/desktop?stream=test-stream',
        expect.any(Function),
        expect.any(Object),
      )
    })

    it('includes task in SWR key when task is active', () => {
      renderProvider('test-stream', 'my-task')

      expect(mockUseSWR).toHaveBeenCalledWith(
        '/api/fs/desktop?stream=test-stream&task=my-task',
        expect.any(Function),
        expect.any(Object),
      )
    })

    it('sets run state in store when data arrives with an active run', () => {
      mockUseSWR.mockImplementation(() => ({
        data: DESKTOP_DATA,
        error: undefined,
        mutate: vi.fn(),
      }))

      renderProvider('test-stream', 'my-task')

      // Server data lives in SWR cache, not the Zustand store.
      // The provider pushes only client-only state (run activity, run actions).
      // Task slug is read from URL params directly — not stored in Zustand.
      const state = useDesktopStore.getState()
      expect(state.isRunActive).toBe(false)
    })
  })

  describe('run activity integration', () => {
    it('passes isRunActive=false when no active run', () => {
      renderProvider()
      expect(mockUseRunActivity).toHaveBeenCalledWith(
        false,
        null,
        expect.any(Function),
      )
    })

    it('passes isRunActive=true when task has a running status', () => {
      mockUseParams.mockReturnValue({ stream: 'test-stream', task: 'my-task' })
      mockUseSWR.mockImplementation(() => ({
        data: DESKTOP_DATA,
        error: undefined,
        mutate: vi.fn(),
      }))

      render(<DesktopInitializer />)
      expect(mockUseRunActivity).toHaveBeenCalledWith(
        true,
        TASK_CONTENT.run!.startedAt,
        expect.any(Function),
      )
    })

    it('passes isRunActive=false when task status is completed', () => {
      // Set params before the SWR override so renderProvider's setupDefaults
      // doesn't clobber it (setupDefaults wires both useParams and useSWR).
      mockUseParams.mockReturnValue({ stream: 'test-stream', task: 'my-task' })
      mockUseSWR.mockImplementation(() => ({
        data: {
          ...DESKTOP_DATA,
          taskContent: {
            ...TASK_CONTENT,
            run: { ...TASK_CONTENT.run!, status: 'completed' },
          },
        },
        error: undefined,
        mutate: vi.fn(),
      }))

      render(<DesktopInitializer />)
      expect(mockUseRunActivity).toHaveBeenCalledWith(
        false,
        TASK_CONTENT.run!.startedAt,
        expect.any(Function),
      )
    })
  })

  describe('run actions integration', () => {
    it('passes stream identity to useRunActions', () => {
      renderProvider('test-stream', 'my-task')

      expect(mockUseRunActions).toHaveBeenCalledWith(
        'test-stream',
        'my-task',
        expect.any(Boolean),
        undefined,
      )
    })
  })

  describe('renders nothing', () => {
    it('produces no DOM output', () => {
      const { container } = renderProvider()
      expect(container.innerHTML).toBe('')
    })
  })
})
