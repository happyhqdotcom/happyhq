// Feature flag helpers for accounts.
// Both server and client read NEXT_PUBLIC_ACCOUNTS_ENABLED — Next.js makes
// NEXT_PUBLIC_* vars available in both environments.

/** Server-side accounts flag. */
export function isAccountsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === 'true'
}

/** Client-side accounts flag. */
export function isAccountsEnabledClient(): boolean {
  return process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === 'true'
}

/**
 * Parse the ALLOWED_EMAILS env var into a lowercase array.
 * Returns null when unset (no restriction).
 */
export function getAllowedEmails(): string[] | null {
  const raw = process.env.ALLOWED_EMAILS
  if (!raw) return null
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Check if an email is permitted on this instance.
 * When ALLOWED_EMAILS is unset, all emails are allowed.
 */
export function isEmailAllowed(email: string): boolean {
  const allowed = getAllowedEmails()
  if (!allowed) return true
  return allowed.includes(email.toLowerCase())
}
