import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockDeleteAccount = vi.hoisted(() => vi.fn())
const mockRequireAuth = vi.hoisted(() => vi.fn())

vi.mock('@/lib/accounts/actions.server', () => ({
  deleteAccount: mockDeleteAccount,
}))

vi.mock('@/lib/accounts/auth.server', () => ({
  requireAuth: mockRequireAuth,
}))

import { POST } from './route'

function makeRequest(token?: string) {
  return new Request('http://localhost/api/accounts/delete', {
    method: 'POST',
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
    },
  })
}

describe('POST /api/accounts/delete', () => {
  const originalBillingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED

  beforeEach(() => {
    mockDeleteAccount.mockReset()
    mockRequireAuth.mockReset()
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED
  })

  afterEach(() => {
    if (originalBillingEnabled !== undefined) {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = originalBillingEnabled
    } else {
      delete process.env.NEXT_PUBLIC_BILLING_ENABLED
    }
    vi.clearAllMocks()
  })

  it('returns success when account is deleted', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })
    mockDeleteAccount.mockResolvedValue({ success: true })
    const response = await POST(makeRequest('test-token'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true })
    expect(mockDeleteAccount).toHaveBeenCalledWith('user-1', undefined)
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

  it('returns 500 when deletion fails', async () => {
    mockRequireAuth.mockResolvedValue({ userId: 'user-1' })
    mockDeleteAccount.mockResolvedValue({
      success: false,
      error: 'Failed to delete account. Please try again.',
    })
    const response = await POST(makeRequest('test-token'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({
      error: 'Failed to delete account. Please try again.',
    })
  })
})
