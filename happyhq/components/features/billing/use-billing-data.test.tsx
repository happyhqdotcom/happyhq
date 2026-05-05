import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageData } from './use-billing-data'

const mockUseCurrentUser = vi.hoisted(() => vi.fn())
const mockUseQuery = vi.hoisted(() => vi.fn())

vi.mock('@/lib/accounts/hooks', () => ({
  useCurrentUser: mockUseCurrentUser,
}))

vi.mock('@/lib/database/instant', () => ({
  db: { useQuery: mockUseQuery },
}))

vi.mock('@/ee/lib/billing/plans', () => ({
  getTierLimits: (tier: string) => {
    const limits: Record<string, { runtimeMinutes: number }> = {
      free: { runtimeMinutes: 5 },
      starter: { runtimeMinutes: 60 },
      pro: { runtimeMinutes: 300 },
      max: { runtimeMinutes: 1800 },
    }
    return limits[tier] ?? limits.free
  },
}))

describe('useBillingData', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns null when user is not authenticated', async () => {
    mockUseCurrentUser.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    })
    mockUseQuery.mockReturnValue({ data: null })

    const { useBillingData } = await import('./use-billing-data')
    let result: UsageData | null | undefined

    function TestComponent() {
      result = useBillingData()
      return null
    }

    render(<TestComponent />)
    expect(result).toBeNull()
  })

  it('returns usage data for an authenticated user with active subscription', async () => {
    const now = Date.now()
    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'starter', status: 'active' }],
        usage: [
          {
            id: 'usage-1',
            periodStart: now - 86400000,
            periodEnd: now + 86400000,
            usedMinutes: 30,
            includedMinutes: 60,
          },
        ],
      },
    })

    const { useBillingData } = await import('./use-billing-data')
    let result: UsageData | null | undefined

    function TestComponent() {
      result = useBillingData()
      return null
    }

    render(<TestComponent />)
    expect(result).not.toBeNull()
    expect(result!.currentTier).toBe('starter')
    expect(result!.usedMinutes).toBe(30)
    expect(result!.includedMinutes).toBe(60)
    expect(result!.remainingMinutes).toBe(30)
    expect(result!.remainingPercent).toBe(50)
    expect(result!.isPastDue).toBe(false)
    expect(result!.periodEnd).toBe(now + 86400000)
  })

  it('flags isPastDue when the active subscription is past_due', async () => {
    const now = Date.now()
    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'starter', status: 'past_due' }],
        usage: [
          {
            id: 'usage-1',
            periodStart: now - 86400000,
            periodEnd: now + 86400000,
            usedMinutes: 10,
            includedMinutes: 60,
          },
        ],
      },
    })

    const { useBillingData } = await import('./use-billing-data')
    let result: UsageData | null | undefined

    function TestComponent() {
      result = useBillingData()
      return null
    }

    render(<TestComponent />)
    expect(result!.currentTier).toBe('starter')
    expect(result!.isPastDue).toBe(true)
  })

  it('defaults to free tier when no active subscription exists', async () => {
    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [],
        usage: [],
      },
    })

    const { useBillingData } = await import('./use-billing-data')
    let result: UsageData | null | undefined

    function TestComponent() {
      result = useBillingData()
      return null
    }

    render(<TestComponent />)
    expect(result).not.toBeNull()
    expect(result!.currentTier).toBe('free')
    expect(result!.includedMinutes).toBe(5)
    expect(result!.remainingMinutes).toBe(5)
    expect(result!.isPastDue).toBe(false)
    expect(result!.periodEnd).toBeNull()
  })

  it('clamps remaining minutes to zero when usage exceeds limit', async () => {
    const now = Date.now()
    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'starter', status: 'active' }],
        usage: [
          {
            id: 'usage-1',
            periodStart: now - 86400000,
            periodEnd: now + 86400000,
            usedMinutes: 70,
            includedMinutes: 60,
          },
        ],
      },
    })

    const { useBillingData } = await import('./use-billing-data')
    let result: UsageData | null | undefined

    function TestComponent() {
      result = useBillingData()
      return null
    }

    render(<TestComponent />)
    expect(result!.remainingMinutes).toBe(0)
    expect(result!.remainingPercent).toBe(0)
  })

  it('switches to the next billing period when the boundary crosses while mounted', async () => {
    // Boundary at T+30s. Period A ends at the boundary; Period B starts at it.
    const start = Date.now()
    const boundary = start + 30_000

    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'test@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'starter', status: 'active' }],
        usage: [
          {
            id: 'period-a',
            periodStart: start - 86_400_000,
            periodEnd: boundary,
            usedMinutes: 50,
            includedMinutes: 60,
          },
          {
            id: 'period-b',
            periodStart: boundary,
            periodEnd: start + 86_400_000,
            usedMinutes: 5,
            includedMinutes: 60,
          },
        ],
      },
    })

    const { useBillingData } = await import('./use-billing-data')
    let result: UsageData | null | undefined

    function TestComponent() {
      result = useBillingData()
      return null
    }

    render(<TestComponent />)
    // Initial render is inside Period A.
    expect(result!.usedMinutes).toBe(50)

    // Advance past the boundary and let the 60s tick fire — the hook should
    // re-derive `now` and switch to Period B.
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(result!.usedMinutes).toBe(5)
  })
})
