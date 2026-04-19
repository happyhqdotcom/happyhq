import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireAuth = vi.hoisted(() => vi.fn())
const mockCreatePortalSession = vi.hoisted(() => vi.fn())

vi.mock('@/lib/accounts/auth.server', () => ({
  requireAuth: mockRequireAuth,
}))

vi.mock('@/ee/lib/billing/portal.server', () => ({
  createPortalSession: mockCreatePortalSession,
}))

import { POST } from './route'

function makeRequest(token?: string) {
  return new Request('http://localhost/api/billing/portal', {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  })
}

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    mockRequireAuth.mockReset()
    mockCreatePortalSession.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('returns portal URL on success', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })
    mockCreatePortalSession.mockResolvedValue(
      'https://billing.stripe.com/portal_abc',
    )

    const response = await POST(makeRequest('test-token'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ url: 'https://billing.stripe.com/portal_abc' })
    expect(mockCreatePortalSession).toHaveBeenCalledWith('user-1')
  })

  it('returns 401 when no token is provided', async () => {
    mockRequireAuth.mockResolvedValue({
      error: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 401 when token is invalid', async () => {
    mockRequireAuth.mockResolvedValue({
      error: Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const response = await POST(makeRequest('bad-token'))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body).toEqual({ error: 'Unauthorized' })
  })

  it('returns 500 when portal session creation fails', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })
    mockCreatePortalSession.mockRejectedValue(
      new Error('No billing account found. Subscribe to a plan first.'),
    )

    const response = await POST(makeRequest('test-token'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'No billing account found. Subscribe to a plan first.',
    })
  })
})
