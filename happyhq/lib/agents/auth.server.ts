import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { CLIENT_ID, TOKEN_URL } from '@/lib/auth/oauth-constants'
import { qPath } from '@/lib/fs/paths'

/** Path to the Q config file that may contain a stored API key. */
function configPath(): string {
  return path.join(qPath(), 'config.json')
}

interface QConfig {
  apiKey?: string
  oauthToken?: string
  oauthRefreshToken?: string
  oauthExpiresAt?: number // unix timestamp ms
}

/**
 * Read the stored Q config from .q/config.json.
 * Returns null if the file does not exist or is malformed.
 */
async function readConfig(): Promise<QConfig | null> {
  try {
    const raw = await readFile(configPath(), 'utf-8')
    return JSON.parse(raw) as QConfig
  } catch {
    return null
  }
}

/**
 * Determine the env override to pass to the Claude Agent SDK.
 *
 * Priority:
 * 1. ANTHROPIC_API_KEY env var → return undefined (SDK reads from process.env)
 * 2. Accounts + AI gateway → route through Cloudflare AI Gateway
 * 3. Stored OAuth token → return env with CLAUDE_CODE_OAUTH_TOKEN
 * 4. Stored API key in .q/config.json → return env with ANTHROPIC_API_KEY set
 * 5. Neither → return undefined (SDK tries claude login credentials)
 */
export async function getAuthEnv(): Promise<
  Record<string, string | undefined> | undefined
> {
  // Priority 1: env var already set — SDK picks it up automatically
  if (process.env.ANTHROPIC_API_KEY) {
    return undefined
  }

  // Priority 2: accounts with AI gateway — route through Cloudflare
  if (
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === 'true' &&
    process.env.CLOUDFLARE_AI_GATEWAY_URL
  ) {
    return {
      ...process.env,
      ANTHROPIC_BASE_URL: process.env.CLOUDFLARE_AI_GATEWAY_URL,
    }
  }

  // Priority 3: stored OAuth token from Claude sign-in
  const config = await readConfig()
  if (config?.oauthToken) {
    let token = config.oauthToken

    // Auto-refresh if token expires within 5 minutes
    if (
      config.oauthRefreshToken &&
      config.oauthExpiresAt &&
      config.oauthExpiresAt - Date.now() < 5 * 60 * 1000
    ) {
      const refreshed = await refreshOAuthToken(config.oauthRefreshToken)
      if (refreshed) {
        token = refreshed
      } else {
        // Refresh failed — clear credentials so user gets sent to /setup
        await clearCredentials()
        return undefined
      }
    }

    return {
      ...process.env,
      CLAUDE_CODE_OAUTH_TOKEN: token,
    }
  }

  // Priority 4: stored API key in config file
  if (config?.apiKey) {
    return {
      ...process.env,
      ANTHROPIC_API_KEY: config.apiKey,
    }
  }

  // Priority 5: no override — SDK will try claude login credentials
  return undefined
}

/**
 * Store an API key in .q/config.json.
 * Creates the .q/ directory if it doesn't exist.
 * Preserves other config fields if the file already exists.
 */
