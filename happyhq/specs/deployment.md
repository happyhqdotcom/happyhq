# Deployment

How Q gets from a local dev environment into early testers' hands.

## Purpose

Define how Q is deployed for early testing. Q's "files over apps" architecture means everything lives on the filesystem — no database, no static hosting. Each tester gets their own isolated instance with a persistent filesystem, simple password protection, and a URL they can open in a browser.

This is the "do things that don't scale" phase. No accounts, no multi-tenancy, no login system. One instance per person, provisioned manually, torn down when no longer needed.

## Platform

**Fly.io Machines.** Each user gets one Machine + one persistent Volume.

A Fly Machine is a lightweight container that runs the Q Docker image. A Fly Volume is a persistent disk attached to that machine. Together, they provide the compute + filesystem Q needs.

### Auto-stop/start

Machines stop automatically after an idle period (no incoming HTTP requests). When a new request arrives, Fly's proxy holds the connection, starts the machine (~2-5 second cold start), and forwards the request. Once running, the machine stays running as long as there's activity. No interruptions mid-session — the cold start only happens on the first request after an idle period.

### Persistence

Volumes survive machine stops, restarts, and redeployments. The volume is mounted at `/data`. The app reads `HAPPYHQ_ROOT` from the environment, so `HAPPYHQ_ROOT=/data/happyhq` creates a subdirectory inside the volume mount — keeping ext4 filesystem artifacts (like `lost+found`) outside the app's data directory.

### HTTPS

Automatic via `*.fly.dev` subdomains. Each instance gets a URL like `https://your-app.fly.dev`. Custom domains can be added later if needed.

### SSH & Debugging

Full shell access to any instance:

```
fly ssh console -a your-app              # interactive shell
fly ssh console -a your-app -C "ls /data/happyhq"  # one-off command
fly logs -a your-app                     # tail logs
fly machine status -a your-app           # check if running/stopped
```

This preserves the debugging workflow — SSH in, inspect files, check run state, poke around.

### Cost

Machine size: `shared-cpu-1x` with 1GB memory — $0.0079/hr ($5.70/month if running 24/7). With auto-stop, a machine that runs ~1 hour/day costs roughly $0.25/month in compute. Volume storage is $0.15/GB/month. Total: ~$2-3/month per user with typical usage, well under $5/month.

## Containerization

Multi-stage Dockerfile in `happyhq/`, built from the monorepo root.

### Build context

The Docker build context is the monorepo root (not `happyhq/`) because pnpm uses a single lockfile at the root. Only `happyhq/` source is copied into the image — other workspaces (e.g. `docs/`) are excluded via `.dockerignore`.

Build command: `docker build -f happyhq/Dockerfile .` from repo root.

### Image layers

1. **Base**: Node.js 20 Alpine + system dependencies (git)
2. **Dependencies**: `pnpm install --frozen-lockfile` using root workspace files
3. **Build**: `cd app && pnpm build` (runs `next build` directly, bypassing turbo) with `output: 'standalone'` in next.config.ts
4. **Runtime**: Standalone `server.js` + static assets + `prompts/` and `q/` directories

### Runtime files

The app loads prompt templates and seed files via `process.cwd()` at runtime:

- `prompts/*.md` — Agent system prompts (learning, planning, working, craft)
- `q/` — Q memory seed files (specs, samples)

These must be copied into the runtime image at the working directory alongside `server.js`.

### Code changes for containerization

**`lib/constants.server.ts`** — `HAPPYHQ_ROOT` reads from `process.env.HAPPYHQ_ROOT` with fallback to `~/HappyHQ`.

**`next.config.ts`** — Includes `output: 'standalone'`. Produces a self-contained server that doesn't need `node_modules`.

**`app/api/fs/reveal/route.ts`** — Guards the macOS-only `open -R` call. On non-macOS platforms (Linux in Docker), returns 501 instead of crashing.

## Password Protection

Next.js middleware + cookie-based session. No accounts, no usernames, no OAuth.

### How it works

1. `Q_PASSWORD` env var set per instance during provisioning
2. Middleware intercepts all requests
3. If no valid `q-auth` cookie → redirect to `/login`
4. `/login` page: single password field, no username
5. On correct password → set signed cookie (HMAC of password, not plaintext)
6. Subsequent requests pass through (cookie is valid)

### Local dev unchanged

If `Q_PASSWORD` is not set, middleware does nothing. Local development is completely unaffected.

### Files

