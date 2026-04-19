import { beforeEach, describe, expect, it } from 'vitest'

import { abortSession, clearSession, registerSession } from './active-sessions'

const GLOBAL_KEY = '__happyhq_active_sessions'

beforeEach(() => {
  // Clear the globalThis map between tests so each test starts fresh
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY]
})

describe('registerSession', () => {
  it('returns an AbortController for a new session', () => {
    const controller = registerSession('sess-1')
    expect(controller).toBeInstanceOf(AbortController)
    expect(controller.signal.aborted).toBe(false)
  })

  it('aborts the previous controller when re-registering the same session ID', () => {
    const first = registerSession('sess-1')
    const second = registerSession('sess-1')

    expect(first.signal.aborted).toBe(true)
    expect(second.signal.aborted).toBe(false)
  })

  it('does not abort controllers for other session IDs', () => {
    const a = registerSession('sess-a')
    const b = registerSession('sess-b')

    expect(a.signal.aborted).toBe(false)
    expect(b.signal.aborted).toBe(false)
  })
})

describe('abortSession', () => {
  it('aborts the controller and returns true for a registered session', () => {
    const controller = registerSession('sess-1')
    const result = abortSession('sess-1')

    expect(result).toBe(true)
    expect(controller.signal.aborted).toBe(true)
  })

  it('returns false for an unknown session ID', () => {
    expect(abortSession('nonexistent')).toBe(false)
  })

  it('removes the session so a second abort returns false', () => {
    registerSession('sess-1')
    abortSession('sess-1')

    expect(abortSession('sess-1')).toBe(false)
  })
})

describe('clearSession', () => {
  it('removes the session without aborting the controller', () => {
    const controller = registerSession('sess-1')
    clearSession('sess-1')

    expect(controller.signal.aborted).toBe(false)
    // Session is gone — abortSession returns false
    expect(abortSession('sess-1')).toBe(false)
  })
})

describe('globalThis persistence', () => {
  it('uses a shared Map on globalThis so state survives across imports', () => {
    registerSession('sess-1')

    const map = (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
      string,
      AbortController
    >
    expect(map).toBeInstanceOf(Map)
    expect(map.has('sess-1')).toBe(true)
  })
})
