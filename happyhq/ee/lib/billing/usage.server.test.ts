import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.hoisted(() => vi.fn())
const mockTransact = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn(() => 'tx-result'))
const mockLink = vi.hoisted(() => vi.fn(() => 'tx-link'))
const mockId = vi.hoisted(() => vi.fn(() => 'generated-id'))

// Track which entity/id combos get update/link calls
const makeTxProxy = () =>
  new Proxy(
    {},
    {
      get: (_target, _entityName) =>
        new Proxy(
          {},
          {
            get: (_t, _id) => ({
              update: mockUpdate,
              link: mockLink,
            }),
          },
        ),
    },
  )

const mockGetAdminDb = vi.hoisted(() =>
  vi.fn(() => ({
    query: mockQuery,
    transact: mockTransact,
    tx: makeTxProxy(),
  })),
)

vi.mock('@/lib/database/instant.server', () => ({
  getAdminDb: mockGetAdminDb,
  id: mockId,
}))

describe('usage.server', () => {
  beforeEach(() => {
    vi.resetModules()
    mockQuery.mockReset()
    mockTransact.mockReset()
    mockUpdate.mockReset()
    mockLink.mockReset()
    mockId.mockReturnValue('generated-id')
    mockGetAdminDb.mockReturnValue({
      query: mockQuery,
      transact: mockTransact,
      tx: makeTxProxy(),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getCurrentUsage', () => {
    it('returns the usage period that covers the current time', async () => {
      const now = Date.now()
      mockQuery.mockResolvedValue({
        usage: [
          {
            id: 'usage-1',
            periodStart: now - 1000,
            periodEnd: now + 86400000,
            usedMinutes: 10,
            includedMinutes: 60,
          },
        ],
        subscriptions: [],
      })

      const { getCurrentUsage } = await import('./usage.server')
      const result = await getCurrentUsage('user-1')

      expect(result).toMatchObject({
        id: 'usage-1',
        usedMinutes: 10,
        includedMinutes: 60,
      })
    })

    it('creates a free-tier usage period when no current period exists', async () => {
      const pastEnd = Date.now() - 86400000
      mockQuery.mockResolvedValueOnce({
        usage: [
          {
            id: 'usage-old',
            periodStart: pastEnd - 86400000,
            periodEnd: pastEnd,
            usedMinutes: 55,
            includedMinutes: 60,
          },
        ],
        // No active subscription — free user
        subscriptions: [],
      })
      mockTransact.mockResolvedValue(undefined)

      const { getCurrentUsage } = await import('./usage.server')
      const result = await getCurrentUsage('user-1')

      expect(result).toMatchObject({
        usedMinutes: 0,
        includedMinutes: 5, // free tier runtimeMinutes
      })
    })

    it('creates a free-tier usage period when user has no usage records', async () => {
      mockQuery.mockResolvedValueOnce({
        usage: [],
        // No active subscription — free user
        subscriptions: [],
      })
      mockTransact.mockResolvedValue(undefined)

      const { getCurrentUsage } = await import('./usage.server')
      const result = await getCurrentUsage('user-1')

      expect(result).toMatchObject({
        usedMinutes: 0,
        includedMinutes: 5, // free tier runtimeMinutes
      })
    })

    it('returns null for paid user with no current usage period', async () => {
      mockQuery.mockResolvedValueOnce({
        usage: [],
        // Active subscription — paid user whose invoice.paid hasn't fired yet
        subscriptions: [{ status: 'active', tier: 'pro' }],
      })

      const { getCurrentUsage } = await import('./usage.server')
      const result = await getCurrentUsage('user-1')

      expect(result).toBeNull()
    })

    it('queries usage and subscriptions linked to the user', async () => {
      mockQuery.mockResolvedValue({ usage: [], subscriptions: [] })

      const { getCurrentUsage } = await import('./usage.server')
      await getCurrentUsage('user-42')

      expect(mockQuery).toHaveBeenCalledWith({
        usage: { $: { where: { 'user.id': 'user-42' } } },
        subscriptions: { $: { where: { 'user.id': 'user-42' } } },
      })
    })
  })

  describe('startTaskRun', () => {
    it('creates a task run record linked to the current usage period', async () => {
      const now = Date.now()
      // getCurrentUsage will query usage + subscriptions
      mockQuery.mockResolvedValue({
        usage: [
          {
            id: 'usage-1',
            periodStart: now - 1000,
            periodEnd: now + 86400000,
            usedMinutes: 5,
            includedMinutes: 60,
          },
        ],
        subscriptions: [],
      })
      mockTransact.mockResolvedValue(undefined)

      const { startTaskRun } = await import('./usage.server')
      const taskRunId = await startTaskRun('user-1', 'my-stream', 'my-task')

      expect(taskRunId).toBe('generated-id')
      expect(mockTransact).toHaveBeenCalledWith([
        expect.anything(), // update call
        expect.anything(), // link call
      ])
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: 'my-stream',
          task: 'my-task',
          minutes: 0,
          status: 'running',
        }),
      )
      expect(mockLink).toHaveBeenCalledWith({ usagePeriod: 'usage-1' })
    })

    it('returns null when no current usage period exists for paid user', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        mockQuery.mockResolvedValueOnce({
          usage: [],
          // Active subscription — paid user whose invoice.paid hasn't fired yet
          subscriptions: [{ status: 'active', tier: 'pro' }],
        })

        const { startTaskRun } = await import('./usage.server')
        const result = await startTaskRun('user-1', 'my-stream', 'my-task')

        expect(result).toBeNull()
        expect(mockTransact).not.toHaveBeenCalled()
      } finally {
        warnSpy.mockRestore()
      }
    })
  })

  describe('updateUsage', () => {
    it('increments minutes on the task run', async () => {
      mockQuery.mockResolvedValue({
        taskRuns: [{ id: 'run-1', minutes: 10 }],
      })
      mockTransact.mockResolvedValue(undefined)

      const { updateUsage } = await import('./usage.server')
      await updateUsage('run-1', 2.5)

      expect(mockUpdate).toHaveBeenCalledWith({ minutes: 12.5 })
    })

    it('handles zero existing minutes', async () => {
      mockQuery.mockResolvedValue({
        taskRuns: [{ id: 'run-1', minutes: 0 }],
      })
      mockTransact.mockResolvedValue(undefined)

      const { updateUsage } = await import('./usage.server')
      await updateUsage('run-1', 1.5)

      expect(mockUpdate).toHaveBeenCalledWith({ minutes: 1.5 })
    })

    it('logs error when task run is not found', async () => {
      mockQuery.mockResolvedValue({ taskRuns: [] })
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { updateUsage } = await import('./usage.server')
      await updateUsage('nonexistent', 1)

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('nonexistent'),
      )
      expect(mockTransact).not.toHaveBeenCalled()
      errorSpy.mockRestore()
    })

    it('queries task run by id', async () => {
      mockQuery.mockResolvedValue({
        taskRuns: [{ id: 'run-1', minutes: 0 }],
      })
      mockTransact.mockResolvedValue(undefined)

      const { updateUsage } = await import('./usage.server')
      await updateUsage('run-1', 1)

      expect(mockQuery).toHaveBeenCalledWith({
        taskRuns: { $: { where: { id: 'run-1' } } },
      })
    })
  })

  describe('finalizeTaskRun', () => {
    it('updates the task run with final status and duration', async () => {
      mockTransact.mockResolvedValue(undefined)
      // Follow-up query: task run with usagePeriod link
      mockQuery.mockResolvedValueOnce({
        taskRuns: [{ id: 'run-1', usagePeriod: [{ id: 'usage-1' }] }],
      })
      // Follow-up query: all runs for the usage period
      mockQuery.mockResolvedValueOnce({
        taskRuns: [{ id: 'run-1', minutes: 15.5 }],
      })

      const { finalizeTaskRun } = await import('./usage.server')
      await finalizeTaskRun('run-1', 'completed', 15.5)

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          minutes: 15.5,
          status: 'completed',
        }),
      )
    })

    it('sets endedAt timestamp on the task run', async () => {
      mockTransact.mockResolvedValue(undefined)
      mockQuery.mockResolvedValueOnce({
        taskRuns: [{ id: 'run-1', usagePeriod: [{ id: 'usage-1' }] }],
      })
      mockQuery.mockResolvedValueOnce({
        taskRuns: [{ id: 'run-1', minutes: 3 }],
      })
      const before = Date.now()

      const { finalizeTaskRun } = await import('./usage.server')
      await finalizeTaskRun('run-1', 'aborted', 3)

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          endedAt: expect.any(Number),
          status: 'aborted',
        }),
      )
      const call = (mockUpdate.mock.calls as any)[0][0]
      expect(call.endedAt).toBeGreaterThanOrEqual(before)
    })

    it('handles failed status', async () => {
      mockTransact.mockResolvedValue(undefined)
      mockQuery.mockResolvedValueOnce({
        taskRuns: [{ id: 'run-1', usagePeriod: [{ id: 'usage-1' }] }],
      })
      mockQuery.mockResolvedValueOnce({
        taskRuns: [{ id: 'run-1', minutes: 0 }],
      })

      const { finalizeTaskRun } = await import('./usage.server')
      await finalizeTaskRun('run-1', 'failed', 0)

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          minutes: 0,
        }),
      )
    })
  })
})
