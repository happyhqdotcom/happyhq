import type { TierLimits, TierName } from './types'

const MB = 1024 * 1024
const GB = 1024 * MB

const TIER_LIMITS: Record<TierName, TierLimits> = {
  free: {
    priceMonthly: 0,
    runtimeMinutes: 5,
    storageBytes: 100 * MB,
    streams: 1,
    specsPerStream: 1,
    users: 1,
  },
  starter: {
    priceMonthly: 3000,
    runtimeMinutes: 120,
    storageBytes: 1 * GB,
    streams: Infinity,
    specsPerStream: Infinity,
    users: 3,
  },
  pro: {
    priceMonthly: 10000,
    runtimeMinutes: 400,
    storageBytes: 10 * GB,
    streams: Infinity,
    specsPerStream: Infinity,
    users: 20,
  },
  max: {
    priceMonthly: 50000,
    runtimeMinutes: 2000,
    storageBytes: 100 * GB,
    streams: Infinity,
    specsPerStream: Infinity,
    users: Infinity,
  },
}

/** All tier names in ascending order. */
export const TIER_NAMES: readonly TierName[] = [
  'free',
  'starter',
  'pro',
  'max',
] as const

/** Returns the limit definitions for a given tier. */
export function getTierLimits(tier: TierName): TierLimits {
  return TIER_LIMITS[tier]
}
