/**
 * Process-level store for chat mode state per session.
 * Tracks whether each session is in general or learning mode,
 * and which stream (if any) learning mode is attached to.
 *
 * Uses globalThis so the Map survives Next.js dev-mode bundle isolation
 * (each API route compiles into a separate bundle with its own module scope).
 */
type SessionMode = { mode: 'general' | 'learning'; streamSlug: string | null }

const GLOBAL_KEY = '__happyhq_session_modes' as const

function getSessionModes(): Map<string, SessionMode> {
  if (!(GLOBAL_KEY in globalThis)) {
    ;(globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<
      string,
      SessionMode
    >()
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
    string,
    SessionMode
  >
}

export function getSessionMode(sessionId: string): SessionMode | null {
  return getSessionModes().get(sessionId) ?? null
}

export function setSessionMode(
  sessionId: string,
  mode: 'general' | 'learning',
  streamSlug?: string,
): void {
  getSessionModes().set(sessionId, { mode, streamSlug: streamSlug ?? null })
}

export function clearSessionMode(sessionId: string): void {
  getSessionModes().delete(sessionId)
}
