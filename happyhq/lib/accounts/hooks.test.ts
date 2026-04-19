import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mockUseAuth = vi.hoisted(() => vi.fn())

vi.mock('@/lib/database/instant', () => ({
  db: {
    useAuth: mockUseAuth,
  },
}))

vi.mock('./config', () => ({
  isAccountsEnabledClient: vi.fn(() => true),
}))

import { isAccountsEnabledClient } from './config'
import { useCurrentUser } from './hooks'

afterEach(() => {
  vi.clearAllMocks()
})

describe('useCurrentUser', () => {
  describe('when accounts are disabled', () => {
    it('returns user: null, isLoading: false, isAuthenticated: false', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(false)

      const { result } = renderHook(() => useCurrentUser())

      expect(result.current.user).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('returns the same reference across renders (stable for React 19)', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(false)

      const { result, rerender } = renderHook(() => useCurrentUser())
      const first = result.current
      rerender()
      const second = result.current

      expect(first).toBe(second)
    })
  })

  describe('when accounts are enabled', () => {
    it('returns isLoading: true while auth is loading', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(true)
      mockUseAuth.mockReturnValue({
        isLoading: true,
        error: undefined,
        user: undefined,
      })

      const { result } = renderHook(() => useCurrentUser())

      expect(result.current.user).toBeNull()
      expect(result.current.isLoading).toBe(true)
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('returns isAuthenticated: false on auth error', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(true)
      mockUseAuth.mockReturnValue({
        isLoading: false,
        error: { message: 'Token expired' },
        user: undefined,
      })

      const { result } = renderHook(() => useCurrentUser())

      expect(result.current.user).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('returns isAuthenticated: false when user is null', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(true)
      mockUseAuth.mockReturnValue({
        isLoading: false,
        error: undefined,
        user: null,
      })

      const { result } = renderHook(() => useCurrentUser())

      expect(result.current.user).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isAuthenticated).toBe(false)
    })

    it('returns mapped user and isAuthenticated: true when authenticated', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(true)
      mockUseAuth.mockReturnValue({
        isLoading: false,
        error: undefined,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          refresh_token: 'tok_abc',
          isGuest: false,
        },
      })

      const { result } = renderHook(() => useCurrentUser())

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.isLoading).toBe(false)
      expect(result.current.user).toMatchObject({
        id: 'user-123',
        email: 'test@example.com',
      })
    })

    it('handles missing email gracefully', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(true)
      mockUseAuth.mockReturnValue({
        isLoading: false,
        error: undefined,
        user: {
          id: 'user-456',
          email: null,
          refresh_token: 'tok_def',
          isGuest: false,
        },
      })

      const { result } = renderHook(() => useCurrentUser())

      expect(result.current.isAuthenticated).toBe(true)
      expect(result.current.user?.email).toBe('')
    })
  })
})
