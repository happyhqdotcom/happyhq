/**
 * Client-side error reporter.
 *
 * Fire-and-forget: POSTs to /api/log so client errors appear in the server
 * log at ~/HappyHQ/.logs/. Uses sendBeacon for reliability during page unload.
 * Never throws, never awaits.
 *
 * Deduplicates errors within a 10-second window to prevent storms.
 */

const DEDUP_WINDOW_MS = 10_000
const recentErrors = new Map<string, number>()

function isDuplicate(key: string): boolean {
  const now = Date.now()
  const last = recentErrors.get(key)
  if (last && now - last < DEDUP_WINDOW_MS) return true
  recentErrors.set(key, now)

  // Prune old entries to prevent unbounded growth
  if (recentErrors.size > 50) {
    for (const [k, t] of recentErrors) {
      if (now - t > DEDUP_WINDOW_MS) recentErrors.delete(k)
    }
  }

  return false
}

export function reportError(
  event: string,
  data?: Record<string, unknown>,
): void {
  try {
    const key = `${event}:${data?.message ?? data?.url ?? ''}`
    if (isDuplicate(key)) return

    const body = JSON.stringify({ event, data })

    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/log',
        new Blob([body], { type: 'application/json' }),
      )
    } else {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  } catch {
    // Reporting must never crash the app
  }
}
