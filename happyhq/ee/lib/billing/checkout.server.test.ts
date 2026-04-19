import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockGetOrCreateStripeCustomer = vi.hoisted(() => vi.fn())
const mockCheckoutSessionsCreate = vi.hoisted(() => vi.fn())
const mockGetStripeClient = vi.hoisted(() =>
  vi.fn(() => ({
    checkout: { sessions: { create: mockCheckoutSessionsCreate } },
  })),
)

vi.mock('./stripe.server', () => ({
  getOrCreateStripeCustomer: mockGetOrCreateStripeCustomer,
  getStripeClient: mockGetStripeClient,
}))

describe('checkout.server', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    mockGetOrCreateStripeCustomer.mockReset()
    mockCheckoutSessionsCreate.mockReset()
    mockGetStripeClient.mockReturnValue({
      checkout: { sessions: { create: mockCheckoutSessionsCreate } },
    })
    process.env.STRIPE_PRICE_ID_STARTER = 'price_starter_123'
    process.env.STRIPE_PRICE_ID_PRO = 'price_pro_456'
    process.env.STRIPE_PRICE_ID_MAX = 'price_max_789'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('createCheckoutSession', () => {
    it('creates a checkout session with correct price and customer', async () => {
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_test_123')
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/session_123',
      })

      const { createCheckoutSession } = await import('./checkout.server')
      const url = await createCheckoutSession(
        'user-1',
        'alice@example.com',
        'starter',
      )

      expect(url).toBe('https://checkout.stripe.com/session_123')
      expect(mockGetOrCreateStripeCustomer).toHaveBeenCalledWith(
        'user-1',
        'alice@example.com',
      )
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_test_123',
          mode: 'subscription',
          line_items: [{ price: 'price_starter_123', quantity: 1 }],
        }),
      )
    })

    it('uses the correct price ID for each tier', async () => {
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_test')
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      })

      const { createCheckoutSession } = await import('./checkout.server')

      await createCheckoutSession('user-1', 'a@b.com', 'pro')
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_pro_456', quantity: 1 }],
        }),
      )

      mockCheckoutSessionsCreate.mockClear()
      await createCheckoutSession('user-1', 'a@b.com', 'max')
      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          line_items: [{ price: 'price_max_789', quantity: 1 }],
        }),
      )
    })

    it('rejects free tier checkout', async () => {
      const { createCheckoutSession } = await import('./checkout.server')
      await expect(
        createCheckoutSession('user-1', 'a@b.com', 'free'),
      ).rejects.toThrow('Cannot create checkout for free tier')
    })

    it('throws when Stripe price ID is not configured', async () => {
      delete process.env.STRIPE_PRICE_ID_STARTER

      const { createCheckoutSession } = await import('./checkout.server')
      await expect(
        createCheckoutSession('user-1', 'a@b.com', 'starter'),
      ).rejects.toThrow('STRIPE_PRICE_ID_STARTER')
    })

    it('throws when Stripe returns no URL', async () => {
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_test')
      mockCheckoutSessionsCreate.mockResolvedValue({ url: null })

      const { createCheckoutSession } = await import('./checkout.server')
      await expect(
        createCheckoutSession('user-1', 'a@b.com', 'starter'),
      ).rejects.toThrow('no URL returned')
    })

    it('includes success and cancel URLs in the session', async () => {
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_test')
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      })
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'

      const { createCheckoutSession } = await import('./checkout.server')
      await createCheckoutSession('user-1', 'a@b.com', 'starter')

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            'https://app.example.com/settings/billing?checkout=success',
          cancel_url:
            'https://app.example.com/settings/billing?checkout=canceled',
        }),
      )
    })

    it('defaults to localhost when NEXT_PUBLIC_APP_URL is not set', async () => {
      mockGetOrCreateStripeCustomer.mockResolvedValue('cus_test')
      mockCheckoutSessionsCreate.mockResolvedValue({
        url: 'https://checkout.stripe.com/test',
      })
      delete process.env.NEXT_PUBLIC_APP_URL

      const { createCheckoutSession } = await import('./checkout.server')
      await createCheckoutSession('user-1', 'a@b.com', 'starter')

      expect(mockCheckoutSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          success_url:
            'http://localhost:3000/settings/billing?checkout=success',
          cancel_url:
            'http://localhost:3000/settings/billing?checkout=canceled',
        }),
      )
    })
  })
})
