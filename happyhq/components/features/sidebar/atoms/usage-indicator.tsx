'use client'

import type { UsageData } from '@/components/features/billing/use-billing-data'
import type { TierName } from '@/ee/lib/billing/types'
import { formatMinutes } from '@/lib/format'

function usageColor(remainingPercent: number): string {
  if (remainingPercent <= 0) return 'text-red-500'
  if (remainingPercent < 25) return 'text-red-500'
  if (remainingPercent <= 50) return 'text-amber-500'
  return 'text-muted-foreground'
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
