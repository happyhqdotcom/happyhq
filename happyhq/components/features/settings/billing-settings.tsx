'use client'

import { SettingsRow } from '@/app/(settings)/settings/_components/settings-row'
import { SettingsSection } from '@/app/(settings)/settings/_components/settings-section'
import { Button } from '@/components/common/catalyst/button'
import { getTierLimits, TIER_NAMES } from '@/ee/lib/billing/plans'
import type { TierName } from '@/ee/lib/billing/types'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'
import { formatPrice } from '@/lib/format'
import { useCallback, useState } from 'react'

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function formatRenewalDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Billing settings section — shows current plan and subscription management.
 * Usage meter lives on the Usage page. Uses InstantDB reactive queries.
 */
export function BillingSettings() {
  const { user, token } = useCurrentUser()
  const [portalLoading, setPortalLoading] = useState(false)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Query subscription data linked to the current user
  const billingQuery = db?.useQuery(
    user
      ? {
          subscriptions: { $: { where: { 'user.id': user.id } } },
        }
      : null,
  )

  const subscriptions = billingQuery?.data?.subscriptions ?? []

  // Find the active subscription (active or past_due)
  const activeSubscription = subscriptions.find(
    (s: { status: string }) => s.status === 'active' || s.status === 'past_due',
  )

  const currentTier: TierName = (activeSubscription?.tier as TierName) ?? 'free'
  const tierLimits = getTierLimits(currentTier)

  // Next tier up for upgrade (null if already on max)
  const currentTierIndex = TIER_NAMES.indexOf(currentTier)
  const nextTier =
    currentTierIndex < TIER_NAMES.length - 1
      ? TIER_NAMES[currentTierIndex + 1]
      : null

  const handleManageSubscription = useCallback(async () => {
    setPortalLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: {
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      })
      const data = await res.json()

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to open billing portal')
        setPortalLoading(false)
        return
      }

      window.location.href = data.url
    } catch {
      setError('Failed to open billing portal. Please try again.')
      setPortalLoading(false)
    }
  }, [token])

  const handleUpgrade = useCallback(async () => {
    if (!nextTier) return
    setUpgradeLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ tier: nextTier }),
      })
      const data = await res.json()

      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to start checkout')
        setUpgradeLoading(false)
        return
      }

      window.location.href = data.url
    } catch {
      setError('Failed to start checkout. Please try again.')
      setUpgradeLoading(false)
    }
  }, [token, nextTier])

  if (!user) {
    return null
  }

  return (
    <>
      <SettingsSection title="Plan">
        <SettingsRow label="Current plan">
          <p className="text-sm text-zinc-500">
            {capitalize(currentTier)} — {formatPrice(tierLimits.priceMonthly)}
          </p>
        </SettingsRow>

        {activeSubscription?.currentPeriodEnd && (
          <SettingsRow label="Renews">
            <p className="text-sm text-zinc-500">
              {formatRenewalDate(Number(activeSubscription.currentPeriodEnd))}
            </p>
          </SettingsRow>
        )}

        {activeSubscription?.status === 'past_due' && (
          <SettingsRow label="Status">
            <p className="text-sm font-medium text-amber-600">
              Payment past due
            </p>
          </SettingsRow>
        )}
      </SettingsSection>

      <SettingsSection title="Subscription">
        {nextTier && (
          <SettingsRow
            label={`Upgrade to ${capitalize(nextTier)}`}
            description={`${formatPrice(getTierLimits(nextTier).priceMonthly)} — more runtime, storage, and team members`}
          >
            <Button plain onClick={handleUpgrade} disabled={upgradeLoading}>
              {upgradeLoading ? 'Redirecting...' : 'Upgrade'}
            </Button>
          </SettingsRow>
        )}

        {currentTier !== 'free' && (
          <SettingsRow
            label="Manage subscription"
            description="Update payment method or cancel"
          >
            <Button
              plain
              onClick={handleManageSubscription}
              disabled={portalLoading}
            >
              {portalLoading ? 'Opening...' : 'Manage'}
            </Button>
          </SettingsRow>
        )}

        {error && (
          <p className="px-1 py-2 text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </SettingsSection>
    </>
  )
}