- `middleware.ts` — Route interception, cookie check, redirect logic
- `app/login/page.tsx` — Minimal password form
- `app/login/actions.ts` — Server action to validate password and set cookie

## API Key Management

Three methods, user-initiated via the setup screen. An `ANTHROPIC_API_KEY` env var is also respected at runtime if set manually, but is not part of the provisioning flow.

### Method 1: Claude OAuth via setup screen (primary)

Users authenticate with their own Claude account from inside Q's UI. The setup screen initiates a custom OAuth 2.0 + PKCE flow against `claude.ai/oauth/authorize` (the same provider the Claude Code CLI uses). The user clicks the OAuth link, authenticates on claude.ai, and copies a code from the callback page back into Q's setup screen. The server exchanges the code for an access token and stores it.

**Why custom OAuth instead of `claude auth login`**: The CLI's `claude auth login` command requires a TTY (it uses Ink for terminal UI). It does not work in Docker containers with piped stdio. The custom OAuth flow replicates the same PKCE exchange the CLI performs, using the same client ID and endpoints, but without needing a terminal.

**How it works**:

1. Server generates a PKCE code_verifier + code_challenge (S256) and a random state
2. Server constructs the OAuth URL and returns it to the frontend along with a session ID
3. User opens the URL, authenticates on claude.ai, and sees a code on the callback page
4. User copies the code (format: `authorizationCode#state`) and pastes it into Q
5. Server splits on `#`, exchanges the authorization code at `platform.claude.com/v1/oauth/token` with the code_verifier
6. Server stores the resulting access token in `.q/config.json` on the persistent volume
7. At runtime, `getAuthEnv()` sets `CLAUDE_CODE_OAUTH_TOKEN` for the SDK

**Credential persistence**: The OAuth token is stored in `/data/happyhq/.q/config.json` on the persistent volume. It survives machine stops and restarts. It is lost if the volume is destroyed. Token expiry depends on Anthropic's OAuth server — users may need to re-authenticate periodically.

### Method 2: API key via setup screen (fallback)

Users paste their `ANTHROPIC_API_KEY` into a text input on the setup screen. The key is stored server-side in `/data/happyhq/.q/config.json` (on the persistent volume). Passed to the SDK at runtime via the `env` override in `query()` options.

### Method 3: Environment variable (operator override)

If `ANTHROPIC_API_KEY` is set in the environment (e.g., via `fly secrets set`), the SDK uses it automatically. This is not part of the standard provisioning flow — it exists as an operator escape hatch for debugging or pre-configured instances.

### Setup screen

Full-page layout matching the login page style. Shown when no auth is configured (no stored OAuth token, no `ANTHROPIC_API_KEY` env var, no stored API key). Two options:

1. **"Sign in with Claude"** — initiates custom OAuth PKCE flow, shows link + code input field
2. **"Use an API key"** — text input, stores server-side (no validation against Anthropic API — invalid keys fail at SDK query time)

The home page checks auth status on mount (`GET /api/auth/status`). If `deployed && !authenticated`, redirects to `/setup`. The middleware matcher excludes `/setup` (alongside `/login`) so that password-authenticated users can reach the setup page without a redirect loop. The password middleware remains the security gate; the auth status check is a UX redirect.

In local dev (no `Q_PASSWORD`), the setup screen is not shown — local dev uses `.env.local` for the API key.

### API endpoints

- `GET /api/auth/status` — checks for stored OAuth token, `ANTHROPIC_API_KEY` env var, stored API key, or `claude auth status`. Returns `{ authenticated, method?, email?, deployed }`. The `deployed` flag (`true` when `Q_PASSWORD` is set) lets the client distinguish deployed instances from local dev.
- `POST /api/auth/login` — generates PKCE code_verifier + code_challenge, constructs OAuth URL. Returns `{ url, sessionId }`. Stores PKCE state in a process-level session map (5-minute TTL).
- `POST /api/auth/login/code` — accepts `{ sessionId, code }`. Splits `code` on `#` to extract authorization code and state. Exchanges the code for an access token at Anthropic's token endpoint. Stores the token in `.q/config.json`.
- `POST /api/auth/api-key` — accepts `{ key }`, stores in config file.

### Runtime auth helper

`lib/agents/auth.server.ts` — determines which credentials to pass to the SDK:

1. `ANTHROPIC_API_KEY` env var is set → return undefined (SDK reads from env)
2. Stored OAuth token in config → return env with `CLAUDE_CODE_OAUTH_TOKEN` set
3. Stored API key in config → return env with `ANTHROPIC_API_KEY` set
4. Neither → return undefined (SDK tries `claude login` credentials as last resort)

