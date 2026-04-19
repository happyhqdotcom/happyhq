/**
 * Tests for OAuth PKCE logic extracted from the login route handlers.
 *
 * buildAuthorizationUrl: PKCE pair generation, OAuth URL construction, session registration.
 * exchangeOAuthCode: session lookup, code format parsing, token exchange, token storage.
 */

import { createHash } from 'node:crypto'

const mockRegisterOAuthSession = vi.hoisted(() => vi.fn())
const mockGetOAuthSession = vi.hoisted(() => vi.fn())
const mockClearOAuthSession = vi.hoisted(() => vi.fn())
const mockStoreOAuthToken = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/oauth-sessions', () => ({
  registerOAuthSession: mockRegisterOAuthSession,
  getOAuthSession: mockGetOAuthSession,
  clearOAuthSession: mockClearOAuthSession,
}))

vi.mock('@/lib/agents/auth.server', () => ({
  storeOAuthToken: mockStoreOAuthToken,
}))

import { buildAuthorizationUrl, exchangeOAuthCode } from './oauth.server'

beforeEach(() => {
  mockRegisterOAuthSession.mockReset()
  mockGetOAuthSession.mockReset()
  mockClearOAuthSession.mockReset()
  mockStoreOAuthToken.mockReset()
})

// ── buildAuthorizationUrl ─────────────────────────────────────────────

describe('buildAuthorizationUrl', () => {
  it('returns a url and sessionId', () => {
    const result = buildAuthorizationUrl()
    expect(typeof result.url).toBe('string')
    expect(typeof result.sessionId).toBe('string')
  })

  it('url starts with the Claude OAuth authorize endpoint', () => {
    const { url } = buildAuthorizationUrl()
    expect(url.startsWith('https://claude.ai/oauth/authorize?')).toBe(true)
  })

  it('url contains required OAuth params and scopes', () => {
    const { url } = buildAuthorizationUrl()
    const params = new URL(url).searchParams

    expect(params.get('client_id')).toBe('9d1c250a-e61b-44d9-88ed-5944d1962f5e')
    expect(params.get('response_type')).toBe('code')
    expect(params.get('redirect_uri')).toBe(
      'https://platform.claude.com/oauth/code/callback',
    )
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.has('code_challenge')).toBe(true)
    expect(params.has('state')).toBe(true)

    const scope = params.get('scope')!
    expect(scope).toContain('org:create_api_key')
    expect(scope).toContain('user:profile')
    expect(scope).toContain('user:inference')
    expect(scope).toContain('user:sessions:claude_code')
    expect(scope).toContain('user:mcp_servers')
  })

  it('code_challenge is a valid base64url string', () => {
    const { url } = buildAuthorizationUrl()
    const codeChallenge = new URL(url).searchParams.get('code_challenge')!
    expect(codeChallenge).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('registers session with correct PKCE data', () => {
    const { url, sessionId } = buildAuthorizationUrl()
    const params = new URL(url).searchParams

    expect(mockRegisterOAuthSession).toHaveBeenCalledOnce()
    const [registeredId, registeredData] =
      mockRegisterOAuthSession.mock.calls[0]

    expect(registeredId).toBe(sessionId)
    expect(typeof registeredData.codeVerifier).toBe('string')
    expect(typeof registeredData.state).toBe('string')

    // State in the URL must match the stored state
    expect(params.get('state')).toBe(registeredData.state)

    // Code challenge must be SHA-256/base64url of the stored codeVerifier (PKCE S256 contract)
    const expectedChallenge = createHash('sha256')
      .update(registeredData.codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    expect(params.get('code_challenge')).toBe(expectedChallenge)
  })
})

// ── exchangeOAuthCode ─────────────────────────────────────────────────

const validSession = {
  codeVerifier: 'test-code-verifier-abc123',
  state: 'test-state-xyz789',
}

function mockTokenSuccess(
  accessToken = 'oauth-token-abc',
  refreshToken = 'refresh-token-xyz',
  expiresIn = 3600,
) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () =>
      Promise.resolve({
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: expiresIn,
      }),
  })
  vi.stubGlobal('fetch', mockFetch)
  return mockFetch
}

function mockTokenFailure(status = 401, body = 'Unauthorized') {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status,
      text: () => Promise.resolve(body),
    }),
  )
}

describe('exchangeOAuthCode', () => {
  beforeEach(() => {
    mockGetOAuthSession.mockReturnValue(validSession)
    mockStoreOAuthToken.mockResolvedValue(undefined)
    mockTokenSuccess()
  })

  it('returns 404 when session is not found', async () => {
    mockGetOAuthSession.mockReturnValue(null)
    const result = await exchangeOAuthCode('abc#state', 'expired-sess')
    expect(result).toEqual({
      ok: false,
      error: 'Login session not found or expired',
      status: 404,
    })
  })

  it('returns 400 when code starts with # (empty authorization code)', async () => {
    const result = await exchangeOAuthCode('#some-state', 'sess-123')
    expect(result).toEqual({
      ok: false,
      error: 'Invalid code format — expected code#state',
      status: 400,
    })
  })

  it('returns 502 when token exchange returns non-OK response', async () => {
    mockTokenFailure(401, 'Invalid grant')
    const result = await exchangeOAuthCode('authcode#state', 'sess-123')
    expect(result).toEqual({
      ok: false,
      error: 'Token exchange failed (401)',
      detail: 'Invalid grant',
      status: 502,
    })
  })

  it('returns 502 when token response has no access_token', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ token_type: 'bearer' }),
      }),
    )
    const result = await exchangeOAuthCode('authcode#state', 'sess-123')
    expect(result).toEqual({
      ok: false,
      error: 'No access token in response',
      status: 502,
    })
  })

  it('returns ok on valid exchange', async () => {
    const result = await exchangeOAuthCode('authcode#state', 'sess-123')
    expect(result).toEqual({ ok: true })
  })

  it('stores the access token with refresh token and expiry', async () => {
    mockTokenSuccess('my-oauth-token-xyz', 'my-refresh-token', 7200)
    await exchangeOAuthCode('authcode#state', 'sess-123')
    expect(mockStoreOAuthToken).toHaveBeenCalledWith(
      'my-oauth-token-xyz',
      'my-refresh-token',
      7200,
    )
  })

  it('clears the session after successful exchange', async () => {
    await exchangeOAuthCode('authcode#state', 'sess-123')
    expect(mockClearOAuthSession).toHaveBeenCalledWith('sess-123')
  })

  it('propagates storeOAuthToken errors', async () => {
    mockStoreOAuthToken.mockRejectedValue(new Error('Disk full'))
    await expect(
      exchangeOAuthCode('authcode#state', 'sess-123'),
    ).rejects.toThrow('Disk full')
  })
})
