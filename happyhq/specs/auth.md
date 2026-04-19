# Auth

How Q authenticates users and connects to the Anthropic API.

## Purpose

Define Q's two-layer auth system: a password gate for deployed instances and Anthropic credential management for the SDK. This spec covers the end-to-end auth flow, credential storage, runtime credential resolution, and error recovery.

For deployment-specific concerns (provisioning, Fly.io config, `Q_PASSWORD` setup), see [Deployment](deployment.md). This spec focuses on how auth works at a code level.

## Two Layers

### Layer 1: Password Gate (Deployment Only)

When `Q_PASSWORD` is set (deployed instances), Next.js middleware protects all routes. Users see a login page, enter the password, and get a signed cookie. When `Q_PASSWORD` is unset (local dev), the middleware does nothing.

- **Middleware** (`middleware.ts`): Reads `q-auth` cookie, verifies HMAC against `Q_PASSWORD`, redirects to `/login` if invalid. Excludes `/login`, `/setup`, and static assets from the matcher. Note: middleware handles **only** the password gate — InstantDB (accounts) auth is handled client-side by `AuthGuard` (see [Accounts](accounts.md)).
- **Login page** (`app/(auth)/login/page.tsx`): Server component that detects `Q_PASSWORD` and passes `hasPasswordGate` to the client-side `LoginPage` component (`login-page.tsx`). When both password gate and accounts are enabled, password form appears first; on success the UI transitions to `AccountsLogin` (see [Accounts](accounts.md)).
- **Login action** (`app/(auth)/login/actions.ts`): Validates password with constant-time HMAC comparison, sets `q-auth` HttpOnly cookie (30-day expiry, SameSite=lax).
- **Cookie format**: HMAC-SHA256 of a fixed payload using the password as key. Not the password itself.

### Layer 2: Anthropic Credentials (SDK Auth)

Q needs Anthropic API credentials to run the Claude Agent SDK. Five methods, in priority order:

