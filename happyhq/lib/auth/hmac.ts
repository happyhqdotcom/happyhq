/**
 * HMAC-SHA256 utilities for the password gate cookie.
 *
 * Uses the Web Crypto API so it works in both Node and Edge runtimes
 * (the middleware runs on Edge).
 */

const HMAC_PAYLOAD = 'q-auth'

/**
 * Derive an HMAC-SHA256 signing key from the password string.
 */
async function deriveKey(password: string): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * Compute the HMAC-SHA256 signature of the fixed payload using the password as key.
 * Returns the signature as a hex string.
 */
export async function computeHmac(password: string): Promise<string> {
  const key = await deriveKey(password)
  const encoder = new TextEncoder()
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(HMAC_PAYLOAD),
  )
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Verify that an HMAC value matches the expected signature for the given password.
 * Uses constant-time comparison to prevent timing attacks.
 */
export async function verifyHmac(
  hmacHex: string,
  password: string,
): Promise<boolean> {
  const expected = await computeHmac(password)
  if (hmacHex.length !== expected.length) return false
  let mismatch = 0
  for (let i = 0; i < hmacHex.length; i++) {
    mismatch |= hmacHex.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return mismatch === 0
}
