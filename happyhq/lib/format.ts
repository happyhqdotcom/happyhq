/**
 * Return the custom title if set, otherwise format the slug.
 */
export function displayTitle(
  title: string | null | undefined,
  slug: string,
): string {
  return title?.trim() || formatSlug(slug)
}

/**
 * Convert a kebab-case slug to a human-readable title.
 * e.g. "passion-fruit" → "Passion Fruit"
 */
export function formatSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Convert a human-readable name to a kebab-case slug.
 * e.g. "Email Intros" → "email-intros"
 */
export function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}

// Crockford's Base32 alphabet (excludes I, L, O, U to avoid ambiguity)
const CROCKFORD = '0123456789abcdefghjkmnpqrstvwxyz'

/**
 * Encode a non-negative integer as a fixed-width Crockford Base32 string.
 * Most-significant digit first (big-endian).
 */
export function encodeCrockford(value: number, width: number): string {
  let result = ''
  let remaining = Math.floor(value)
  for (let i = 0; i < width; i++) {
    result = CROCKFORD[remaining % 32] + result
    remaining = Math.floor(remaining / 32)
  }
  return result
}

/**
 * Generate a time-sortable task slug from a title.
 *
 * Format: `{kebab-title}-{7-char-timestamp}{2-char-random}`
 * The 9-char suffix uses Crockford's Base32: 7 chars encode seconds since
 * epoch (good until ~year 3058), 2 chars are random for uniqueness.
 *
 * Example: "Email Intros" → "email-intros-01jt5m3ra"
 */
export function generateTaskSlug(title: string): string {
  const prefix = toSlug(title)
  const timestamp = encodeCrockford(Math.floor(Date.now() / 1000), 7)
  const random =
    CROCKFORD[Math.floor(Math.random() * 32)] +
    CROCKFORD[Math.floor(Math.random() * 32)]
  const suffix = timestamp + random
  return prefix ? `${prefix}-${suffix}` : suffix
}

/** Format minutes as human-readable duration, e.g. "45m", "2h", "1h 30m". */
export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded >= 60) {
    const hours = Math.floor(rounded / 60)
    const remaining = rounded % 60
    return remaining > 0 ? `${hours}h ${remaining}m` : `${hours}h`
  }
  return `${rounded}m`
}

/** Format price in cents as USD, e.g. "$30/mo". Returns "Free" for 0. */
export function formatPrice(cents: number): string {
  if (cents === 0) return 'Free'
  return `$${(cents / 100).toFixed(0)}/mo`
}

/**
 * Format an ISO 8601 timestamp as a compact relative time string.
 * e.g. "2m", "3h", "1d", "2w", "3mo", "1y"
 */
export function formatRelativeTime(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return '1m'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  if (days < 30) return `${Math.floor(days / 7)}w`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo`
  return `${Math.floor(months / 12)}y`
}
