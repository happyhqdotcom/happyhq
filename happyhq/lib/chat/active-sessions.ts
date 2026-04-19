/**
 * Process-level store for active chat AbortControllers.
 * Allows POST /api/chat/stop to abort a running learning-mode query.
 * Keyed by sessionId so multiple chats could theoretically be active.
 *
 * Uses globalThis so the Map survives Next.js dev-mode bundle isolation
 * (each API route compiles into a separate bundle with its own module scope).
 */
const GLOBAL_KEY = '__happyhq_active_sessions' as const

function getActiveSessions(): Map<string, AbortController> {
  if (!(GLOBAL_KEY in globalThis)) {
    ;(globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<
      string,
      AbortController
    >()
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
    string,
    AbortController
  >
}

/**
 * Register a new active session. Aborts any stale session with the same ID.
 */
export function registerSession(sessionId: string): AbortController {
  const sessions = getActiveSessions()
  sessions.get(sessionId)?.abort()
  const controller = new AbortController()
  sessions.set(sessionId, controller)
  return controller
}

/**
 * Abort an active session. Returns true if it was found and aborted.
 */
export function abortSession(sessionId: string): boolean {
  const sessions = getActiveSessions()
  const controller = sessions.get(sessionId)
  if (!controller) return false
  controller.abort()
  sessions.delete(sessionId)
  return true
}

/**
 * Remove a session without aborting (cleanup after normal completion).
 */
export function clearSession(sessionId: string): void {
  getActiveSessions().delete(sessionId)
}
