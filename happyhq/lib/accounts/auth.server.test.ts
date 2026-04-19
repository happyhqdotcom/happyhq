import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAdminVerifyToken = vi.hoisted(() => vi.fn())
const mockGetAdminDb = vi.hoisted(() =>
  vi.fn(() => ({ auth: { verifyToken: mockAdminVerifyToken } })),
)

vi.mock('@/lib/database/instant.server', () => ({
  getAdminDb: mockGetAdminDb,
}))

// Allow tests to control ALLOWED_EMAILS
const mockIsEmailAllowed = vi.hoisted(() => vi.fn(() => true))
vi.mock('@/lib/accounts/config', () => ({
  isEmailAllowed: mockIsEmailAllowed,
}))

describe('auth.server', () => {
  beforeEach(() => {
    vi.resetModules()
    mockAdminVerifyToken.mockReset()
    mockIsEmailAllowed.mockReset().mockReturnValue(true)
    mockGetAdminDb.mockReturnValue({
      auth: { verifyToken: mockAdminVerifyToken },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('verifyToken', () => {
    it('returns { id, email } for a valid token', async () => {
      mockAdminVerifyToken.mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.com',
      })
      const { verifyToken } = await import('./auth.server')
      const result = await verifyToken('valid-token')
      expect(result).toEqual({ id: 'user-1', email: 'alice@example.com' })
      expect(mockAdminVerifyToken).toHaveBeenCalledWith('valid-token')
    })

    it('returns null when token is invalid', async () => {
      mockAdminVerifyToken.mockRejectedValue(new Error('Invalid token'))
      const { verifyToken } = await import('./auth.server')
      const result = await verifyToken('bad-token')
      expect(result).toBeNull()
    })

    it('returns null when verifyToken returns no id', async () => {
      mockAdminVerifyToken.mockResolvedValue({})
      const { verifyToken } = await import('./auth.server')
      const result = await verifyToken('some-token')
      expect(result).toBeNull()
    })

    it('returns null when verifyToken returns null', async () => {
      mockAdminVerifyToken.mockResolvedValue(null)
      const { verifyToken } = await import('./auth.server')
      const result = await verifyToken('some-token')
      expect(result).toBeNull()
    })

    it('returns null when email is missing', async () => {
      mockAdminVerifyToken.mockResolvedValue({ id: 'user-1' })
      const { verifyToken } = await import('./auth.server')
      const result = await verifyToken('some-token')
      expect(result).toBeNull()
    })
  })

  describe('requireAuth', () => {
    it('returns userId for valid token', async () => {
      mockAdminVerifyToken.mockResolvedValue({
        id: 'user-1',
        email: 'alice@example.com',
      })
      const { requireAuth } = await import('./auth.server')
      const result = await requireAuth(
        new Request('http://localhost', {
          headers: { Authorization: 'Bearer valid-token' },
        }),
      )
      expect(result).toEqual({ userId: 'user-1' })
    })

    it('returns 401 when no Authorization header', async () => {
      const { requireAuth } = await import('./auth.server')
      const result = await requireAuth(new Request('http://localhost'))
      expect(result.error).toBeDefined()
      expect(result.error!.status).toBe(401)
    })

    it('returns 401 when token is invalid', async () => {
      mockAdminVerifyToken.mockRejectedValue(new Error('Invalid'))
      const { requireAuth } = await import('./auth.server')
      const result = await requireAuth(
        new Request('http://localhost', {
          headers: { Authorization: 'Bearer bad-token' },
        }),
      )
      expect(result.error).toBeDefined()
      expect(result.error!.status).toBe(401)
    })

    it('returns 403 when email is not on allowlist', async () => {
      mockAdminVerifyToken.mockResolvedValue({
        id: 'user-1',
        email: 'outsider@example.com',
      })
      mockIsEmailAllowed.mockReturnValue(false)
      const { requireAuth } = await import('./auth.server')
      const result = await requireAuth(
        new Request('http://localhost', {
          headers: { Authorization: 'Bearer valid-token' },
        }),
      )
      expect(result.error).toBeDefined()
      expect(result.error!.status).toBe(403)
    })

    it('allows when email is on allowlist', async () => {
      mockAdminVerifyToken.mockResolvedValue({
        id: 'user-1',
        email: 'allowed@example.com',
      })
      mockIsEmailAllowed.mockReturnValue(true)
      const { requireAuth } = await import('./auth.server')
      const result = await requireAuth(
        new Request('http://localhost', {
          headers: { Authorization: 'Bearer valid-token' },
        }),
      )
      expect(result).toEqual({ userId: 'user-1' })
    })
  })
})
