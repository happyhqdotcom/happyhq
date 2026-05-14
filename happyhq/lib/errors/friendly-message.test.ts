import { describe, expect, it } from 'vitest'
import { friendlyErrorMessage, isNetworkError } from './friendly-message'

describe('isNetworkError', () => {
  it('detects Chrome "Failed to fetch"', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('detects Safari "Load failed"', () => {
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true)
  })

  it('detects Firefox "NetworkError when attempting to fetch resource"', () => {
    expect(
      isNetworkError(
        new TypeError('NetworkError when attempting to fetch resource.'),
      ),
    ).toBe(true)
  })

  it('rejects non-TypeError errors with similar text', () => {
    expect(isNetworkError(new Error('Failed to fetch'))).toBe(false)
  })

  it('rejects unrelated TypeErrors', () => {
    expect(isNetworkError(new TypeError('x is not a function'))).toBe(false)
  })
})

describe('friendlyErrorMessage', () => {
  it('maps fetch network failures to a friendly message', () => {
    const msg = friendlyErrorMessage(
      new TypeError('Failed to fetch'),
      'Failed to start',
    )
    expect(msg).toBe(
      "Couldn't reach the server — check your connection and try again",
    )
  })

  it('passes through real Error messages from the server', () => {
    expect(
      friendlyErrorMessage(
        new Error('Usage limit exceeded'),
        'Failed to start',
      ),
    ).toBe('Usage limit exceeded')
  })

  it('falls back when the value is not an Error', () => {
    expect(friendlyErrorMessage('boom', 'Failed to start')).toBe(
      'Failed to start',
    )
  })

  it('falls back when an Error has no message', () => {
    expect(friendlyErrorMessage(new Error(), 'Failed to start')).toBe(
      'Failed to start',
    )
  })
})
