import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// --- Hoisted mocks ---

const mockIsBillingEnabled = vi.hoisted(() => vi.fn())
const mockGetCurrentUsage = vi.hoisted(() => vi.fn())
const mockGetTierLimits = vi.hoisted(() => vi.fn())
const mockQuery = vi.hoisted(() => vi.fn())
const mockReadStreams = vi.hoisted(() => vi.fn())
const mockListDirectory = vi.hoisted(() => vi.fn())
const mockStreamPath = vi.hoisted(() => vi.fn())

const mockGetAdminDb = vi.hoisted(() =>
  vi.fn(() => ({
    query: mockQuery,
  })),
)

vi.mock('./config', () => ({
  isBillingEnabled: mockIsBillingEnabled,
}))

vi.mock('./usage.server', () => ({
  getCurrentUsage: mockGetCurrentUsage,
}))

vi.mock('./plans', () => ({
  getTierLimits: mockGetTierLimits,
}))

vi.mock('@/lib/database/instant.server', () => ({
  getAdminDb: mockGetAdminDb,
}))

vi.mock('@/lib/fs/read.server', () => ({
  readStreams: mockReadStreams,
  listDirectory: mockListDirectory,
}))

vi.mock('@/lib/fs/paths', () => ({
  streamPath: mockStreamPath,
}))

import {
  canCreateSpec,
  canCreateStream,
  canStartTask,
  canUploadSample,
} from './limits.server'

