// Browser `fetch` throws a TypeError when the server is unreachable
// (Chrome: "Failed to fetch", Safari: "Load failed", Firefox: "NetworkError
// when attempting to fetch resource"). Forwarding that string into a toast
// leaves the user with no actionable cue.
const NETWORK_ERROR_PATTERNS = [
  'failed to fetch',
  'load failed',
  'networkerror',
  'network request failed',
]

const NETWORK_ERROR_MESSAGE =
  "Couldn't reach the server — check your connection and try again"

export function isNetworkError(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false
  const msg = err.message.toLowerCase()
  return NETWORK_ERROR_PATTERNS.some((pattern) => msg.includes(pattern))
}

export function friendlyErrorMessage(err: unknown, fallback: string): string {
  if (isNetworkError(err)) return NETWORK_ERROR_MESSAGE
  if (err instanceof Error && err.message) return err.message
  return fallback
}
