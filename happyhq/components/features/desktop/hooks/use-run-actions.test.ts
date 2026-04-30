import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

// Mock SWR mutate
vi.mock('swr', () => ({
  mutate: vi.fn(),
}))

// Mock useBillingData so the hook can be exercised without InstantDB.
// Default: null (CE / unauthenticated) → no client-side gate.
const mockUseBillingData = vi.fn(
  () => null as null | { remainingMinutes: number },
)
vi.mock('@/components/features/sidebar/atoms/usage-indicator', () => ({
  useBillingData: () => mockUseBillingData(),
}))

import { useRunActions } from './use-run-actions'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  mockUseBillingData.mockReturnValue(null)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('useRunActions billing integration', () => {
  const defaultArgs = ['stream-1', 'task-1', false] as const

  it('sets upgradeNeeded when run start returns 403 with upgrade:true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Runtime limit reached', upgrade: true }),
    })

    const { result } = renderHook(() =>
      useRunActions(defaultArgs[0], defaultArgs[1], false),
    )

    expect(result.current.upgradeNeeded).toBe(false)

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.upgradeNeeded).toBe(true)
    expect(result.current.error).toBe('Runtime limit reached')
  })

  it('does not set upgradeNeeded on non-billing 403', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Forbidden' }),
    })

    const { result } = renderHook(() =>
      useRunActions(defaultArgs[0], defaultArgs[1], false),
    )

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.upgradeNeeded).toBe(false)
    expect(result.current.error).toBe('Forbidden')
  })

  it('clears upgradeNeeded on next start attempt', async () => {
    // First call: 403 with upgrade
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Runtime limit reached', upgrade: true }),
    })

    const { result } = renderHook(() =>
      useRunActions(defaultArgs[0], defaultArgs[1], false),
    )

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.upgradeNeeded).toBe(true)

    // Second call: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'planning' }),
    })

    await act(async () => {
      await result.current.start()
    })
    expect(result.current.upgradeNeeded).toBe(false)
  })

  it('captures low_balance warning from successful start', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'planning',
        warning: 'low_balance',
        remainingMinutes: 3,
      }),
    })

    const { result } = renderHook(() =>
      useRunActions(defaultArgs[0], defaultArgs[1], false),
    )

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.billingWarning).toBe('low_balance')
    expect(result.current.remainingMinutes).toBe(3)
  })

  it('captures low_balance warning from successful approve', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'working',
        warning: 'low_balance',
        remainingMinutes: 2,
      }),
    })

    const { result } = renderHook(() =>
      useRunActions(defaultArgs[0], defaultArgs[1], false),
    )

    await act(async () => {
      await result.current.approve()
    })

    expect(result.current.billingWarning).toBe('low_balance')
    expect(result.current.remainingMinutes).toBe(2)
  })

  it('sets upgradeNeeded on approve 403 with upgrade:true', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: 'Runtime limit reached', upgrade: true }),
    })

    const { result } = renderHook(() =>
      useRunActions(defaultArgs[0], defaultArgs[1], false),
    )

    await act(async () => {
      await result.current.approve()
    })

    expect(result.current.upgradeNeeded).toBe(true)
  })

  describe('client-side runtime gate (issue #28)', () => {
    it('start() short-circuits to upgrade prompt when remainingMinutes is 0, without hitting the network', async () => {
      mockUseBillingData.mockReturnValue({ remainingMinutes: 0 })

      const { result } = renderHook(() =>
        useRunActions(defaultArgs[0], defaultArgs[1], false),
      )

      await act(async () => {
        await result.current.start()
      })

      expect(result.current.upgradeNeeded).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
      // No optimistic flip → run loading state stays clean
      expect(result.current.isLoading).toBe(false)
    })

    it('approve() short-circuits to upgrade prompt when remainingMinutes is 0, without hitting the network', async () => {
      mockUseBillingData.mockReturnValue({ remainingMinutes: 0 })

      const { result } = renderHook(() =>
        useRunActions(defaultArgs[0], defaultArgs[1], false),
      )

      await act(async () => {
        await result.current.approve()
      })

      expect(result.current.upgradeNeeded).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.current.isLoading).toBe(false)
    })

    it('continue_() short-circuits to upgrade prompt when remainingMinutes is 0, without hitting the network', async () => {
      mockUseBillingData.mockReturnValue({ remainingMinutes: 0 })

      const { result } = renderHook(() =>
        useRunActions(defaultArgs[0], defaultArgs[1], false),
      )

      await act(async () => {
        await result.current.continue_()
      })

      expect(result.current.upgradeNeeded).toBe(true)
      expect(mockFetch).not.toHaveBeenCalled()
      expect(result.current.isLoading).toBe(false)
    })

    it('start() proceeds normally when remainingMinutes is positive', async () => {
      mockUseBillingData.mockReturnValue({ remainingMinutes: 12 })
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'planning' }),
      })

      const { result } = renderHook(() =>
        useRunActions(defaultArgs[0], defaultArgs[1], false),
      )

      await act(async () => {
        await result.current.start()
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.current.upgradeNeeded).toBe(false)
    })

    it('start() proceeds normally when billing data is unavailable (CE / unauthenticated)', async () => {
      mockUseBillingData.mockReturnValue(null)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'planning' }),
      })

      const { result } = renderHook(() =>
        useRunActions(defaultArgs[0], defaultArgs[1], false),
      )

      await act(async () => {
        await result.current.start()
      })

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(result.current.upgradeNeeded).toBe(false)
    })
  })

  it('does not set billing warning when response has no warning', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'planning' }),
    })

    const { result } = renderHook(() =>
      useRunActions(defaultArgs[0], defaultArgs[1], false),
    )

    await act(async () => {
      await result.current.start()
    })

    expect(result.current.billingWarning).toBeNull()
    expect(result.current.remainingMinutes).toBeNull()
  })
})