Each agent options factory (`learningAgentOptions`, `planningAgentOptions`, `workingAgentOptions`) passes this via the `env` option.

### Files

- `app/api/auth/status/route.ts` — Auth status check
- `app/api/auth/login/route.ts` — OAuth PKCE URL generation
- `app/api/auth/login/code/route.ts` — OAuth code exchange + token storage
- `app/api/auth/api-key/route.ts` — API key storage
- `app/setup/page.tsx` — Setup screen (three views: choice, oauth, apikey)
- `lib/agents/auth.server.ts` — Runtime auth helper (`getAuthEnv`, `storeApiKey`, `storeOAuthToken`, `checkAuthStatus`)
- `lib/auth/oauth-sessions.ts` — Process-level PKCE session store
- `lib/agents/config.server.ts` — Pass runtime env to SDK via `env` option on all three factories
- `components/features/launch/launch-router.tsx` — Auth status check + redirect to `/setup`

## Provisioning

Shell script: `scripts/provision.sh <username> <password>`

### What it does

```bash
# 1. Create a Fly app for this user
fly apps create q-<username>

# 2. Create a 1GB persistent volume in the chosen region
fly volumes create happyhq_data --app q-<username> --size 1 --region ord

# 3. Set environment variables (secrets are encrypted at rest)
# No API key — user authenticates via setup screen on first visit
fly secrets set \
  Q_PASSWORD=<password> \
  HAPPYHQ_ROOT=/data/happyhq \
  --app q-<username>

# 4. Build and deploy the Docker image
fly deploy -c app/fly.toml --dockerfile app/Dockerfile --app q-<username>

# Output: https://q-<username>.fly.dev
```

After the initial provision, use `scripts/deploy-all.sh` to push updates to all instances at once (see Deploy Updates below).

### First boot is self-provisioning

On first boot, `instrumentation.ts` handles setup automatically:

- `initializeGitRepo()` — creates `/data/happyhq/`, runs `git init`, writes `.gitignore`, configures git author
- `seedQMemory()` — seeds `.q/specs/` and `.q/samples/` with framework files

No manual seeding required. The user hits their URL, enters the password, and starts using Q.

### Pre-loading content (optional)

To pre-load a specific stream for a user (e.g., a demo playbook), use the seed script after provisioning:

```bash
bash app/scripts/seed-stream.sh <username> <stream-name>
```

This copies `~/HappyHQ/<stream-name>/` from the operator's local machine into `/data/happyhq/<stream-name>/` on the target VM via `fly ssh`. The stream appears immediately — no restart required.

### Teardown

`scripts/deprovision.sh <username>` → `fly apps destroy q-<username> --yes`

Destroys the machine, volume, and all data. Irreversible.

## Machine Config (fly.toml)

```toml
[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0

[mounts]
  source = "happyhq_data"
  destination = "/data"

[[vm]]
  size = "shared-cpu-1x"
  memory = "1gb"
```

- `auto_stop_machines = "stop"` — stops machine after idle period (saves cost)
- `auto_start_machines = true` — wakes on incoming request
- `min_machines_running = 0` — allows full stop when idle
- Volume mounted at `/data`; `HAPPYHQ_ROOT=/data/happyhq` is a subdirectory within the mount
- 1GB memory — safe margin for Next.js + streaming agent sessions

Deploy command: `fly deploy -c app/fly.toml --dockerfile app/Dockerfile --app q-<username>` from repo root.

### Deploy Updates

Single instance: `fly deploy -c app/fly.toml --dockerfile app/Dockerfile --app q-<username>` from repo root.

All instances: `bash app/scripts/deploy-all.sh` from repo root. The script auto-discovers all `q-*` apps in the `happyhq` org via `fly apps list` and deploys the current checkout to each. No hardcoded usernames — new instances are picked up automatically.

## Design Decisions

**Fly.io over Render/Railway.** Fly is the only option with auto-stop, which makes per-user cost negligible for early testing. Render and Railway are always-on (~$7-10/month per user). For 5-10 testers, this difference compounds.

**One machine per user, not multi-tenant.** Simplest isolation model. No shared state, no resource contention, no noisy neighbors. Each user's filesystem, process state, and agent sessions are completely independent. This is intentionally unscalable — we'll build multi-tenancy later.

