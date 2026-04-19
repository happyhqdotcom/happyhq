import { describe, expect, it } from 'vitest'
import { getTierLimits, TIER_NAMES } from './plans'
import type { TierName } from './types'

describe('TIER_NAMES', () => {
  it('lists all four tiers in ascending order', () => {
    expect(TIER_NAMES).toEqual(['free', 'starter', 'pro', 'max'])
  })
})

describe('getTierLimits', () => {
  it('returns limits for every defined tier', () => {
    for (const tier of TIER_NAMES) {
      const limits = getTierLimits(tier)
      expect(limits).toMatchObject({
        priceMonthly: expect.any(Number),
        runtimeMinutes: expect.any(Number),
        storageBytes: expect.any(Number),
        streams: expect.any(Number),
        samplesPerStream: expect.any(Number),
        specsPerStream: expect.any(Number),
        users: expect.any(Number),
      })
    }
  })

  it('free tier has correct limits', () => {
    const limits = getTierLimits('free')
    expect(limits.priceMonthly).toBe(0)
    expect(limits.runtimeMinutes).toBe(5)
    expect(limits.streams).toBe(1)
    expect(limits.samplesPerStream).toBe(3)
    expect(limits.specsPerStream).toBe(1)
    expect(limits.users).toBe(1)
  })

  it('starter tier has correct price and runtime', () => {
    const limits = getTierLimits('starter')
    expect(limits.priceMonthly).toBe(3000)
    expect(limits.runtimeMinutes).toBe(120)
    expect(limits.users).toBe(3)
  })

  it('pro tier has correct price and runtime', () => {
    const limits = getTierLimits('pro')
    expect(limits.priceMonthly).toBe(10000)
    expect(limits.runtimeMinutes).toBe(400)
    expect(limits.users).toBe(20)
  })

  it('max tier has correct price and runtime', () => {
    const limits = getTierLimits('max')
    expect(limits.priceMonthly).toBe(50000)
    expect(limits.runtimeMinutes).toBe(2000)
  })

  it('paid tiers have unlimited streams, samples, and specs', () => {
    const paidTiers: TierName[] = ['starter', 'pro', 'max']
    for (const tier of paidTiers) {
      const limits = getTierLimits(tier)
      expect(limits.streams).toBe(Infinity)
      expect(limits.samplesPerStream).toBe(Infinity)
      expect(limits.specsPerStream).toBe(Infinity)
    }
  })

  it('max tier has unlimited users', () => {
    const limits = getTierLimits('max')
    expect(limits.users).toBe(Infinity)
  })

  it('each higher tier has more runtime than the previous', () => {
    let previousMinutes = 0
    for (const tier of TIER_NAMES) {
      const limits = getTierLimits(tier)
      expect(limits.runtimeMinutes).toBeGreaterThan(previousMinutes)
      previousMinutes = limits.runtimeMinutes
    }
  })

  it('each higher tier has more storage than the previous', () => {
    let previousStorage = 0
    for (const tier of TIER_NAMES) {
      const limits = getTierLimits(tier)
      expect(limits.storageBytes).toBeGreaterThan(previousStorage)
      previousStorage = limits.storageBytes
    }
  })
})
