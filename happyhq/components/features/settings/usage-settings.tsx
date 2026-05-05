'use client'

import { Link } from '@/components/common/catalyst/link'
import { useBillingData } from '@/components/features/billing/use-billing-data'
import { getTierLimits } from '@/ee/lib/billing/plans'
import { formatMinutes, formatPrice } from '@/lib/format'

/**
 * Usage settings — shows current plan and runtime usage meter.
 * Extracted from BillingSettings so usage has its own page.
 */
export function UsageSettings() {
  const billing = useBillingData()

  if (!billing) {
    return null
  }

  const { currentTier, usedMinutes, includedMinutes, isPastDue, periodEnd } =
    billing
  const tierLimits = getTierLimits(currentTier)
  const usagePercent =
    includedMinutes > 0
      ? Math.min((usedMinutes / includedMinutes) * 100, 100)
      : 0

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
          {isPastDue && (
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
        {periodEnd != null && (
          <p className="mt-1 text-sm text-zinc-500">
            Resets{' '}
            {new Date(periodEnd).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
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
