import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UsageData } from './usage-indicator'

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

describe('UsageIndicator', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows remaining minutes for short durations', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 18,
          includedMinutes: 60,
          remainingMinutes: 42,
          remainingPercent: 70,
        }}
      />,
    )
    expect(container.textContent).toBe('42m left')
  })

  it('shows remaining time in hours and minutes for long durations', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'pro',
          usedMinutes: 165,
          includedMinutes: 300,
          remainingMinutes: 135,
          remainingPercent: 45,
        }}
      />,
    )
    expect(container.textContent).toBe('2h 15m left')
  })

  it('shows "No runtime left" when minutes are exhausted', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 60,
          includedMinutes: 60,
          remainingMinutes: 0,
          remainingPercent: 0,
        }}
      />,
    )
    expect(container.textContent).toBe('No runtime left')
  })

  it('uses red color when less than 25% remaining', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 50,
          includedMinutes: 60,
          remainingMinutes: 10,
          remainingPercent: 16.7,
        }}
      />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-red-500')
  })

  it('uses amber color when between 25% and 50% remaining', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 40,
          includedMinutes: 60,
          remainingMinutes: 20,
          remainingPercent: 33.3,
        }}
      />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-amber-500')
  })

  it('uses muted color when more than 50% remaining', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 10,
          includedMinutes: 60,
          remainingMinutes: 50,
          remainingPercent: 83.3,
        }}
      />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-muted-foreground')
  })
})

describe('TierBadge', () => {
  it('renders capitalized tier name', async () => {
    const { TierBadge } = await import('./usage-indicator')
    const { container } = render(<TierBadge tier="starter" />)
    expect(container.textContent).toBe('Starter')
  })

  it('renders Free for free tier', async () => {
    const { TierBadge } = await import('./usage-indicator')
    const { container } = render(<TierBadge tier="free" />)
    expect(container.textContent).toBe('Free')
  })
})

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

    // Test via a component that consumes the hook
    const { useBillingData } = await import('./usage-indicator')
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

    const { useBillingData } = await import('./usage-indicator')
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

    const { useBillingData } = await import('./usage-indicator')
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

    const { useBillingData } = await import('./usage-indicator')
    let result: UsageData | null | undefined

    function TestComponent() {
      result = useBillingData()
      return null
    }

    render(<TestComponent />)
    expect(result!.remainingMinutes).toBe(0)
    expect(result!.remainingPercent).toBe(0)
  })
})
