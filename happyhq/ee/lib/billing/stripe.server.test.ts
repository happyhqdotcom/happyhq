import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock functions defined with vi.hoisted so they're available in vi.mock factories
const mockQuery = vi.hoisted(() => vi.fn())
const mockTransact = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn(() => 'tx-result'))

const mockGetAdminDb = vi.hoisted(() =>
  vi.fn(() => ({
    query: mockQuery,
    transact: mockTransact,
    tx: {
      $users: new Proxy(
        {},
        {
          get: () => ({ update: mockUpdate }),
        },
      ),
      subscriptions: new Proxy(
        {},
        {
          get: () => ({ update: mockUpdate }),
        },
      ),
    },
  })),
)

const mockStripeCustomersCreate = vi.hoisted(() => vi.fn())
const mockStripeSubscriptionsCancel = vi.hoisted(() => vi.fn())
const mockStripeSubscriptionsUpdate = vi.hoisted(() => vi.fn())

vi.mock('@/lib/database/instant.server', () => ({
  getAdminDb: mockGetAdminDb,
}))

vi.mock('stripe', () => ({
  default: class MockStripe {
    customers = { create: mockStripeCustomersCreate }
    subscriptions = {
      cancel: mockStripeSubscriptionsCancel,
      update: mockStripeSubscriptionsUpdate,
    }
  },
}))

describe('stripe.server', () => {
  const originalStripeKey = process.env.STRIPE_SECRET_KEY

  beforeEach(() => {
    vi.resetModules()
    mockQuery.mockReset()
    mockTransact.mockReset()
    mockUpdate.mockReset()
    mockStripeCustomersCreate.mockReset()
    mockStripeSubscriptionsCancel.mockReset()
    mockGetAdminDb.mockReturnValue({
      query: mockQuery,
      transact: mockTransact,
      tx: {
        $users: new Proxy(
          {},
          {
            get: () => ({ update: mockUpdate }),
          },
        ),
        subscriptions: new Proxy(
          {},
          {
            get: () => ({ update: mockUpdate }),
          },
        ),
      },
    })
    process.env.STRIPE_SECRET_KEY = 'sk_test_123'
  })

  afterEach(() => {
    if (originalStripeKey !== undefined) {
      process.env.STRIPE_SECRET_KEY = originalStripeKey
    } else {
      delete process.env.STRIPE_SECRET_KEY
    }
    vi.clearAllMocks()
  })

  describe('getStripeClient', () => {
    it('throws when STRIPE_SECRET_KEY is missing', async () => {
      delete process.env.STRIPE_SECRET_KEY
      const { getStripeClient } = await import('./stripe.server')
      expect(() => getStripeClient()).toThrow('STRIPE_SECRET_KEY is required')
    })

    it('returns a Stripe instance when key is set', async () => {
      const { getStripeClient } = await import('./stripe.server')
      const client = getStripeClient()
      expect(client).not.toBeNull()
      expect(client.customers).not.toBeNull()
    })

    it('returns the same instance on subsequent calls', async () => {
      const { getStripeClient } = await import('./stripe.server')
      const first = getStripeClient()
      const second = getStripeClient()
      expect(first).toBe(second)
    })
  })

  describe('getOrCreateStripeCustomer', () => {
    it('returns existing customer ID when user already has one', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_existing' }],
      })

      const { getOrCreateStripeCustomer } = await import('./stripe.server')
      const customerId = await getOrCreateStripeCustomer(
        'user-1',
        'alice@example.com',
      )

      expect(customerId).toBe('cus_existing')
      expect(mockStripeCustomersCreate).not.toHaveBeenCalled()
    })

    it('creates a new Stripe customer when user has no customer ID', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: undefined }],
      })
      mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_new_123' })
      mockTransact.mockResolvedValue(undefined)

      const { getOrCreateStripeCustomer } = await import('./stripe.server')
      const customerId = await getOrCreateStripeCustomer(
        'user-1',
        'alice@example.com',
      )

      expect(customerId).toBe('cus_new_123')
      expect(mockStripeCustomersCreate).toHaveBeenCalledWith({
        email: 'alice@example.com',
        metadata: { instantdb_user_id: 'user-1' },
      })
    })

    it('stores the new customer ID in InstantDB', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1' }],
      })
      mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_new_456' })
      mockTransact.mockResolvedValue(undefined)

      const { getOrCreateStripeCustomer } = await import('./stripe.server')
      await getOrCreateStripeCustomer('user-1', 'alice@example.com')

      expect(mockTransact).toHaveBeenCalled()
      expect(mockUpdate).toHaveBeenCalledWith({
        stripeCustomerId: 'cus_new_456',
      })
    })

    it('creates customer when user record has no stripeCustomerId field', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1' }],
      })
      mockStripeCustomersCreate.mockResolvedValue({ id: 'cus_brand_new' })
      mockTransact.mockResolvedValue(undefined)

      const { getOrCreateStripeCustomer } = await import('./stripe.server')
      const customerId = await getOrCreateStripeCustomer(
        'user-1',
        'alice@example.com',
      )

      expect(customerId).toBe('cus_brand_new')
    })
  })

  describe('cancelSubscription', () => {
    it('does nothing when user has no Stripe customer', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1' }],
        subscriptions: [],
      })

      const { cancelSubscription } = await import('./stripe.server')
      await cancelSubscription('user-1')

      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled()
    })

    it('does nothing when user has no active subscription', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_123' }],
        subscriptions: [],
      })

      const { cancelSubscription } = await import('./stripe.server')
      await cancelSubscription('user-1')

      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled()
    })

    it('skips canceled subscriptions', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_123' }],
        subscriptions: [
          {
            id: 'sub-inst-1',
            stripeSubscriptionId: 'sub_stripe_1',
            status: 'canceled',
          },
        ],
      })

      const { cancelSubscription } = await import('./stripe.server')
      await cancelSubscription('user-1')

      expect(mockStripeSubscriptionsCancel).not.toHaveBeenCalled()
    })

    it('marks an active subscription for cancellation at period end', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_123' }],
        subscriptions: [
          {
            id: 'sub-inst-1',
            stripeSubscriptionId: 'sub_stripe_active',
            status: 'active',
          },
        ],
      })
      mockStripeSubscriptionsUpdate.mockResolvedValue({
        id: 'sub_stripe_active',
        cancel_at_period_end: true,
      })

      const { cancelSubscription } = await import('./stripe.server')
      await cancelSubscription('user-1')

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_stripe_active',
        { cancel_at_period_end: true },
      )
      // Should NOT immediately update InstantDB status — webhook handles that
      expect(mockTransact).not.toHaveBeenCalled()
    })

    it('marks a past_due subscription for cancellation at period end', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_123' }],
        subscriptions: [
          {
            id: 'sub-inst-1',
            stripeSubscriptionId: 'sub_stripe_past_due',
            status: 'past_due',
          },
        ],
      })
      mockStripeSubscriptionsUpdate.mockResolvedValue({
        id: 'sub_stripe_past_due',
        cancel_at_period_end: true,
      })

      const { cancelSubscription } = await import('./stripe.server')
      await cancelSubscription('user-1')

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_stripe_past_due',
        { cancel_at_period_end: true },
      )
      expect(mockTransact).not.toHaveBeenCalled()
    })
  })
})
