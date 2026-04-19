import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock @instantdb/react to avoid real SDK initialization
const mockInit = vi.hoisted(() => vi.fn(() => ({ mock: 'db' })))

vi.mock('@instantdb/react', () => ({
  init: mockInit,
}))

describe('InstantDB client initialization', () => {
  const originalAppId = process.env.NEXT_PUBLIC_INSTANT_APP_ID

  beforeEach(() => {
    vi.resetModules()
    mockInit.mockReturnValue({ mock: 'db' })
  })

  afterEach(() => {
    if (originalAppId !== undefined) {
      process.env.NEXT_PUBLIC_INSTANT_APP_ID = originalAppId
    } else {
      delete process.env.NEXT_PUBLIC_INSTANT_APP_ID
    }
    vi.clearAllMocks()
  })

  it('exports null when NEXT_PUBLIC_INSTANT_APP_ID is unset', async () => {
    delete process.env.NEXT_PUBLIC_INSTANT_APP_ID
    const { db } = await import('./instant')
    expect(db).toBeNull()
    expect(mockInit).not.toHaveBeenCalled()
  })

  it('initializes the SDK when NEXT_PUBLIC_INSTANT_APP_ID is set', async () => {
    process.env.NEXT_PUBLIC_INSTANT_APP_ID = 'test-app-id'
    const { db } = await import('./instant')
    expect(db).not.toBeNull()
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({ appId: 'test-app-id' }),
    )
  })
})