1. **`ANTHROPIC_API_KEY` env var** — operator override, checked first at runtime
2. **Accounts + AI Gateway** — when `ACCOUNTS_ENABLED` and `CLOUDFLARE_AI_GATEWAY_URL` are set, auto-configures `ANTHROPIC_BASE_URL` to route through the gateway (no API key stored on user's machine)
3. **OAuth token** — stored in `~/HappyHQ/.q/config.json` via the setup screen's PKCE flow
4. **Stored API key** — stored in `~/HappyHQ/.q/config.json` via the setup screen
5. **CLI fallback** — if none of the above, the SDK tries `claude auth status` credentials as a last resort

The setup screen (`app/setup/page.tsx`) offers two user-facing methods: OAuth sign-in ("Sign in with Claude") and API key input. The env var and accounts methods are for operators and hosted deployments, not end users.

## Credential Chain

`lib/agents/auth.server.ts` is the single source of truth for credential resolution. Two functions:

- **`getAuthEnv()`** — called at SDK invocation time. Returns an env override object (`{ ANTHROPIC_API_KEY }`, `{ ANTHROPIC_BASE_URL }`, or `{ CLAUDE_CODE_OAUTH_TOKEN }`) or `undefined` (fall through to CLI). Used by the chat route and run loop.
- **`checkAuthStatus()`** — called by `GET /api/auth/status`. Five-method check: env var (instant) → accounts + gateway (instant) → stored token/key (instant) → `claude auth status` subprocess (up to 5s timeout). Returns `{ authenticated, method?, email? }`. The `method` field includes `'accounts'` for the AI gateway path.

Other exports: `storeApiKey()`, `storeOAuthToken()`, `clearApiKey()`, `isAuthError()`.

**Credential storage**: `~/HappyHQ/.q/config.json` — a simple JSON file with optional `apiKey` and `oauthToken` fields. Read/written by `auth.server.ts`.

## OAuth PKCE Flow

Custom OAuth 2.0 + PKCE against `claude.ai/oauth/authorize` — the same provider the Claude Code CLI uses, replicated because `claude auth login` requires a TTY.

1. User clicks "Sign in with Claude" on the setup screen
2. Client POSTs to `/api/auth/login` → server generates PKCE pair, stores session, returns OAuth URL
3. User opens the URL, authenticates on claude.ai, sees a callback code
4. User pastes the code (`authorizationCode#state` format) into Q's setup screen
5. Client POSTs to `/api/auth/login/code` → server exchanges code for access token, stores it
6. Setup screen polls `GET /api/auth/status` → detects `authenticated: true` → redirects to `/`

**PKCE sessions**: `lib/auth/oauth-sessions.ts` — process-level `Map` on `globalThis` (survives HMR). Sessions expire after 5 minutes; stale entries purged lazily on new registrations.

## Auth Error Recovery

When the SDK encounters an auth error during a chat or run:

1. **Detection**: `isAuthError(error)` matches 401 status, "unauthorized", "invalid x-api-key", "invalid api key", "authentication_error" (case-insensitive)
2. **Server action**: `clearApiKey()` removes the stored key from config. The run stops or the chat stream ends.
3. **Client notification**:
   - Chat stream: emits `{ type: 'auth_error', message }` NDJSON event → chatStore shows toast and hard-navigates to `/setup`
   - Run loop: stops the run silently (writes `status: 'stopped'` to `.run.json`), does not emit a stream event

## Architecture

Auth logic lives in `lib/` modules. Routes are thin wrappers that validate input, call `lib/`, and return responses.

- `lib/auth/hmac.ts` — `computeHmac()`, `verifyHmac()` for the password gate cookie
- `lib/auth/oauth.server.ts` — OAuth constants, PKCE helpers (`randomBase64url`, `sha256Base64url`), `buildAuthorizationUrl()`, `exchangeOAuthCode(code, sessionId)`
- `lib/auth/oauth-sessions.ts` — process-level PKCE session store (globalThis Map, 5-minute expiry)
- `lib/agents/auth.server.ts` — credential chain, storage, error detection
- `app/(auth)/login/actions.ts` — thin server action, imports `computeHmac` from `lib/auth/hmac`
- `middleware.ts` — imports `verifyHmac` from `lib/auth/hmac`
- `app/api/auth/login/route.ts` — thin wrapper calling `buildAuthorizationUrl()`
- `app/api/auth/login/code/route.ts` — thin wrapper calling `exchangeOAuthCode()`

## Files

| File                               | Role                                                          |
| ---------------------------------- | ------------------------------------------------------------- |
| `middleware.ts`                    | Password gate only — cookie check, redirect to `/login`       |
| `app/(auth)/login/page.tsx`        | Server component — detects password gate, renders `LoginPage` |
| `app/(auth)/login/login-page.tsx`  | Client component — password/accounts sequencing state machine |
| `app/(auth)/login/actions.ts`      | Password validation + cookie setting (thin wrapper)           |
| `lib/auth/hmac.ts`                 | HMAC-SHA256 utilities (`computeHmac`, `verifyHmac`)           |
| `app/setup/page.tsx`               | Anthropic credential setup — OAuth and API key flows          |
| `app/api/auth/status/route.ts`     | Auth status check (thin wrapper)                              |
| `lib/auth/oauth.server.ts`         | OAuth constants, PKCE, URL build, code exchange               |
| `app/api/auth/login/route.ts`      | OAuth URL generation (thin wrapper)                           |
| `app/api/auth/login/code/route.ts` | OAuth code exchange (thin wrapper)                            |
| `app/api/auth/api-key/route.ts`    | API key storage (thin wrapper)                                |
| `lib/agents/auth.server.ts`        | Credential chain, storage, error detection                    |
| `lib/auth/oauth-sessions.ts`       | Process-level PKCE session store                              |

## Acceptance Criteria

- [x] Password middleware blocks unauthenticated access when `Q_PASSWORD` is set
- [x] Password middleware is inactive when `Q_PASSWORD` is not set (local dev)
- [x] Login page accepts password and sets signed cookie
- [x] Setup screen shows OAuth and API key options
- [x] OAuth PKCE flow works end-to-end from setup screen
- [x] API key fallback works (enter key, stored, SDK uses it)
- [x] `getAuthEnv()` resolves credentials in priority order (env → OAuth → stored key → undefined)
- [x] `checkAuthStatus()` detects all auth methods including CLI fallback
- [x] Auth errors during chat emit `auth_error` event → client redirects to `/setup`
- [x] Auth errors during runs clear credentials and stop the run
- [ ] Home page redirects to `/setup` when deployed and no auth configured _(not implemented — middleware already gates all routes, so unauthenticated users never reach home)_
- [x] Extract HMAC utilities from `app/(auth)/login/actions.ts` to `lib/auth/hmac.ts`
- [x] Extract OAuth logic from login routes to `lib/auth/oauth.server.ts`
- [x] Deduplicate OAuth constants between login routes

## Testing

Password gate:

- [x] Middleware blocks unauthenticated access when Q_PASSWORD set, inactive when unset (`middleware.test.ts`)
- [x] Missing/invalid/valid cookie handling, API route gating, HMAC verification (`middleware.test.ts`)
- [x] `computeHmac` determinism, hex format; `verifyHmac` correct/wrong/tampered (`lib/auth/hmac.test.ts`)
- [x] `login` server action: empty/missing/incorrect password, cookie setting with correct options (`app/(auth)/login/actions.test.ts`)
- [x] Login page: password input, error display, pending state, redirect on success (`app/(auth)/login/page.test.tsx`)

Credential chain (`lib/agents/auth.server.ts`):

- [x] `getAuthEnv` resolves env var → stored OAuth → stored key → undefined (`lib/agents/auth.server.test.ts`)
- [x] `storeApiKey` / `clearApiKey` persist to config.json (`lib/agents/auth.server.test.ts`)
- [x] `checkAuthStatus` detects env var, stored key, CLI fallback (`lib/agents/auth.server.test.ts`)
- [x] `isAuthError` matches 401, unauthorized, invalid key patterns (`lib/agents/auth.server.test.ts`)

OAuth session store:

- [x] `registerOAuthSession` + `getOAuthSession` round-trip, expiry, stale purging, isolation (`lib/auth/oauth-sessions.test.ts`)

API routes:

- [x] POST /api/auth/api-key: input validation, key trimming, error handling (`app/api/auth/api-key/route.test.ts`)

OAuth logic (`lib/auth/oauth.server.ts`):

- [x] `buildAuthorizationUrl`: URL structure, OAuth params, scopes, base64url format, PKCE S256 contract (`lib/auth/oauth.server.test.ts`)
- [x] `exchangeOAuthCode`: session lookup, code format parsing, token exchange, token storage, session cleanup, error propagation (`lib/auth/oauth.server.test.ts`)

OAuth routes:

- [x] POST /api/auth/login: wrapper returns `buildAuthorizationUrl` result (`app/api/auth/login/route.test.ts`)
- [x] POST /api/auth/login/code: input validation, result mapping, error handling (`app/api/auth/login/code/route.test.ts`)
- [x] GET /api/auth/status: auth status merged with deployed flag, error handling (`app/api/auth/status/route.test.ts`)
- [x] `storeOAuthToken` persists to config.json, preserves existing fields (`lib/agents/auth.server.test.ts`)

Setup page:

- [x] Setup page OAuth and API key UI flows, auto-poll, mode transitions (`app/setup/page.test.tsx`)

Not tested:

- [ ] Auth error recovery during chat (auth_error NDJSON event → redirect to /setup)
- [ ] Auth error recovery during runs (clear credentials, stop run)

## Cross-References

- [Accounts](accounts.md) — Identity layer (core, not EE). When `ACCOUNTS_ENABLED`, user identity is handled by InstantDB (magic code / Google OAuth). The password gate coexists temporarily for demo VMs and will be phased out.
- [Billing](billing.md) — When EE is active (`BILLING_ENABLED`), billing depends on accounts for user identity. See Billing spec for details.
- [Deployment](deployment.md) — Provisioning, `Q_PASSWORD` setup, Fly.io config
- [Agent Configuration](agent-config.md) — SDK invocation and `env` override
- [Data Flow](data-flow.md) — Chat streaming and `auth_error` event type
