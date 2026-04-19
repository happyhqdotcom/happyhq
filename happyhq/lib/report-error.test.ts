import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { reportError } from './report-error'

describe('reportError', () => {
  const sendBeacon = vi.fn(() => true)
  const originalNavigator = globalThis.navigator

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(globalThis, 'navigator', {
      value: { sendBeacon },
      configurable: true,
      writable: true,
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    sendBeacon.mockClear()
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
  })

  it('sends error via sendBeacon', () => {
    reportError('client.error', { message: 'test' })

    expect(sendBeacon).toHaveBeenCalledOnce()
    expect(sendBeacon).toHaveBeenCalledWith('/api/log', expect.any(Blob))
  })

  it('deduplicates within 10 second window', () => {
    reportError('client.error', { message: 'same error' })
    reportError('client.error', { message: 'same error' })
    reportError('client.error', { message: 'same error' })

    expect(sendBeacon).toHaveBeenCalledOnce()
  })

  it('allows same error after dedup window expires', () => {
    reportError('client.error', { message: 'retry error' })
    vi.advanceTimersByTime(11_000)
    reportError('client.error', { message: 'retry error' })

    expect(sendBeacon).toHaveBeenCalledTimes(2)
  })

  it('allows different errors within same window', () => {
    reportError('client.error', { message: 'error A' })
    reportError('client.error', { message: 'error B' })

    expect(sendBeacon).toHaveBeenCalledTimes(2)
  })

  it('never throws', () => {
    sendBeacon.mockImplementation(() => {
      throw new Error('beacon failed')
    })

    expect(() => {
      reportError('client.error', { message: 'test' })
    }).not.toThrow()
  })

  it('falls back to fetch when sendBeacon is unavailable', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }))

    reportError('client.fetch.error', { url: '/api/test', status: 500 })

    expect(fetchSpy).toHaveBeenCalledWith('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: expect.any(String),
      keepalive: true,
    })

    fetchSpy.mockRestore()
  })
})
