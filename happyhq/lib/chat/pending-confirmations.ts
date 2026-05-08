/**
 * Process-level pending-confirmation store for tool approval.
 *
 * Bridges the canUseTool callback (which returns a Promise) with the
 * POST /api/chat/answer endpoint (which resolves it). Server-only.
 *
 * Uses globalThis so the Map survives Next.js dev-mode bundle isolation
 * (each API route compiles into a separate bundle with its own module scope).
 *
 * Keyed by toolUseId (not sessionId) so multiple blocking tools in the same
 * assistant turn each get their own slot. The SDK can fire parallel tool calls
 * within a single message — keying by sessionId would clobber earlier entries.
 *
 * Flow:
 * 1. canUseTool fires for an unapproved tool → calls waitForConfirmation(toolUseId)
 * 2. waitForConfirmation creates a Promise and stores its resolve in the Map
 * 3. User clicks Allow/Deny → POST /api/chat/answer → calls allow/denyConfirmation
 * 4. The Promise resolves with true (allow) or false (deny) → canUseTool returns → SDK continues
 *
 * Unlike pending-questions (which rejects on deny), confirmations always resolve:
 * true = allow, false = deny. Rejection is reserved for abort signals.
 */

const GLOBAL_KEY = '__happyhq_pending_confirmations' as const

type PendingEntry = {
  resolve: (allowed: boolean) => void
  reject: (reason: Error) => void
}

function getPending(): Map<string, PendingEntry> {
  if (!(GLOBAL_KEY in globalThis)) {
    ;(globalThis as Record<string, unknown>)[GLOBAL_KEY] = new Map<
      string,
      PendingEntry
    >()
  }
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as Map<
    string,
    PendingEntry
  >
}

/**
 * Create a Promise that blocks until the user allows or denies the tool.
 * Called by the canUseTool callback in chatAgentOptions.
 *
 * @param toolUseId - Unique ID for this specific tool call (from SDK canUseTool options).
 */
export function waitForConfirmation(toolUseId: string): Promise<boolean> {
  const pending = getPending()

  return new Promise<boolean>((resolve, reject) => {
    pending.set(toolUseId, { resolve, reject })
  })
}

/**
 * Resolve a pending confirmation with allow (true).
 * Called by POST /api/chat/answer when `allow === true`.
 *
 * @returns true if a pending confirmation was found and resolved, false otherwise.
 */
export function allowConfirmation(toolUseId: string): boolean {
  const pending = getPending()
  const entry = pending.get(toolUseId)
  if (!entry) return false

  pending.delete(toolUseId)
  entry.resolve(true)
  return true
}

/**
 * Resolve a pending confirmation with deny (false).
 * Called by POST /api/chat/answer when `deny === true` and no pending question exists.
 *
 * Resolves (not rejects) — deny is a normal user choice, not an error.
 * Only abort signals use rejection.
 *
 * @returns true if a pending confirmation was found and resolved, false otherwise.
 */
export function denyConfirmation(toolUseId: string): boolean {
  const pending = getPending()
  const entry = pending.get(toolUseId)
  if (!entry) return false

  pending.delete(toolUseId)
  entry.resolve(false)
  return true
}

/**
 * Cancel a pending confirmation without resolving it.
 * Used for explicit cleanup (e.g., session reset).
 * The primary cleanup path is the AbortSignal race in canUseTool.
 */
export function cancelConfirmation(toolUseId: string): void {
  getPending().delete(toolUseId)
}
