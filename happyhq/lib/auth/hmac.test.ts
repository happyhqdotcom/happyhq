/**
 * Tests for HMAC-SHA256 utilities used by the password gate.
 *
 * Pure crypto — no framework deps.
 */

import { computeHmac, verifyHmac } from './hmac'

describe('computeHmac', () => {
  it('produces the same signature for the same password', async () => {
    const sig1 = await computeHmac('test-password')
    const sig2 = await computeHmac('test-password')
    expect(sig1).toBe(sig2)
  })

  it('produces different signatures for different passwords', async () => {
    const sig1 = await computeHmac('password-a')
    const sig2 = await computeHmac('password-b')
    expect(sig1).not.toBe(sig2)
  })

  it('returns a hex string', async () => {
    const sig = await computeHmac('anything')
    expect(sig).toMatch(/^[0-9a-f]+$/)
    // SHA-256 produces 32 bytes = 64 hex chars
    expect(sig).toHaveLength(64)
  })
})

describe('verifyHmac', () => {
  it('returns true when HMAC matches the password', async () => {
    const hmac = await computeHmac('secret')
    expect(await verifyHmac(hmac, 'secret')).toBe(true)
  })

  it('returns false for a wrong password', async () => {
    const hmac = await computeHmac('secret')
    expect(await verifyHmac(hmac, 'wrong')).toBe(false)
  })

  it('returns false for a tampered HMAC value', async () => {
    const hmac = await computeHmac('secret')
    const tampered = hmac.slice(0, -1) + (hmac.endsWith('0') ? '1' : '0')
    expect(await verifyHmac(tampered, 'secret')).toBe(false)
  })

  it('returns false for an HMAC with wrong length', async () => {
    expect(await verifyHmac('abc', 'secret')).toBe(false)
  })
})
