/**
 * Tests for POST /api/auth/login route.
 *
 * The route is a thin wrapper over buildAuthorizationUrl() —
 * PKCE and OAuth URL construction are tested in lib/auth/oauth.server.test.ts.
 */

const mockBuildAuthorizationUrl = vi.hoisted(() => vi.fn())

vi.mock('@/lib/auth/oauth.server', () => ({
  buildAuthorizationUrl: mockBuildAuthorizationUrl,
}))

import { POST } from './route'

describe('POST /api/auth/login', () => {
  it('returns the result of buildAuthorizationUrl as JSON', async () => {
    mockBuildAuthorizationUrl.mockReturnValue({
      url: 'https://claude.ai/oauth/authorize?test=1',
      sessionId: 'sess-abc',
    })

    const res = await POST()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      url: 'https://claude.ai/oauth/authorize?test=1',
      sessionId: 'sess-abc',
    })
  })
})
