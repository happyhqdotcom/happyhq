import { getAdminDb } from '@/lib/database/instant.server'
import { streamPath } from '@/lib/fs/paths'
import { listDirectory, readStreams } from '@/lib/fs/read.server'
import path from 'node:path'

import { isBillingEnabled } from './config'
import { getTierLimits } from './plans'
import type { TierName } from './types'
import { getCurrentUsage } from './usage.server'

/**
 * Computes authoritative usedMinutes by summing all taskRuns linked to a
 * usage period. This avoids the race condition of reading a mutable counter
 * that concurrent runs could increment simultaneously.
 */
async function getAuthoritativeUsedMinutes(usageId: string): Promise<number> {
  const adminDb = getAdminDb()
  const result = await adminDb.query({
    taskRuns: { $: { where: { 'usagePeriod.id': usageId } } },
  })
  return (
    result.taskRuns?.reduce(
      (sum, r) => sum + ((r.minutes as number) ?? 0),
      0,
    ) ?? 0
  )
}

type CanStartTaskResult =
  | { allowed: true; remainingMinutes?: number; warning?: 'low_balance' }
  | { allowed: false; reason: 'usage_exhausted' }

type ObjectLimitResult = { allowed: true } | { allowed: false; reason: string }

const LOW_BALANCE_THRESHOLD_MINUTES = 5

/**
 * Looks up the user's active subscription tier from InstantDB.
 * Returns 'free' if the user has no active subscription.
 */
async function getUserTier(userId: string): Promise<TierName> {
  const adminDb = getAdminDb()
  const result = await adminDb.query({
    subscriptions: {
      $: { where: { 'user.id': userId } },
    },
  })

  const activeSub = result.subscriptions?.find(
    (s) => s.status === 'active' || s.status === 'past_due',
  )

  if (!activeSub) return 'free'
  return activeSub.tier as TierName
}

/**
 * Pre-task check: can the user start a new task run?
 * Returns allowed: false with reason when runtime is exhausted.
 * Returns warning: 'low_balance' when < 5 minutes remain.
 * Bypasses when billing is disabled.
 */
export async function canStartTask(
  userId: string,
): Promise<CanStartTaskResult> {
  if (!isBillingEnabled()) return { allowed: true }

  const usage = await getCurrentUsage(userId)

  // No usage period means free user with no billing cycle — check free tier limit
  if (!usage) {
    // Free users without a usage record can't start tasks if billing is enabled.
    // They need to subscribe first, or the system creates a usage record on first invoice.
    // For now, allow — the free tier runtime (5 min) is enforced once a usage record exists.
    return { allowed: true }
  }

  // Use authoritative sum of task runs instead of the cached counter
  // to avoid race conditions with concurrent runs.
  const usedMinutes = await getAuthoritativeUsedMinutes(usage.id)
  const remaining = usage.includedMinutes - usedMinutes

  if (remaining <= 0) {
    return { allowed: false, reason: 'usage_exhausted' }
  }

  if (remaining < LOW_BALANCE_THRESHOLD_MINUTES) {
    return {
      allowed: true,
      remainingMinutes: remaining,
      warning: 'low_balance',
    }
  }

  return { allowed: true, remainingMinutes: remaining }
}

/**
 * Can the user create a new stream?
 * Free tier: 1 stream max. Paid tiers: unlimited.
 * Counts existing streams on the filesystem.
 * Bypasses when billing is disabled.
 */
export async function canCreateStream(
  userId: string,
): Promise<ObjectLimitResult> {
  if (!isBillingEnabled()) return { allowed: true }

  const tier = await getUserTier(userId)
  const limits = getTierLimits(tier)

  if (limits.streams === Infinity) return { allowed: true }

  const streams = await readStreams()
  if (streams.length >= limits.streams) {
    return {
      allowed: false,
      reason: `Free plan allows ${limits.streams} stream${limits.streams === 1 ? '' : 's'}. Upgrade to create more.`,
    }
  }

  return { allowed: true }
}

/**
 * Can the user create a spec in this stream?
 * Free tier: 1 spec per stream. Paid tiers: unlimited.
 * Counts existing specs in the stream's specs/ directory.
 * Bypasses when billing is disabled.
 */
export async function canCreateSpec(
  userId: string,
  streamSlug: string,
): Promise<ObjectLimitResult> {
  if (!isBillingEnabled()) return { allowed: true }

  const tier = await getUserTier(userId)
  const limits = getTierLimits(tier)

  if (limits.specsPerStream === Infinity) return { allowed: true }

  const specsDir = path.join(streamPath(streamSlug), 'specs')
  const specs = await listDirectory(specsDir)
  if (specs.length >= limits.specsPerStream) {
    return {
      allowed: false,
      reason: `Free plan allows ${limits.specsPerStream} spec${limits.specsPerStream === 1 ? '' : 's'} per stream. Upgrade to add more.`,
    }
  }

  return { allowed: true }
}
