/**
 * Tests for auth-gating middleware.
 *
 * Behaviors verified:
 * - No auth configured → all requests pass through
 * - Password set, no cookie → redirect to /login
 * - Password set, valid cookie → pass through
 * - Password set, invalid cookie → redirect to /login
 * - API routes are gated (not excluded from matcher)
 *
 * Note: Accounts auth (InstantDB) is handled client-side by AuthGuard,
 * not in middleware. See middleware.ts for rationale.
 */

const { mockVerifyHmac } = vi.hoisted(() => ({
  mockVerifyHmac: vi.fn<(hmac: string, password: string) => Promise<boolean>>(),
}))

vi.mock('@/lib/auth/hmac', () => ({
  verifyHmac: mockVerifyHmac,
}))

import { NextRequest } from 'next/server'
import { middleware } from './middleware'

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.Q_PASSWORD
})

function makeRequest(
  path: string,
  cookies?: { name: string; value: string }[],
) {
  const url = `http://localhost:3000${path}`
  const req = new NextRequest(url)
  if (cookies) {
    for (const cookie of cookies) {
      req.cookies.set(cookie.name, cookie.value)
    }
  }
  return req
}

function isRedirectToLogin(response: Response): boolean {
  return (
    response.status === 307 &&
    new URL(response.headers.get('location')!).pathname === '/login'
  )
}

function isPassThrough(response: Response): boolean {
  return response.headers.get('location') === null && response.status !== 307
}

describe('middleware', () => {
  describe('no auth configured', () => {
    it('passes through when neither Q_PASSWORD nor NEXT_PUBLIC_ACCOUNTS_ENABLED is set', async () => {
      const response = await middleware(makeRequest('/'))
      expect(isPassThrough(response)).toBe(true)
    })
  })

  describe('password gate only', () => {
    it('redirects to /login when cookie is missing', async () => {
      process.env.Q_PASSWORD = 'secret'
      const response = await middleware(makeRequest('/'))
      expect(isRedirectToLogin(response)).toBe(true)
    })

    it('redirects to /login when cookie is invalid', async () => {
      process.env.Q_PASSWORD = 'secret'
      mockVerifyHmac.mockResolvedValue(false)
      const response = await middleware(
        makeRequest('/', [{ name: 'q-auth', value: 'bad-hmac' }]),
      )
      expect(isRedirectToLogin(response)).toBe(true)
    })

    it('passes through when cookie is valid', async () => {
      process.env.Q_PASSWORD = 'secret'
      mockVerifyHmac.mockResolvedValue(true)
      const response = await middleware(
        makeRequest('/', [{ name: 'q-auth', value: 'valid-hmac' }]),
      )
      expect(isPassThrough(response)).toBe(true)
    })

    it('gates API routes (cookie required)', async () => {
      process.env.Q_PASSWORD = 'secret'
      const response = await middleware(makeRequest('/api/fs/list?path=/'))
      expect(isRedirectToLogin(response)).toBe(true)
    })

    it('verifies cookie against Q_PASSWORD', async () => {
      process.env.Q_PASSWORD = 'my-password'
      mockVerifyHmac.mockResolvedValue(true)
      await middleware(
        makeRequest('/', [{ name: 'q-auth', value: 'some-hmac-value' }]),
      )
      expect(mockVerifyHmac).toHaveBeenCalledWith(
        'some-hmac-value',
        'my-password',
      )
    })
  })
})
