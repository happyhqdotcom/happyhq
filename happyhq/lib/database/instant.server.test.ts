import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockInit = vi.hoisted(() => vi.fn(() => ({ mock: 'adminDb' })))
const mockId = vi.hoisted(() => vi.fn(() => 'mock-uuid'))

vi.mock('@instantdb/admin', () => ({
  init: mockInit,
  id: mockId,
}))

describe('InstantDB admin SDK', () => {
  const originalAppId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
  const originalToken = process.env.INSTANT_APP_ADMIN_TOKEN

  beforeEach(() => {
    vi.resetModules()
    mockInit.mockReturnValue({ mock: 'adminDb' })
  })

  afterEach(() => {
    if (originalAppId !== undefined) {
      process.env.NEXT_PUBLIC_INSTANT_APP_ID = originalAppId
    } else {
      delete process.env.NEXT_PUBLIC_INSTANT_APP_ID
    }
    if (originalToken !== undefined) {
      process.env.INSTANT_APP_ADMIN_TOKEN = originalToken
    } else {
      delete process.env.INSTANT_APP_ADMIN_TOKEN
    }
    vi.clearAllMocks()
  })

  it('throws when NEXT_PUBLIC_INSTANT_APP_ID is missing', async () => {
    delete process.env.NEXT_PUBLIC_INSTANT_APP_ID
    process.env.INSTANT_APP_ADMIN_TOKEN = 'token'
    const { getAdminDb } = await import('./instant.server')
    expect(() => getAdminDb()).toThrow('NEXT_PUBLIC_INSTANT_APP_ID')
  })

  it('throws when INSTANT_APP_ADMIN_TOKEN is missing', async () => {
    process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'app-id'
    delete process.env.INSTANT_APP_ADMIN_TOKEN
    const { getAdminDb } = await import('./instant.server')
    expect(() => getAdminDb()).toThrow('INSTANT_APP_ADMIN_TOKEN')
  })

  it('returns an admin SDK instance when both env vars are set', async () => {
    process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'app-id'
    process.env.INSTANT_APP_ADMIN_TOKEN = 'token'
    const { getAdminDb } = await import('./instant.server')
    const db = getAdminDb()
    expect(db).not.toBeNull()
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'app-id', adminToken: 'token' }),
    )
  })

  it('initializes only once across multiple calls', async () => {
    process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'app-id'
    process.env.INSTANT_APP_ADMIN_TOKEN = 'token'
    const { getAdminDb } = await import('./instant.server')
    const first = getAdminDb()
    const second = getAdminDb()
    expect(first).toBe(second)
    expect(mockInit).toHaveBeenCalledTimes(1)
  })

  it('re-exports id from @instantdb/admin', async () => {
    const { id } = await import('./instant.server')
    expect(id).toBe(mockId)
  })
})
