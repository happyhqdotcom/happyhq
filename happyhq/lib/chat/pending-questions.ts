/**
 * Process-level pending-question store for AskUserQuestion.
 *
 * Bridges the canUseTool callback (which returns a Promise) with the
 * POST /api/chat/answer endpoint (which resolves it). Server-only.
 *
 * Uses globalThis so the Map survives Next.js dev-mode bundle isolation
 * (each API route compiles into a separate bundle with its own module scope).
 *
 * Flow:
 * 1. canUseTool fires for AskUserQuestion → calls waitForAnswer(sessionId)
 * 2. waitForAnswer creates a Promise and stores its resolve in the Map
 * 3. User submits answer → POST /api/chat/answer → calls submitAnswer(sessionId, answers)
 * 4. submitAnswer resolves the Promise → canUseTool returns → SDK continues
 */

const GLOBAL_KEY = '__happyhq_pending_questions' as const

type PendingEntry = {
  resolve: (answers: Record<string, string>) => void
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
 * Create a Promise that blocks until the user submits an answer.
 * Called by the canUseTool callback in learningAgentOptions.
 *
 * If a stale entry exists for this sessionId (e.g., previous question
 * that was never answered), it's deleted before creating the new one.
 */
export function waitForAnswer(
  sessionId: string,
): Promise<Record<string, string>> {
  const pending = getPending()

  // Clean up any stale entry
  pending.delete(sessionId)

  return new Promise<Record<string, string>>((resolve, reject) => {
    pending.set(sessionId, { resolve, reject })
  })
}

/**
 * Resolve a pending question with the user's answers.
 * Called by POST /api/chat/answer.
 *
 * @returns true if a pending question was found and resolved, false otherwise.
 */
export function submitAnswer(
  sessionId: string,
  answers: Record<string, string>,
): boolean {
  const pending = getPending()
  const entry = pending.get(sessionId)
  if (!entry) return false

  pending.delete(sessionId)
  entry.resolve(answers)
  return true
}

/**
 * Cancel a pending question without resolving it.
 * Used for explicit cleanup (e.g., session reset).
 * The primary cleanup path is the AbortSignal race in canUseTool.
 */
export function cancelPending(sessionId: string): void {
  getPending().delete(sessionId)
}

/**
 * Deny a pending question by rejecting its Promise.
 * canUseTool catches this and returns { behavior: 'deny' }.
 *
 * @returns true if a pending question was found and denied, false otherwise.
 */
export function denyPending(sessionId: string): boolean {
  const pending = getPending()
  const entry = pending.get(sessionId)
  if (!entry) return false

  pending.delete(sessionId)
  entry.reject(new Error('User denied AskUserQuestion'))
  return true
}