describe('limits.server', () => {
  beforeEach(() => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockStreamPath.mockImplementation((slug: string) => `/root/${slug}`)
    mockGetTierLimits.mockReturnValue({
      priceMonthly: 0,
      runtimeMinutes: 5,
      storageBytes: 104857600,
      streams: 1,
      samplesPerStream: 3,
      specsPerStream: 1,
      users: 1,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('canStartTask', () => {
    it('allows when billing is disabled', async () => {
      mockIsBillingEnabled.mockReturnValue(false)
      const result = await canStartTask('user-1')
      expect(result).toMatchObject({ allowed: true })
      expect(mockGetCurrentUsage).not.toHaveBeenCalled()
    })

    it('allows when no usage period exists', async () => {
      mockGetCurrentUsage.mockResolvedValue(null)
      const result = await canStartTask('user-1')
      expect(result).toMatchObject({ allowed: true })
    })

    it('blocks when usage is exhausted', async () => {
      mockGetCurrentUsage.mockResolvedValue({
        id: 'usage-1',
        periodStart: Date.now() - 1000,
        periodEnd: Date.now() + 86400000,
        usedMinutes: 60,
        includedMinutes: 60,
      })
      mockQuery.mockResolvedValue({ taskRuns: [{ minutes: 60 }] })

      const result = await canStartTask('user-1')
      expect(result).toMatchObject({
        allowed: false,
        reason: 'usage_exhausted',
      })
    })

    it('blocks when usage exceeds included minutes', async () => {
      mockGetCurrentUsage.mockResolvedValue({
        id: 'usage-1',
        periodStart: Date.now() - 1000,
        periodEnd: Date.now() + 86400000,
        usedMinutes: 65,
        includedMinutes: 60,
      })
      mockQuery.mockResolvedValue({ taskRuns: [{ minutes: 65 }] })

      const result = await canStartTask('user-1')
      expect(result).toMatchObject({
        allowed: false,
        reason: 'usage_exhausted',
      })
    })

    it('warns when remaining minutes are below threshold', async () => {
      mockGetCurrentUsage.mockResolvedValue({
        id: 'usage-1',
        periodStart: Date.now() - 1000,
        periodEnd: Date.now() + 86400000,
        usedMinutes: 56,
        includedMinutes: 60,
      })
      mockQuery.mockResolvedValue({ taskRuns: [{ minutes: 56 }] })

      const result = await canStartTask('user-1')
      expect(result).toMatchObject({
        allowed: true,
        warning: 'low_balance',
        remainingMinutes: 4,
      })
    })

    it('allows without warning when sufficient minutes remain', async () => {
      mockGetCurrentUsage.mockResolvedValue({
        id: 'usage-1',
        periodStart: Date.now() - 1000,
        periodEnd: Date.now() + 86400000,
        usedMinutes: 10,
        includedMinutes: 60,
      })
      mockQuery.mockResolvedValue({ taskRuns: [{ minutes: 10 }] })

      const result = await canStartTask('user-1')
      expect(result).toMatchObject({ allowed: true, remainingMinutes: 50 })
      expect(result).not.toHaveProperty('warning')
    })

    it('warns at exactly the threshold boundary', async () => {
      // 4.9 minutes remaining (< 5 = low_balance)
      mockGetCurrentUsage.mockResolvedValue({
        id: 'usage-1',
        periodStart: Date.now() - 1000,
        periodEnd: Date.now() + 86400000,
        usedMinutes: 55.1,
        includedMinutes: 60,
      })
      mockQuery.mockResolvedValue({ taskRuns: [{ minutes: 55.1 }] })

      const result = await canStartTask('user-1')
      expect(result).toMatchObject({ allowed: true, warning: 'low_balance' })
    })

    it('does not warn at exactly 5 minutes remaining', async () => {
      mockGetCurrentUsage.mockResolvedValue({
        id: 'usage-1',
        periodStart: Date.now() - 1000,
        periodEnd: Date.now() + 86400000,
        usedMinutes: 55,
        includedMinutes: 60,
      })
      mockQuery.mockResolvedValue({ taskRuns: [{ minutes: 55 }] })

      const result = await canStartTask('user-1')
      expect(result).toMatchObject({ allowed: true, remainingMinutes: 5 })
      expect(result).not.toHaveProperty('warning')
    })
  })

  describe('canCreateStream', () => {
    it('allows when billing is disabled', async () => {
      mockIsBillingEnabled.mockReturnValue(false)
      const result = await canCreateStream('user-1')
      expect(result).toMatchObject({ allowed: true })
    })

    it('allows when tier has unlimited streams', async () => {
      mockQuery.mockResolvedValue({
        subscriptions: [{ tier: 'pro', status: 'active' }],
      })
      mockGetTierLimits.mockReturnValue({
        streams: Infinity,
        samplesPerStream: Infinity,
        specsPerStream: Infinity,
      })

      const result = await canCreateStream('user-1')
      expect(result).toMatchObject({ allowed: true })
      expect(mockReadStreams).not.toHaveBeenCalled()
    })

    it('allows when under the stream limit', async () => {
      // Free user — no active subscription
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockReadStreams.mockResolvedValue([])

      const result = await canCreateStream('user-1')
      expect(result).toMatchObject({ allowed: true })
    })

    it('blocks when at the stream limit', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockReadStreams.mockResolvedValue([
        { id: '1', name: 'stream-1', createdAt: '2024-01-01' },
      ])

      const result = await canCreateStream('user-1')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.reason).toContain('Free plan')
        expect(result.reason).toContain('1 stream')
        expect(result.reason).toContain('Upgrade')
      }
    })

    it('uses free tier for users with only canceled subscriptions', async () => {
      mockQuery.mockResolvedValue({
        subscriptions: [{ tier: 'starter', status: 'canceled' }],
      })
      mockReadStreams.mockResolvedValue([
        { id: '1', name: 'stream-1', createdAt: '2024-01-01' },
      ])

      const result = await canCreateStream('user-1')
      expect(result.allowed).toBe(false)
      expect(mockGetTierLimits).toHaveBeenCalledWith('free')
    })
  })

  describe('canUploadSample', () => {
    it('allows when billing is disabled', async () => {
      mockIsBillingEnabled.mockReturnValue(false)
      const result = await canUploadSample('user-1', 'my-stream')
      expect(result).toMatchObject({ allowed: true })
    })

    it('allows when tier has unlimited samples', async () => {
      mockQuery.mockResolvedValue({
        subscriptions: [{ tier: 'starter', status: 'active' }],
      })
      mockGetTierLimits.mockReturnValue({
        streams: Infinity,
        samplesPerStream: Infinity,
        specsPerStream: Infinity,
      })

      const result = await canUploadSample('user-1', 'my-stream')
      expect(result).toMatchObject({ allowed: true })
      expect(mockListDirectory).not.toHaveBeenCalled()
    })

    it('allows when under the sample limit', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockListDirectory.mockResolvedValue([
        { name: 'sample1.csv', type: 'file' },
        { name: 'sample2.csv', type: 'file' },
      ])

      const result = await canUploadSample('user-1', 'my-stream')
      expect(result).toMatchObject({ allowed: true })
    })

    it('blocks when at the sample limit', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockListDirectory.mockResolvedValue([
        { name: 'sample1.csv', type: 'file' },
        { name: 'sample2.csv', type: 'file' },
        { name: 'sample3.csv', type: 'file' },
      ])

      const result = await canUploadSample('user-1', 'my-stream')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.reason).toContain('Free plan')
        expect(result.reason).toContain('3 samples')
        expect(result.reason).toContain('Upgrade')
      }
    })

    it('reads the correct samples directory for the stream', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockListDirectory.mockResolvedValue([])

      await canUploadSample('user-1', 'my-stream')
      expect(mockListDirectory).toHaveBeenCalledWith('/root/my-stream/samples')
    })
  })

  describe('canCreateSpec', () => {
    it('allows when billing is disabled', async () => {
      mockIsBillingEnabled.mockReturnValue(false)
      const result = await canCreateSpec('user-1', 'my-stream')
      expect(result).toMatchObject({ allowed: true })
    })

    it('allows when tier has unlimited specs', async () => {
      mockQuery.mockResolvedValue({
        subscriptions: [{ tier: 'pro', status: 'active' }],
      })
      mockGetTierLimits.mockReturnValue({
        streams: Infinity,
        samplesPerStream: Infinity,
        specsPerStream: Infinity,
      })

      const result = await canCreateSpec('user-1', 'my-stream')
      expect(result).toMatchObject({ allowed: true })
      expect(mockListDirectory).not.toHaveBeenCalled()
    })

    it('allows when under the spec limit', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockListDirectory.mockResolvedValue([])

      const result = await canCreateSpec('user-1', 'my-stream')
      expect(result).toMatchObject({ allowed: true })
    })

    it('blocks when at the spec limit', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockListDirectory.mockResolvedValue([{ name: 'spec.md', type: 'file' }])

      const result = await canCreateSpec('user-1', 'my-stream')
      expect(result.allowed).toBe(false)
      if (!result.allowed) {
        expect(result.reason).toContain('Free plan')
        expect(result.reason).toContain('1 spec')
        expect(result.reason).toContain('Upgrade')
      }
    })

    it('reads the correct specs directory for the stream', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockListDirectory.mockResolvedValue([])

      await canCreateSpec('user-1', 'my-stream')
      expect(mockListDirectory).toHaveBeenCalledWith('/root/my-stream/specs')
    })
  })

  describe('getUserTier (via canCreateStream)', () => {
    it('returns free tier when user has no subscriptions', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockReadStreams.mockResolvedValue([])

      await canCreateStream('user-1')
      expect(mockGetTierLimits).toHaveBeenCalledWith('free')
    })

    it('returns the tier of the active subscription', async () => {
      mockQuery.mockResolvedValue({
        subscriptions: [{ tier: 'pro', status: 'active' }],
      })
      mockGetTierLimits.mockReturnValue({
        streams: Infinity,
        samplesPerStream: Infinity,
        specsPerStream: Infinity,
      })

      await canCreateStream('user-1')
      expect(mockGetTierLimits).toHaveBeenCalledWith('pro')
    })

    it('treats past_due subscription as active for tier lookup', async () => {
      mockQuery.mockResolvedValue({
        subscriptions: [{ tier: 'starter', status: 'past_due' }],
      })
      mockGetTierLimits.mockReturnValue({
        streams: Infinity,
        samplesPerStream: Infinity,
        specsPerStream: Infinity,
      })

      await canCreateStream('user-1')
      expect(mockGetTierLimits).toHaveBeenCalledWith('starter')
    })

    it('queries subscriptions linked to the user', async () => {
      mockQuery.mockResolvedValue({ subscriptions: [] })
      mockReadStreams.mockResolvedValue([])

      await canCreateStream('user-42')
      expect(mockQuery).toHaveBeenCalledWith({
        subscriptions: { $: { where: { 'user.id': 'user-42' } } },
      })
    })
  })
})
