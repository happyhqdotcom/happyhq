import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockCheckAuthStatus = vi.hoisted(() => vi.fn())

vi.mock('@/lib/agents/auth.server', () => ({
  checkAuthStatus: mockCheckAuthStatus,
}))

import { GET } from './route'

describe('GET /api/auth/status', () => {
  const originalEnv = process.env.Q_PASSWORD

  beforeEach(() => {
    delete process.env.Q_PASSWORD
    mockCheckAuthStatus.mockResolvedValue({
      authenticated: false,
    })
  })

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.Q_PASSWORD = originalEnv
    } else {
      delete process.env.Q_PASSWORD
    }
  })

  it('returns auth status with deployed: false when Q_PASSWORD is unset', async () => {
    mockCheckAuthStatus.mockResolvedValue({
      authenticated: true,
      method: 'api_key_env',
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      authenticated: true,
      method: 'api_key_env',
      deployed: false,
    })
  })

  it('returns deployed: true when Q_PASSWORD env var is set', async () => {
    process.env.Q_PASSWORD = 'secret123'
    mockCheckAuthStatus.mockResolvedValue({
      authenticated: false,
    })

    const res = await GET()
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({
      authenticated: false,
      deployed: true,
    })
  })

  it('returns 500 with error message when checkAuthStatus throws', async () => {
    mockCheckAuthStatus.mockRejectedValue(new Error('CLI not found'))

    const res = await GET()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('CLI not found')
  })

  it('returns 500 with fallback message for non-Error throws', async () => {
    mockCheckAuthStatus.mockRejectedValue('unexpected')

    const res = await GET()
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Internal error')
  })
})
