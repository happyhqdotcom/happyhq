'use client'

import { getTierLimits } from '@/ee/lib/billing/plans'
import type { TierName } from '@/ee/lib/billing/types'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'
import { formatMinutes } from '@/lib/format'

/** Returns Tailwind text color class based on remaining usage percentage. */
function usageColor(remainingPercent: number): string {
  if (remainingPercent <= 0) return 'text-red-500'
  if (remainingPercent < 25) return 'text-red-500'
  if (remainingPercent <= 50) return 'text-amber-500'
  return 'text-muted-foreground'
}

export type UsageData = {
  currentTier: TierName
  usedMinutes: number
  includedMinutes: number
  remainingMinutes: number
  remainingPercent: number
}

/**
 * Hook that queries billing data from InstantDB and derives usage state.
 * Returns null when user is not authenticated or billing data isn't loaded.
 */
export function useBillingData(): UsageData | null {
  const { user } = useCurrentUser()

  const billingQuery = db?.useQuery(
    user
      ? {
          subscriptions: { $: { where: { 'user.id': user.id } } },
          usage: { $: { where: { 'user.id': user.id } } },
        }
      : null,
  )

  const subscriptions = billingQuery?.data?.subscriptions ?? []
  const usageRecords = billingQuery?.data?.usage ?? []

  // Find active or past_due subscription
  const activeSubscription = subscriptions.find(
    (s: { status: string }) => s.status === 'active' || s.status === 'past_due',
  )

  const currentTier: TierName = (activeSubscription?.tier as TierName) ?? 'free'
  const tierLimits = getTierLimits(currentTier)

  // Find the current usage period
  const now = Date.now()
  const currentUsage = usageRecords.find(
    (u: { periodStart: string | number; periodEnd: string | number }) =>
      Number(u.periodStart) <= now && Number(u.periodEnd) >= now,
  )

  if (!user) return null

  const usedMinutes = (currentUsage?.usedMinutes as number) ?? 0
  const includedMinutes =
    (currentUsage?.includedMinutes as number) ?? tierLimits.runtimeMinutes
  const remainingMinutes = Math.max(includedMinutes - usedMinutes, 0)
  const remainingPercent =
    includedMinutes > 0 ? (remainingMinutes / includedMinutes) * 100 : 0

  return {
    currentTier,
    usedMinutes,
    includedMinutes,
    remainingMinutes,
    remainingPercent,
  }
}

/**
 * Compact usage display for the sidebar dropdown.
 * Shows remaining runtime with color-coded text.
 */
export function UsageIndicator({ data }: { data: UsageData }) {
  const label =
    data.remainingMinutes <= 0
      ? 'No runtime left'
      : `${formatMinutes(data.remainingMinutes)} left`

  return (
    <span className={`text-xs ${usageColor(data.remainingPercent)}`}>
      {label}
    </span>
  )
}

/**
 * Tier badge for the sidebar dropdown.
 * Capitalizes tier name.
 */
export function TierBadge({ tier }: { tier: TierName }) {
  const label = tier.charAt(0).toUpperCase() + tier.slice(1)
  return <span className="text-xs font-medium">{label}</span>
}