export async function storeApiKey(key: string): Promise<void> {
  const existing = await readConfig()
  const config: QConfig = { ...existing, apiKey: key }
  const dir = qPath()
  await mkdir(dir, { recursive: true })
  await writeFile(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Store OAuth credentials in .q/config.json (from the Claude sign-in flow).
 * Creates the .q/ directory if it doesn't exist.
 * Preserves other config fields if the file already exists.
 */
export async function storeOAuthToken(
  accessToken: string,
  refreshToken?: string,
  expiresIn?: number,
): Promise<void> {
  const existing = await readConfig()
  const config: QConfig = {
    ...existing,
    oauthToken: accessToken,
    oauthRefreshToken: refreshToken ?? existing?.oauthRefreshToken,
    oauthExpiresAt: expiresIn
      ? Date.now() + expiresIn * 1000
      : existing?.oauthExpiresAt,
  }
  const dir = qPath()
  await mkdir(dir, { recursive: true })
  await writeFile(configPath(), JSON.stringify(config, null, 2), 'utf-8')
}

/**
 * Remove all stored credentials (API key + OAuth) from .q/config.json.
 * Preserves non-auth config fields. No-op if no config file exists.
 */
export async function clearCredentials(): Promise<void> {
  const existing = await readConfig()
  if (!existing) return
  const {
    apiKey: _a,
    oauthToken: _b,
    oauthRefreshToken: _c,
    oauthExpiresAt: _d,
    ...rest
  } = existing
  await writeFile(configPath(), JSON.stringify(rest, null, 2), 'utf-8')
}

/**
 * Refresh an OAuth access token using a refresh token.
 * Stores the new credentials and returns the new access token,
 * or null if the refresh failed.
 */
async function refreshOAuthToken(refreshToken: string): Promise<string | null> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!data.access_token) return null
    await storeOAuthToken(
      data.access_token,
      data.refresh_token,
      data.expires_in,
    )
    return data.access_token
  } catch {
    return null
  }
}

/**
 * Check whether an error from the SDK looks like an authentication failure.
 * Used to detect invalid API keys so we can clear stored credentials and
 * redirect the user to the setup screen.
 */
export function isAuthError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error)
  const lower = msg.toLowerCase()
  return (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('invalid x-api-key') ||
    lower.includes('invalid api key') ||
    lower.includes('authentication_error')
  )
}

export interface AuthStatus {
  authenticated: boolean
  method?: 'claude_login' | 'api_key_env' | 'api_key_stored' | 'accounts'
  email?: string
}

/**
 * Check auth status across all three methods.
 *
 * Fast methods (env var, stored key) are checked first to avoid the
 * ~5 s subprocess timeout from `claude auth status` on every request.
 *
 * Priority order:
 * 1. ANTHROPIC_API_KEY env var (instant)
 * 2. Accounts + AI gateway (instant)
 * 3. Stored OAuth token or API key in .q/config.json (instant)
 * 4. `claude auth status` — checks if the CLI has valid OAuth credentials (slow)
 */
export async function checkAuthStatus(): Promise<AuthStatus> {
  // Method 1: ANTHROPIC_API_KEY env var — instant
  if (process.env.ANTHROPIC_API_KEY) {
    return { authenticated: true, method: 'api_key_env' }
  }

  // Method 2: accounts with AI gateway — instant
  if (
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === 'true' &&
    process.env.CLOUDFLARE_AI_GATEWAY_URL
  ) {
    return { authenticated: true, method: 'accounts' }
  }

  // Method 3: stored OAuth token or API key — instant
  const config = await readConfig()
  if (config?.oauthToken) {
    return { authenticated: true, method: 'claude_login' }
  }
  if (config?.apiKey) {
    return { authenticated: true, method: 'api_key_stored' }
  }

  // Method 4: claude login credentials — slow (up to 5 s subprocess timeout)
  try {
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile(
          'claude',
          ['auth', 'status'],
          { timeout: 5000 },
          (error, stdout, stderr) => {
            if (error) reject(error)
            else resolve({ stdout, stderr })
          },
        )
      },
    )
    // CLI outputs JSON: { loggedIn: true, email: "...", ... }
    // Exit code 0 means authenticated.
    let email: string | undefined
    try {
      const parsed = JSON.parse(stdout)
      email = parsed.email
    } catch {
      // If JSON parsing fails, try regex as fallback
      const emailMatch = stdout.match(/([^\s]+@[^\s]+)/)
      email = emailMatch?.[1]
    }
    return {
      authenticated: true,
      method: 'claude_login',
      email,
    }
  } catch {
    // Command failed or not found — no credentials found at all
  }

  return { authenticated: false }
}
