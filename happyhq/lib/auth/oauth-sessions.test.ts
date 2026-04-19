import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearOAuthSession,
  getOAuthSession,
  registerOAuthSession,
} from './oauth-sessions'

const GLOBAL_KEY = '__happyhq_oauth_sessions'

beforeEach(() => {
  vi.useFakeTimers()
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY]
})

afterEach(() => {
  vi.useRealTimers()
})

describe('registerOAuthSession + getOAuthSession', () => {
  it('round-trips stored session data', () => {
    const data = { codeVerifier: 'verifier-1', state: 'state-1' }
    registerOAuthSession('sess-1', data)

    const result = getOAuthSession('sess-1')
    expect(result).toEqual(data)
  })

  it('returns null for an unknown session ID', () => {
    expect(getOAuthSession('nonexistent')).toBe(null)
  })

  it('returns null for a session older than 5 minutes', () => {
    registerOAuthSession('sess-1', {
      codeVerifier: 'v',
      state: 's',
    })

    // Advance past the 5-minute TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    expect(getOAuthSession('sess-1')).toBe(null)
  })

  it('deletes the expired entry from the Map on access', () => {
    registerOAuthSession('sess-1', {
      codeVerifier: 'v',
      state: 's',
    })

    vi.advanceTimersByTime(5 * 60 * 1000 + 1)
    getOAuthSession('sess-1')

    // The entry should be gone from the underlying Map
    const map = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
      string,
      unknown
    >
    expect(map.has('sess-1')).toBe(false)
  })

  it('returns data for a session within the 5-minute TTL', () => {
    registerOAuthSession('sess-1', {
      codeVerifier: 'v',
      state: 's',
    })

    // Just under 5 minutes
    vi.advanceTimersByTime(5 * 60 * 1000 - 1)

    expect(getOAuthSession('sess-1')).toEqual({
      codeVerifier: 'v',
      state: 's',
    })
  })
})

describe('registerOAuthSession purges stale sessions', () => {
  it('removes sessions older than 5 minutes before adding a new one', () => {
    registerOAuthSession('old-sess', {
      codeVerifier: 'old-v',
      state: 'old-s',
    })

    // Advance past TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1)

    // Registering a new session should purge the stale one
    registerOAuthSession('new-sess', {
      codeVerifier: 'new-v',
      state: 'new-s',
    })

    const map = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
      string,
      unknown
    >
    expect(map.has('old-sess')).toBe(false)
    expect(map.has('new-sess')).toBe(true)
  })
})

describe('clearOAuthSession', () => {
  it('makes subsequent getOAuthSession return null', () => {
    registerOAuthSession('sess-1', {
      codeVerifier: 'v',
      state: 's',
    })

    clearOAuthSession('sess-1')

    expect(getOAuthSession('sess-1')).toBe(null)
  })
})

describe('session isolation', () => {
  it('multiple sessions do not cross-contaminate', () => {
    const data1 = { codeVerifier: 'v1', state: 's1' }
    const data2 = { codeVerifier: 'v2', state: 's2' }

    registerOAuthSession('sess-1', data1)
    registerOAuthSession('sess-2', data2)

    expect(getOAuthSession('sess-1')).toEqual(data1)
    expect(getOAuthSession('sess-2')).toEqual(data2)

    clearOAuthSession('sess-1')

    expect(getOAuthSession('sess-1')).toBe(null)
    expect(getOAuthSession('sess-2')).toEqual(data2)
  })
})

describe('globalThis persistence', () => {
  it('uses a shared Map on globalThis so state survives across imports', () => {
    registerOAuthSession('sess-1', {
      codeVerifier: 'v',
      state: 's',
    })

    const map = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
      string,
      unknown
    >
    expect(map).toBeInstanceOf(Map)
    expect(map.has('sess-1')).toBe(true)
  })
})
