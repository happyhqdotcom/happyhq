/**
 * Process-level store for in-progress OAuth PKCE sessions.
 *
 * The custom OAuth flow works in two steps:
 *   1. POST /api/auth/login  → generates PKCE pair, returns OAuth URL + sessionId
 *   2. POST /api/auth/login/code → exchanges code using stored code_verifier
 *
 * Uses globalThis so the Map survives Next.js dev-mode bundle isolation
 * (same pattern as lib/chat/active-sessions.ts).
 */

export interface OAuthSessionData {
  codeVerifier: string
  state: string
}

interface OAuthSession {
  data: OAuthSessionData
  createdAt: number
}

const GLOBAL_KEY = '__happyhq_oauth_sessions' as const
const MAX_AGE_MS = 5 * 60 * 1000 // 5 minutes

function getSessions(): Map<string, OAuthSession> {
  if (!(GLOBAL_KEY in globalThis)) {
    ;(globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<
      string,
      OAuthSession
    >()
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
    string,
    OAuthSession
  >
}

/** Remove sessions older than MAX_AGE_MS. */
function purgeStale(): void {
  const sessions = getSessions()
  const now = Date.now()
  for (const [id, session] of sessions) {
    if (now - session.createdAt > MAX_AGE_MS) {
      sessions.delete(id)
    }
  }
}

export function registerOAuthSession(id: string, data: OAuthSessionData): void {
  purgeStale()
  getSessions().set(id, { data, createdAt: Date.now() })
}

export function getOAuthSession(id: string): OAuthSessionData | null {
  const sessions = getSessions()
  const session = sessions.get(id)
  if (!session) return null
  if (Date.now() - session.createdAt > MAX_AGE_MS) {
    sessions.delete(id)
    return null
  }
  return session.data
}

export function clearOAuthSession(id: string): void {
  getSessions().delete(id)
}
