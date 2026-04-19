/**
 * Tests for the login server action.
 *
 * HMAC utility tests live in lib/auth/hmac.test.ts.
 */

const mockCookieSet = vi.fn()

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({
    set: mockCookieSet,
  })),
}))

import { verifyHmac } from '@/lib/auth/hmac'
import { login } from './actions'

afterEach(() => {
  vi.clearAllMocks()
  delete process.env.Q_PASSWORD
})

function makeFormData(password?: string): FormData {
  const fd = new FormData()
  if (password !== undefined) {
    fd.set('password', password)
  }
  return fd
}

const blankState = { success: false }

describe('login', () => {
  it('rejects empty password', async () => {
    process.env.Q_PASSWORD = 'test'
    const result = await login(blankState, makeFormData(''))
    expect(result.success).toBe(false)
    expect(result.error).toBe('Password is required')
  })

  it('rejects missing password field', async () => {
    process.env.Q_PASSWORD = 'test'
    const result = await login(blankState, makeFormData())
    expect(result.success).toBe(false)
    expect(result.error).toBe('Password is required')
  })

  it('rejects incorrect password', async () => {
    process.env.Q_PASSWORD = 'correct-password'
    const result = await login(blankState, makeFormData('wrong-password'))
    expect(result.success).toBe(false)
    expect(result.error).toBe('Incorrect password')
  })

  it('returns error when Q_PASSWORD is not set', async () => {
    // Q_PASSWORD not set
    const result = await login(blankState, makeFormData('any-password'))
    expect(result.success).toBe(false)
    expect(result.error).toBe('Authentication is not configured')
  })

  it('sets auth cookie and returns success on correct password', async () => {
    process.env.Q_PASSWORD = 'my-secret'
    const result = await login(blankState, makeFormData('my-secret'))
    expect(result.success).toBe(true)
    expect(result.error).toBeUndefined()

    // Verify cookie was set with correct HMAC value
    expect(mockCookieSet).toHaveBeenCalledOnce()
    const [name, value, options] = mockCookieSet.mock.calls[0]
    expect(name).toBe('q-auth')

    // The cookie value should be a valid HMAC that verifies against the password
    expect(await verifyHmac(value, 'my-secret')).toBe(true)

    // Cookie options
    expect(options.httpOnly).toBe(true)
    expect(options.sameSite).toBe('lax')
    expect(options.path).toBe('/')
    expect(options.maxAge).toBe(30 * 24 * 60 * 60) // 30 days
  })
})
