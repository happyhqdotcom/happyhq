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

import { useRunActions } from './use-run-actions'

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
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
