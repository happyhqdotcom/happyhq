'use client'

import { useEffect, useState } from 'react'

import { getTierLimits } from '@/ee/lib/billing/plans'
import type { TierName } from '@/ee/lib/billing/types'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'

export type UsageData = {
  currentTier: TierName
  usedMinutes: number
  includedMinutes: number
  remainingMinutes: number
  remainingPercent: number
}

/**
 * Queries billing data from InstantDB and derives usage state.
 * Returns null when user is not authenticated or billing data isn't loaded —
 * callers (CE / unauthenticated paths) should treat null as "defer to server".
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

  const activeSubscription = subscriptions.find(
    (s: { status: string }) => s.status === 'active' || s.status === 'past_due',
  )

  const currentTier: TierName = (activeSubscription?.tier as TierName) ?? 'free'
  const tierLimits = getTierLimits(currentTier)

  // Re-evaluate the active period periodically so the meter switches over when
  // a billing period boundary crosses while the page is open.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

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
