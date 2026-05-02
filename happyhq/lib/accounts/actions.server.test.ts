import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockTransact = vi.hoisted(() => vi.fn())
const mockUpdate = vi.hoisted(() => vi.fn(() => 'tx-result'))
const mockDeleteUser = vi.hoisted(() => vi.fn())
const mockGetAdminDb = vi.hoisted(() =>
  vi.fn(() => ({
    transact: mockTransact,
    tx: {
      $users: new Proxy(
        {},
        {
          get: () => ({ update: mockUpdate }),
        },
      ),
    },
    auth: {
      deleteUser: mockDeleteUser,
    },
    query: vi.fn().mockResolvedValue({ $users: [] }),
    storage: { delete: vi.fn().mockResolvedValue(undefined) },
  })),
)

vi.mock('@/lib/database/instant.server', () => ({
  getAdminDb: mockGetAdminDb,
}))

describe('actions.server', () => {
  const originalAccountsEnabled = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED

  beforeEach(() => {
    vi.resetModules()
    mockTransact.mockReset()
    mockUpdate.mockReset()
    mockDeleteUser.mockReset()
    mockGetAdminDb.mockReturnValue({
      transact: mockTransact,
      tx: {
        $users: new Proxy(
          {},
          {
            get: () => ({ update: mockUpdate }),
          },
        ),
      },
      auth: {
        deleteUser: mockDeleteUser,
      },
      query: vi.fn().mockResolvedValue({ $users: [] }),
      storage: { delete: vi.fn().mockResolvedValue(undefined) },
    })
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
  })

  afterEach(() => {
    if (originalAccountsEnabled !== undefined) {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = originalAccountsEnabled
    } else {
      delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    }
    vi.clearAllMocks()
  })

  describe('deleteAccount', () => {
    it('returns error when accounts are disabled', async () => {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'false'
      const { deleteAccount } = await import('./actions.server')
      const result = await deleteAccount('user-1')
      expect(result.success).toBe(false)
      expect(result.error).toBe('Accounts are not enabled')
    })

    it('deletes user via admin SDK', async () => {
      mockDeleteUser.mockResolvedValue({ id: 'user-1' })
      const { deleteAccount } = await import('./actions.server')

      const result = await deleteAccount('user-1')
      expect(result.success).toBe(true)
      expect(mockDeleteUser).toHaveBeenCalledWith({ id: 'user-1' })
    })

    it('runs onBeforeDelete callback before deleting', async () => {
      mockDeleteUser.mockResolvedValue({ id: 'user-1' })

      const callOrder: string[] = []
      const onBeforeDelete = vi.fn(async () => {
        callOrder.push('cleanup')
      })
      mockDeleteUser.mockImplementation(async () => {
        callOrder.push('delete')
        return { id: 'user-1' }
      })

      const { deleteAccount } = await import('./actions.server')
      const result = await deleteAccount('user-1', onBeforeDelete)

      expect(result.success).toBe(true)
      expect(onBeforeDelete).toHaveBeenCalledWith('user-1')
      expect(callOrder).toEqual(['cleanup', 'delete'])
    })

    it('returns error when deleteUser fails', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        mockDeleteUser.mockRejectedValue(new Error('InstantDB error'))
        const { deleteAccount } = await import('./actions.server')

        const result = await deleteAccount('user-1')
        expect(result.success).toBe(false)
        expect(result.error).toBe('Failed to delete account. Please try again.')
      } finally {
        errSpy.mockRestore()
      }
    })

    it('returns error when onBeforeDelete callback fails', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      try {
        const onBeforeDelete = vi.fn(async () => {
          throw new Error('Stripe error')
        })

        const { deleteAccount } = await import('./actions.server')
        const result = await deleteAccount('user-1', onBeforeDelete)

        expect(result.success).toBe(false)
        expect(result.error).toBe('Failed to delete account. Please try again.')
        // Should not have attempted to delete the user
        expect(mockDeleteUser).not.toHaveBeenCalled()
      } finally {
        errSpy.mockRestore()
      }
    })
  })
})
