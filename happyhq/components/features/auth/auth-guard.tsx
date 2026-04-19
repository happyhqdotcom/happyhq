'use client'

import { isAccountsEnabledClient } from '@/lib/accounts/config'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

/**
 * Client-side auth guard using InstantDB's SignedIn/SignedOut components.
 * When accounts are enabled, wraps children so they only render when
 * authenticated. Redirects to /login when signed out.
 *
 * When ALLOWED_EMAILS is set on the server, AllowlistGate checks the
 * user's email after sign-in and signs them out if not permitted.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isAccountsEnabledClient() || !db) {
    return <>{children}</>
  }

  return (
    <>
      <db.SignedIn>
        <AllowlistGate>{children}</AllowlistGate>
      </db.SignedIn>
      <db.SignedOut>
        <RedirectToLogin />
      </db.SignedOut>
    </>
  )
}

/**
 * After InstantDB sign-in, verify the user is on the allowlist by
 * calling /api/accounts/me. If 403, sign them out and show a message.
 *
 * The module-level `verifiedToken` tracks which token was verified so
 * the check survives component remounts (avoiding a blank flash on soft
 * navigations) but re-runs when a different user signs in.
 */
let verifiedToken: string | null = null

function AllowlistGate({ children }: { children: React.ReactNode }) {
  const { token } = useCurrentUser()
  const [status, setStatus] = useState<'checking' | 'allowed' | 'rejected'>(
    token && token === verifiedToken ? 'allowed' : 'checking',
  )

  useEffect(() => {
    if (!token) return
    // Already verified this exact token
    if (token === verifiedToken) {
      setStatus('allowed')
      return
    }

    // Different token than what was verified — re-check
    setStatus('checking')

    let cancelled = false
    fetch('/api/accounts/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (cancelled) return
        if (res.ok) {
          verifiedToken = token
          setStatus('allowed')
        } else if (res.status === 403) {
          verifiedToken = null
          setStatus('rejected')
          db?.auth.signOut()
        } else {
          // Non-200, non-403 (e.g. 500, 401) — fail closed
          verifiedToken = null
          setStatus('rejected')
          db?.auth.signOut()
        }
      })
      .catch(() => {
        // Network error — fail closed rather than granting access
        if (!cancelled) {
          verifiedToken = null
          setStatus('rejected')
        }
      })

    return () => {
      cancelled = true
    }
  }, [token])

  if (status === 'rejected') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="max-w-sm space-y-3 text-center">
          <p className="text-lg font-medium">Access restricted</p>
          <p className="text-sm text-zinc-500">
            This instance is private. Contact the owner if you need access.
          </p>
        </div>
      </div>
    )
  }

  if (status === 'checking') {
    return null // brief blank while checking — same as InstantDB's loading state
  }

  return <>{children}</>
}

function RedirectToLogin() {
  const router = useRouter()
  useEffect(() => {
    router.push('/login')
  }, [router])
  return null
}
