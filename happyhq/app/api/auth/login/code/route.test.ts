/**
 * Tests for POST /api/auth/login/code route.
 *
 * The route handles input validation and maps exchangeOAuthCode results to HTTP responses.
 * Core OAuth exchange logic is tested in lib/auth/oauth.server.test.ts.
 */

const mockExchangeOAuthCode = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/oauth.server', () => ({
  exchangeOAuthCode: mockExchangeOAuthCode,
}))

import { POST } from './route'

function makeRequest(body: string | object) {
  const isString = typeof body === 'string'
  return new Request('http://localhost/api/auth/login/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: isString ? body : JSON.stringify(body),
  })
}

describe('POST /api/auth/login/code', () => {
  beforeEach(() => {
    mockExchangeOAuthCode.mockResolvedValue({ ok: true })
  })

  it('returns 400 for invalid JSON body', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/login/code', {
        method: 'POST',
        body: 'not json{{{',
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid request body')
  })

  it('returns 400 when sessionId is missing', async () => {
    const res = await POST(makeRequest({ code: 'abc#state' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('sessionId and code are required')
  })

  it('returns 400 when code is missing', async () => {
    const res = await POST(makeRequest({ sessionId: 'sess-123' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('sessionId and code are required')
  })

  it('returns 200 with success when exchange succeeds', async () => {
    const res = await POST(
      makeRequest({ sessionId: 'sess-123', code: 'authcode#state' }),
    )
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('passes code and sessionId to exchangeOAuthCode', async () => {
    await POST(makeRequest({ sessionId: 'sess-123', code: 'authcode#state' }))
    expect(mockExchangeOAuthCode).toHaveBeenCalledWith(
      'authcode#state',
      'sess-123',
    )
  })

  it('maps exchangeOAuthCode error result to HTTP response', async () => {
    mockExchangeOAuthCode.mockResolvedValue({
      ok: false,
      error: 'Login session not found or expired',
      status: 404,
    })
    const res = await POST(
      makeRequest({ sessionId: 'sess-123', code: 'authcode#state' }),
    )
    expect(res.status).toBe(404)
    const json = await res.json()
    expect(json.error).toBe('Login session not found or expired')
  })

  it('maps exchangeOAuthCode error with detail to HTTP response', async () => {
    mockExchangeOAuthCode.mockResolvedValue({
      ok: false,
      error: 'Token exchange failed (401)',
      detail: 'Invalid grant',
      status: 502,
    })
    const res = await POST(
      makeRequest({ sessionId: 'sess-123', code: 'authcode#state' }),
    )
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.error).toBe('Token exchange failed (401)')
    expect(json.detail).toBe('Invalid grant')
  })

  it('returns 500 when exchangeOAuthCode throws', async () => {
    mockExchangeOAuthCode.mockRejectedValue(new Error('Disk full'))
    const res = await POST(
      makeRequest({ sessionId: 'sess-123', code: 'authcode#state' }),
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('OAuth exchange failed')
    expect(json.detail).toBe('Disk full')
  })
})
