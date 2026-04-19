import { beforeEach, describe, expect, it } from 'vitest'

import {
  clearSessionMode,
  getSessionMode,
  setSessionMode,
} from './session-mode'

const GLOBAL_KEY = '__happyhq_session_modes'

beforeEach(() => {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY]
})

describe('getSessionMode', () => {
  it('returns null for an unknown session', () => {
    expect(getSessionMode('nonexistent')).toBe(null)
  })
})

describe('setSessionMode', () => {
  it('stores and retrieves general mode', () => {
    setSessionMode('sess-1', 'general')
    const result = getSessionMode('sess-1')
    expect(result).toEqual({ mode: 'general', streamSlug: null })
  })

  it('stores learning mode with a stream slug', () => {
    setSessionMode('sess-1', 'learning', 'client-reports')
    const result = getSessionMode('sess-1')
    expect(result).toEqual({ mode: 'learning', streamSlug: 'client-reports' })
  })

  it('overwrites the previous mode for the same session', () => {
    setSessionMode('sess-1', 'general')
    setSessionMode('sess-1', 'learning', 'my-stream')
    expect(getSessionMode('sess-1')).toEqual({
      mode: 'learning',
      streamSlug: 'my-stream',
    })
  })
})

describe('clearSessionMode', () => {
  it('removes the session so getSessionMode returns null', () => {
    setSessionMode('sess-1', 'learning', 'my-stream')
    clearSessionMode('sess-1')
    expect(getSessionMode('sess-1')).toBe(null)
  })

  it('does not throw for an unknown session', () => {
    expect(() => clearSessionMode('nonexistent')).not.toThrow()
  })
})

describe('session isolation', () => {
  it('multiple sessions are independent', () => {
    setSessionMode('sess-a', 'general')
    setSessionMode('sess-b', 'learning', 'stream-b')

    expect(getSessionMode('sess-a')).toEqual({
      mode: 'general',
      streamSlug: null,
    })
    expect(getSessionMode('sess-b')).toEqual({
      mode: 'learning',
      streamSlug: 'stream-b',
    })

    clearSessionMode('sess-a')
    expect(getSessionMode('sess-a')).toBe(null)
    expect(getSessionMode('sess-b')).toEqual({
      mode: 'learning',
      streamSlug: 'stream-b',
    })
  })
})

describe('globalThis persistence', () => {
  it('uses a shared Map on globalThis so state survives across imports', () => {
    setSessionMode('sess-1', 'learning', 'test-stream')

    const map = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
      string,
      unknown
    >
    expect(map).toBeInstanceOf(Map)
    expect(map.has('sess-1')).toBe(true)
  })
})
