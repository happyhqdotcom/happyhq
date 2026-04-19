'use client'

import { useCurrentUser } from '@/lib/accounts/hooks'
import { useCallback, useState } from 'react'

interface UpgradePromptProps {
  /** Headline shown to the user. */
  title: string
  /** Supporting detail, e.g. "Upgrade for more runtime." */
  description?: string
  /** Visual variant. 'inline' renders compact text+button; 'overlay' renders a centered card; 'inline-small' renders just the button. */
  variant?: 'inline' | 'overlay' | 'inline-small'
}

/**
 * Reusable upgrade CTA. Posts to `/api/billing/checkout` for the next
 * available tier (starter) and redirects to Stripe Checkout.
 */
export function UpgradePrompt({
  title,
  description,
  variant = 'inline',
}: UpgradePromptProps) {
  const { token } = useCurrentUser()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleUpgrade = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
        body: JSON.stringify({ tier: 'starter' }),
      })
      const data = await res.json()
      if (!res.ok || !data.url) {
        setError(data.error ?? 'Failed to start checkout')
        setLoading(false)
        return
      }
      window.location.href = data.url
    } catch {
      setError('Failed to start checkout. Please try again.')
      setLoading(false)
    }
  }, [token])

  if (variant === 'inline-small') {
    return (
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={loading}
        className="shrink-0 rounded-full bg-black px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50"
      >
        {loading ? '...' : title}
      </button>
    )
  }

  if (variant === 'overlay') {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-4 text-center">
        <p className="text-sm font-medium text-black/80">{title}</p>
        {description && <p className="text-xs text-black/50">{description}</p>}
        <button
          type="button"
          onClick={handleUpgrade}
          disabled={loading}
          className="rounded-full bg-black px-5 py-2 text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50"
        >
          {loading ? 'Redirecting...' : 'Upgrade plan'}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    )
  }

  // Inline variant: compact horizontal layout
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-black/80">{title}</p>
        {description && (
          <p className="truncate text-xs text-black/50">{description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={handleUpgrade}
        disabled={loading}
        className="shrink-0 rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-black/80 disabled:opacity-50"
      >
        {loading ? 'Redirecting...' : 'Upgrade'}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
