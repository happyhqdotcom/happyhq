import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockQuery = vi.hoisted(() => vi.fn())
const mockGetAdminDb = vi.hoisted(() =>
  vi.fn(() => ({
    query: mockQuery,
  })),
)
const mockPortalSessionsCreate = vi.hoisted(() => vi.fn())
const mockGetStripeClient = vi.hoisted(() =>
  vi.fn(() => ({
    billingPortal: { sessions: { create: mockPortalSessionsCreate } },
  })),
)

vi.mock('@/lib/database/instant.server', () => ({
  getAdminDb: mockGetAdminDb,
}))

vi.mock('./stripe.server', () => ({
  getStripeClient: mockGetStripeClient,
}))

describe('portal.server', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    mockQuery.mockReset()
    mockPortalSessionsCreate.mockReset()
    mockGetAdminDb.mockReturnValue({ query: mockQuery })
    mockGetStripeClient.mockReturnValue({
      billingPortal: { sessions: { create: mockPortalSessionsCreate } },
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    vi.clearAllMocks()
    vi.resetModules()
  })

  describe('createPortalSession', () => {
    it('creates a portal session for a user with a Stripe customer', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_existing_123' }],
      })
      mockPortalSessionsCreate.mockResolvedValue({
        url: 'https://billing.stripe.com/portal_123',
      })

      const { createPortalSession } = await import('./portal.server')
      const url = await createPortalSession('user-1')

      expect(url).toBe('https://billing.stripe.com/portal_123')
      expect(mockPortalSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_existing_123',
        }),
      )
    })

    it('throws when user has no Stripe customer', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1' }],
      })

      const { createPortalSession } = await import('./portal.server')
      await expect(createPortalSession('user-1')).rejects.toThrow(
        'No billing account found',
      )
      expect(mockPortalSessionsCreate).not.toHaveBeenCalled()
    })

    it('throws when user record is not found', async () => {
      mockQuery.mockResolvedValue({
        $users: [],
      })

      const { createPortalSession } = await import('./portal.server')
      await expect(createPortalSession('user-1')).rejects.toThrow(
        'No billing account found',
      )
    })

    it('includes return URL pointing to settings', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_test' }],
      })
      mockPortalSessionsCreate.mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      })
      process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com'

      const { createPortalSession } = await import('./portal.server')
      await createPortalSession('user-1')

      expect(mockPortalSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url: 'https://app.example.com/settings/billing',
        }),
      )
    })

    it('defaults return URL to localhost when NEXT_PUBLIC_APP_URL is not set', async () => {
      mockQuery.mockResolvedValue({
        $users: [{ id: 'user-1', stripeCustomerId: 'cus_test' }],
      })
      mockPortalSessionsCreate.mockResolvedValue({
        url: 'https://billing.stripe.com/portal',
      })
      delete process.env.NEXT_PUBLIC_APP_URL

      const { createPortalSession } = await import('./portal.server')
      await createPortalSession('user-1')

      expect(mockPortalSessionsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          return_url: 'http://localhost:3000/settings/billing',
        }),
      )
    })
  })
})
