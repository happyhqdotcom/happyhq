import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockCreateCheckoutSession = vi.hoisted(() => vi.fn())
const mockGetAdminDb = vi.hoisted(() => vi.fn())

vi.mock('@/lib/accounts/auth.server', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('@/ee/lib/billing/checkout.server', () => ({
  createCheckoutSession: mockCreateCheckoutSession,
}))

vi.mock('@/lib/database/instant.server', () => ({
  getAdminDb: mockGetAdminDb,
}))

import { POST } from './route'

function makeRequest(body: unknown, token?: string) {
  return new Request('http://localhost/api/billing/checkout', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      ...(typeof body !== 'string' && {
        'Content-Type': 'application/json',
      }),
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  })
}

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockCreateCheckoutSession.mockReset()
    mockGetAdminDb.mockReturnValue({
      query: vi.fn().mockResolvedValue({
        $users: [{ id: 'user-1', email: 'alice@example.com' }],
      }),
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns checkout URL on success', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })
    mockCreateCheckoutSession.mockResolvedValue(
      'https://checkout.stripe.com/session_abc',
    )

    const response = await POST(makeRequest({ tier: 'starter' }, 'test-token'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ url: 'https://checkout.stripe.com/session_abc' })
    expect(mockCreateCheckoutSession).toHaveBeenCalledWith(
      'user-1',
      'alice@example.com',
      'starter',
    )
  })

  it('returns 401 when no token is provided', async () => {
    mockRequireAuth.mockResolvedValue({
      error: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(makeRequest({ tier: 'pro' }))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when token is invalid', async () => {
    mockRequireAuth.mockResolvedValue({
      error: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(makeRequest({ tier: 'pro' }, 'bad-token'))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 400 for invalid JSON body', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })

    const response = await POST(makeRequest('not json', 'test-token'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 for invalid tier', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })

    const response = await POST(makeRequest({ tier: 'free' }, 'test-token'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Invalid tier')
  })

  it('returns 400 when tier is missing', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })

    const response = await POST(makeRequest({}, 'test-token'))
    expect(response.status).toBe(400)
  })

  it('returns 500 when checkout session creation fails', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })
    mockCreateCheckoutSession.mockRejectedValue(new Error('Stripe API error'))

    const response = await POST(makeRequest({ tier: 'pro' }, 'test-token'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Stripe API error' })
  })
})
