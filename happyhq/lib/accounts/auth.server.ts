import { isEmailAllowed } from '@/lib/accounts/config'
import { getAdminDb } from '@/lib/database/instant.server'

type VerifiedUser = { id: string; email: string }

/**
 * Verifies a client-provided auth token via the admin SDK.
 * Returns { id, email } if valid, null otherwise.
 *
 * The client passes the token from db.useAuth().user.refresh_token
 * directly, following InstantDB's recommended pattern from their
 * stripe-credits example.
 */
export async function verifyToken(token: string): Promise<VerifiedUser | null> {
  try {
    const adminDb = getAdminDb()
    const verified = await adminDb.auth.verifyToken(token)
    if (!verified?.id || !verified?.email) return null
    return { id: verified.id, email: verified.email }
  } catch {
    return null
  }
}

type AuthResult =
  | { userId: string; error?: never }
  | { userId?: never; error: Response }

/**
 * Extracts and verifies a Bearer token from the request.
 * Returns { userId } on success, or { error: Response } on failure.
 * When ALLOWED_EMAILS is set, rejects users not on the allowlist (403).
 *
 * Usage in route handlers:
 *   const auth = await requireAuth(request)
 *   if (auth.error) return auth.error
 *   const { userId } = auth
 */
export async function requireAuth(request: Request): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization')
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : undefined
  if (!token) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  const verified = await verifyToken(token)
  if (!verified) {
    return { error: Response.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!isEmailAllowed(verified.email)) {
    return {
      error: Response.json(
        { error: 'This instance is restricted' },
        { status: 403 },
      ),
    }
  }
  return { userId: verified.id }
}