**Password middleware, not HTTP Basic Auth.** Basic Auth produces an ugly browser-native prompt. A simple login page feels more like a real app, even though it's equally simple under the hood.

**Cookie-based sessions, not JWTs.** A signed cookie is sufficient for single-password auth. No token expiry, no refresh logic, no client-side storage. The cookie is HttpOnly and Secure.

**HAPPYHQ_ROOT from environment, not a config file.** Environment variables are the standard for container configuration. The fallback to `~/HappyHQ` preserves local dev behavior.

**Standalone Next.js output.** Required for Docker — produces a self-contained `server.js` that doesn't need `node_modules`. Smaller image, faster builds, no monorepo complexity at runtime.

**Monorepo root as Docker build context.** pnpm uses a single lockfile at the root. Building from `app/` alone would require copying the lockfile — building from root is simpler and idiomatic for pnpm workspaces.

## Health Checks

Fly's proxy needs to know the machine is healthy before routing traffic. The default behavior for `[http_service]` is a TCP check (is the port open?). No explicit HTTP health check is configured.

**Risk**: If Fly performs HTTP-level checks, hitting `/` returns a 302 redirect to `/login` when auth is enabled. Some proxies treat non-2xx responses as unhealthy.

**Mitigation**: Validate during deployment testing (D5.2/D5.3) that Fly correctly routes traffic with the default TCP check. If health checks fail, add a `/api/health` route excluded from auth middleware and configure an explicit check in `fly.toml`:

```toml
[checks]
  [checks.health]
    type = "http"
    port = 3000
    path = "/api/health"
    interval = "30s"
    timeout = "5s"
```

## Edge Cases

- **Machine stops mid-session**: Fly auto-stop only triggers on zero HTTP requests. An active browser session generates periodic SWR polls, keeping the machine alive. If the user closes their browser, the machine stops after the idle timeout — next visit wakes it up, data intact.
- **Volume full**: 1GB is generous for text files and markdown. If a stream generates many large outputs, we can resize: `fly volumes extend happyhq_data --size 5 --app q-<username>`.
- **Deploy overwrites running state**: Fly deploys create a new machine and swap. The volume remounts to the new machine. In-flight agent sessions will be interrupted — the user would need to restart the run. Acceptable for early testing.
- **Cold start with pending agent run**: If a machine stops while a run is in progress, `.run.json` will show the run as active but no loop is running. The user would need to stop and restart the run. Could add a startup check later.
- **Multiple browser tabs**: Module-level state enforces one active run at a time. Multiple tabs from the same user work fine — they all see the same stream state via SWR.

## Constraints

- One user per machine. No multi-tenancy.
- Manual provisioning. No self-service signup.
- No custom domains initially. `*.fly.dev` subdomains only.
- No CI/CD. Deploy is manual — `fly deploy` for a single instance, or `bash app/scripts/deploy-all.sh` to push to all instances.
- No backups. Volume data is not backed up. Git history on the volume provides some protection.
- Fly.io account required for the team (not for testers).

## Acceptance Criteria

- [x] `HAPPYHQ_ROOT` reads from `process.env.HAPPYHQ_ROOT` with fallback to `~/HappyHQ`
- [x] `next.config.ts` includes `output: 'standalone'`
- [x] Reveal route returns 501 on non-macOS platforms
- [ ] Dockerfile builds successfully and produces a working image
- [x] `fly.toml` configures auto-stop, volume mount, and HTTPS
- [x] Password middleware blocks unauthenticated access when `Q_PASSWORD` is set
- [x] Password middleware is inactive when `Q_PASSWORD` is not set (local dev)
- [x] Login page accepts password and sets cookie
- [x] Claude Code CLI installed in Docker image
- [x] Setup screen shows when no auth configured (claude login + API key options)
- [x] Claude OAuth sign-in flow works end-to-end from setup screen
- [x] API key fallback works (enter key, stored, SDK uses it)
- [x] Auth status endpoint correctly detects all three auth methods
- [x] Home page redirects to `/setup` when no auth configured
- [x] Setup screen not shown in local dev (no `Q_PASSWORD`)
- [ ] Health checks pass with auth enabled (validate during deployment testing)
- [ ] `provision.sh` creates a working Fly instance accessible via HTTPS
- [x] `provision.sh` does not require or set `ANTHROPIC_API_KEY` (user authenticates via setup screen)
- [ ] Data persists across machine stop/start cycles
- [ ] SSH access works via `fly ssh console`
