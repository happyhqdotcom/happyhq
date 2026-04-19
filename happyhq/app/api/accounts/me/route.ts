import { requireAuth } from '@/lib/accounts/auth.server'

/**
 * Lightweight check: is the current user authenticated AND allowed on this instance?
 * Returns 200 if allowed, 401 if not authenticated, 403 if not on the allowlist.
 * Used by AuthGuard to detect restricted emails after InstantDB sign-in.
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  return Response.json({ ok: true })
}
