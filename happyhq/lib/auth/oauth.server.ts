/**
 * OAuth 2.0 + PKCE logic for authenticating with Claude via claude.ai.
 *
 * Extracted from the two login route handlers so they become thin wrappers.
 * Uses the same PKCE flow as the Claude Code CLI, replicated because
 * `claude auth login` requires a TTY.
 */

import { createHash, randomBytes, randomUUID } from 'node:crypto'

import { storeOAuthToken } from '@/lib/agents/auth.server'
import {
  clearOAuthSession,
  getOAuthSession,
  registerOAuthSession,
} from '@/lib/auth/oauth-sessions'

export {
  AUTHORIZE_URL,
  CLIENT_ID,
  REDIRECT_URI,
  SCOPES,
  TOKEN_URL,
} from '@/lib/auth/oauth-constants'

import {
  AUTHORIZE_URL,
  CLIENT_ID,
  REDIRECT_URI,
  SCOPES,
  TOKEN_URL,
} from '@/lib/auth/oauth-constants'

// ── PKCE helpers ──────────────────────────────────────────────────────

/** Generate a cryptographically random base64url string. */
export function randomBase64url(bytes: number): string {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/** SHA-256 hash as base64url (for PKCE S256 challenge). */
export function sha256Base64url(value: string): string {
  return createHash('sha256')
    .update(value)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

// ── buildAuthorizationUrl ─────────────────────────────────────────────

/** Generate a PKCE pair, register the session, and return the OAuth URL. */
export function buildAuthorizationUrl(): { url: string; sessionId: string } {
  const sessionId = randomUUID()
  const codeVerifier = randomBase64url(32)
  const codeChallenge = sha256Base64url(codeVerifier)
  const state = randomBase64url(32)

  registerOAuthSession(sessionId, { codeVerifier, state })

  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES.join(' '),
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
  })

  return { url: `${AUTHORIZE_URL}?${params.toString()}`, sessionId }
}

// ── exchangeOAuthCode ─────────────────────────────────────────────────

export type OAuthExchangeResult =
  | { ok: true }
  | { ok: false; error: string; detail?: string; status: number }

/**
 * Exchange an OAuth authorization code for an access token.
 *
 * Looks up the PKCE session, parses the `code#state` format, calls the
 * token endpoint, and stores the resulting access token.
 */
export async function exchangeOAuthCode(
  code: string,
  sessionId: string,
): Promise<OAuthExchangeResult> {
  const session = getOAuthSession(sessionId)
  if (!session) {
    return {
      ok: false,
      error: 'Login session not found or expired',
      status: 404,
    }
  }

  const [authorizationCode, codeState] = code.trim().split('#')
  if (!authorizationCode) {
    return {
      ok: false,
      error: 'Invalid code format — expected code#state',
      status: 400,
    }
  }

  const tokenRes = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: authorizationCode,
      redirect_uri: REDIRECT_URI,
      client_id: CLIENT_ID,
      code_verifier: session.codeVerifier,
      state: codeState || session.state,
    }),
  })

  if (!tokenRes.ok) {
    const text = await tokenRes.text()
    return {
      ok: false,
      error: `Token exchange failed (${tokenRes.status})`,
      detail: text,
      status: 502,
    }
  }

  const tokenData = await tokenRes.json()
  const accessToken = tokenData.access_token
  if (!accessToken) {
    return {
      ok: false,
      error: 'No access token in response',
      status: 502,
    }
  }

  await storeOAuthToken(
    accessToken,
    tokenData.refresh_token,
    tokenData.expires_in,
  )
  clearOAuthSession(sessionId)

  return { ok: true }
}
