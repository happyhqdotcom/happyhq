import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
const mockUseCurrentUser = vi.hoisted(() => vi.fn())
const mockUseQuery = vi.hoisted(() => vi.fn())

vi.mock('@/lib/accounts/hooks', () => ({
  useCurrentUser: mockUseCurrentUser,
}))

vi.mock('@/lib/database/instant', () => ({
  db: { useQuery: mockUseQuery },
}))

// Mock plans module — re-export real implementations
vi.mock('@/ee/lib/billing/plans', () => {
  const TIER_NAMES = ['free', 'starter', 'pro', 'max'] as const
  const MB = 1024 * 1024
  const GB = 1024 * MB
  const limits: Record<string, object> = {
    free: {
      priceMonthly: 0,
      runtimeMinutes: 5,
      storageBytes: 100 * MB,
      streams: 1,
      samplesPerStream: 3,
      specsPerStream: 1,
      users: 1,
    },
    starter: {
      priceMonthly: 3000,
      runtimeMinutes: 60,
      storageBytes: 1 * GB,
      streams: Infinity,
      samplesPerStream: Infinity,
      specsPerStream: Infinity,
      users: 3,
    },
    pro: {
      priceMonthly: 10000,
      runtimeMinutes: 300,
      storageBytes: 10 * GB,
      streams: Infinity,
      samplesPerStream: Infinity,
      specsPerStream: Infinity,
      users: 20,
    },
    max: {
      priceMonthly: 50000,
      runtimeMinutes: 1800,
      storageBytes: 100 * GB,
      streams: Infinity,
      samplesPerStream: Infinity,
      specsPerStream: Infinity,
      users: Infinity,
    },
  }
  return {
    TIER_NAMES,
    getTierLimits: (tier: string) => limits[tier],
  }
})

describe('BillingSettings', () => {
  beforeEach(() => {
    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'alice@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })

    // Default: free user with no subscription or usage data
    mockUseQuery.mockReturnValue({
      data: { subscriptions: [], usage: [] },
    })

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ url: 'https://stripe.com/portal' }),
        }),
      ),
    )
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders nothing when user is not authenticated', async () => {
    mockUseCurrentUser.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    })
    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)
    expect(container.innerHTML).toBe('')
  })

  it('shows free tier info when no subscription exists', async () => {
    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    expect(container.textContent).toContain('Free')
    expect(container.textContent).toContain('Current plan')
  })

  it('shows upgrade to Starter on free tier, no manage button', async () => {
    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    expect(container.textContent).toContain('Upgrade to Starter')
    const buttons = Array.from(container.querySelectorAll('button'))
    const manageButton = buttons.find((b) => b.textContent?.includes('Manage'))
    expect(manageButton).toBeUndefined()
  })

  it('starts Stripe checkout for next tier when upgrade is clicked', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ url: 'https://checkout.stripe.com/session' }),
        }),
      ),
    )

    const originalLocation = window.location
    const locationMock = { ...originalLocation, href: '' }
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    const upgradeButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Upgrade'),
    )!

    await act(async () => {
      fireEvent.click(upgradeButton)
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: 'starter' }),
    })
    expect(locationMock.href).toBe('https://checkout.stripe.com/session')

    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('shows both upgrade and manage for paid users not on max', async () => {
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'starter', status: 'active' }],
        usage: [],
      },
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    expect(container.textContent).toContain('Upgrade to Pro')
    const buttons = Array.from(container.querySelectorAll('button'))
    expect(
      buttons.find((b) => b.textContent?.includes('Upgrade')),
    ).not.toBeUndefined()
    expect(
      buttons.find((b) => b.textContent?.includes('Manage')),
    ).not.toBeUndefined()
  })

  it('shows no upgrade option on max tier', async () => {
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'max', status: 'active' }],
        usage: [],
      },
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    const buttons = Array.from(container.querySelectorAll('button'))
    expect(
      buttons.find((b) => b.textContent?.includes('Upgrade')),
    ).toBeUndefined()
    expect(
      buttons.find((b) => b.textContent?.includes('Manage')),
    ).not.toBeUndefined()
  })

  it('shows paid tier info and manage button for active subscription', async () => {
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [
          {
            id: 'sub-1',
            tier: 'pro',
            status: 'active',
            stripeSubscriptionId: 'stripe_sub_1',
            currentPeriodStart: Date.now() - 86400000,
            currentPeriodEnd: Date.now() + 86400000 * 29,
          },
        ],
        usage: [],
      },
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    expect(container.textContent).toContain('Pro')
    expect(container.textContent).toContain('$100/mo')

    const buttons = Array.from(container.querySelectorAll('button'))
    const manageButton = buttons.find((b) => b.textContent?.includes('Manage'))
    expect(manageButton).not.toBeUndefined()
  })

  it('shows renewal date when subscription has currentPeriodEnd', async () => {
    const futureDate = Date.now() + 86400000 * 29
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [
          {
            id: 'sub-1',
            tier: 'pro',
            status: 'active',
            currentPeriodEnd: futureDate,
          },
        ],
        usage: [],
      },
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    expect(container.textContent).toContain('Renews')
  })

  it('shows past due warning for past_due subscription', async () => {
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'starter', status: 'past_due' }],
        usage: [],
      },
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    expect(container.textContent).toContain('Payment past due')
  })

  it('opens Stripe portal when manage is clicked', async () => {
    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'pro', status: 'active' }],
        usage: [],
      },
    })

    // Mock window.location.href assignment
    const originalLocation = window.location
    const locationMock = { ...originalLocation, href: '' }
    Object.defineProperty(window, 'location', {
      value: locationMock,
      writable: true,
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    const manageButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Manage'),
    )!

    await act(async () => {
      fireEvent.click(manageButton)
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/billing/portal', {
      method: 'POST',
      headers: {},
    })
    expect(locationMock.href).toBe('https://stripe.com/portal')

    // Restore
    Object.defineProperty(window, 'location', {
      value: originalLocation,
      writable: true,
    })
  })

  it('shows error when portal request fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'No billing account found' }),
        }),
      ),
    )

    mockUseQuery.mockReturnValue({
      data: {
        subscriptions: [{ id: 'sub-1', tier: 'pro', status: 'active' }],
        usage: [],
      },
    })

    const { BillingSettings } = await import('./billing-settings')
    const { container } = render(<BillingSettings />)

    const manageButton = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Manage'),
    )!

    await act(async () => {
      fireEvent.click(manageButton)
    })

    const alert = container.querySelector('[role="alert"]')
    expect(alert).not.toBeNull()
    expect(alert!.textContent).toBe('No billing account found')
  })
})
