'use client'

import { useEffect, useState } from 'react'

import { Link } from '@/components/common/catalyst/link'
import { getTierLimits } from '@/ee/lib/billing/plans'
import type { TierName } from '@/ee/lib/billing/types'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'
import { formatMinutes, formatPrice } from '@/lib/format'

// Cadence for re-checking the active billing period (see `now` state below).
const PERIOD_TICK_MS = 60_000

/**
 * Usage settings — shows current plan and runtime usage meter.
 * Extracted from BillingSettings so usage has its own page.
 */
export function UsageSettings() {
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

  // Find the active subscription (active or past_due)
  const activeSubscription = subscriptions.find(
    (s: { status: string }) => s.status === 'active' || s.status === 'past_due',
  )

  const currentTier: TierName = (activeSubscription?.tier as TierName) ?? 'free'
  const tierLimits = getTierLimits(currentTier)

  // Re-evaluate the active period periodically so the meter switches over when
  // a billing period boundary crosses while the page is open. Cadence is
  // sub-minute because monthly boundaries don't need higher precision and the
  // re-render is cheap.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), PERIOD_TICK_MS)
    return () => clearInterval(id)
  }, [])

  const currentUsage = usageRecords.find(
    (u: { periodStart: string | number; periodEnd: string | number }) =>
      Number(u.periodStart) <= now && Number(u.periodEnd) >= now,
  )

  const usedMinutes = currentUsage?.usedMinutes ?? 0
  const includedMinutes =
    currentUsage?.includedMinutes ?? tierLimits.runtimeMinutes
  const usagePercent =
    includedMinutes > 0
      ? Math.min((usedMinutes / includedMinutes) * 100, 100)
      : 0

  if (!user) {
    return null
  }

  return (
    <div>
      {/* Current plan */}
      <div className="flex items-center justify-between py-3">
        <p className="text-sm font-medium text-zinc-950">Current plan</p>
        <div className="text-right">
          <p className="text-sm text-zinc-500">
            {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)}
            {' — '}
            {formatPrice(tierLimits.priceMonthly)}
          </p>
          {activeSubscription?.status === 'past_due' && (
            <p className="text-sm font-medium text-amber-600">
              Payment past due
            </p>
          )}
        </div>
      </div>

      <div className="border-t border-zinc-950/5" />

      {/* Runtime usage meter */}
      <div className="py-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-zinc-950">Runtime usage</p>
          <p className="text-sm text-zinc-500">
            {formatMinutes(usedMinutes)} / {formatMinutes(includedMinutes)}
          </p>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div
            className="h-full rounded-full bg-zinc-900 transition-all dark:bg-white"
            style={{ width: `${usagePercent}%` }}
          />
        </div>
        {currentUsage?.periodEnd && (
          <p className="mt-1 text-sm text-zinc-500">
            Resets{' '}
            {new Date(Number(currentUsage.periodEnd)).toLocaleDateString(
              'en-US',
              { month: 'short', day: 'numeric' },
            )}
          </p>
        )}
        {usagePercent >= 90 && (
          <p className="mt-1 text-sm text-amber-600">
            {usagePercent >= 100
              ? 'Runtime limit reached'
              : 'Running low on runtime'}
          </p>
        )}
      </div>

      {/* Upgrade prompt for free tier */}
      {currentTier === 'free' && (
        <>
          <div className="border-t border-zinc-950/5" />
          <div className="py-3">
            <Link
              href="/settings/billing"
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Upgrade your plan →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
