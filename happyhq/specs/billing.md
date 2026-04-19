# Billing

How Q handles pricing, subscriptions, usage tracking, and payment processing.

## Purpose

Define Q's billing system: bundled tier subscriptions via Stripe, runtime-based usage metering via InstantDB, and hard enforcement of tier limits. This spec covers pricing, payments, usage tracking, limit enforcement, and the upgrade flow.

For user identity and login (InstantDB auth, magic codes, Google OAuth), see [Accounts](accounts.md). Billing depends on accounts — `BILLING_ENABLED` requires `ACCOUNTS_ENABLED`.

Billing is an **EE (Enterprise Edition)** feature. The open-source Community Edition runs without billing, usage tracking, or InstantDB. See [Licensing](#licensing--open-source) for details.

For deployment concerns (Fly.io, Docker), see [Deployment](deployment.md). For current auth (password gate, Anthropic credentials), see [Auth](auth.md).

## Pricing Model

We're pricing work, not software. The mental model is closer to paying a contractor ($15/hr) than a SaaS seat. The hosted version bundles AI costs into the price.

### Tiers

| Tier    | Monthly | Runtime       | Storage | Users     |
| ------- | ------- | ------------- | ------- | --------- |
| Free    | $0      | 5 minutes     | 100 MB  | 1         |
| Starter | $30     | 2 hrs         | 1 GB    | 1–3       |
| Pro     | $100    | 6 hrs 40 min  | 10 GB   | Up to 20  |
| Max     | $500    | 33 hrs 20 min | 100 GB  | Unlimited |

No automatic overage. When a user exhausts their included hours, tasks are blocked until they upgrade to a higher tier (or in the future, purchase add-on hour bundles).

### Free Tier Guardrails

Free users can:

- Create 1 Stream
- Add up to 3 Samples
- Build a Playbook and 1 Spec
- Run up to 5 minutes of total runtime

All enforced as hard limits with clear upgrade messaging.

## Architecture

```
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Fly.io VM    │  │ Local Mac    │  │ Electron App │
│ (web app)    │  │ (paid or     │  │ (desktop)    │
│              │  │  self-hosted)│  │              │
└──┬───────┬───┘  └──┬───────┬───┘  └──┬───────┬───┘
   │       │         │       │         │       │
   │       └─────────┼───────┴─────────┼───────┘
   │                 │                 │
   │          ┌──────▼──────┐  ┌──────▼──────┐
   │          │ InstantDB   │  │ Stripe      │
   │          │ - Auth      │  │ - Payments  │
   │          │ - Users     │  │ - Subs      │
   │          │ - Usage     │  │ - Checkout  │
   │          │ - Billing   │  │ - Portal    │
   │          │   state     │  │ - Webhooks  │
   │          └─────────────┘  └─────────────┘
   │
   │  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
   │    Cloudflare AI Gateway
   │  │ (for local/Electron paid accounts)        │
   │    - API key injection (configured in CF)
   │  │ - Auth + usage checks (approach TBD)       │
   │    - Caching, rate limiting, analytics
   │  │ - Forwards to api.anthropic.com            │
   │   ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
   │                 ▲
   │                 │ Local Mac / Electron
   │                 │ (ANTHROPIC_BASE_URL)
   │                 │
   ▼                 │
┌────────────────────┴────┐
│ Anthropic API           │
│ api.anthropic.com       │
└─────────────────────────┘

Fly.io calls Anthropic directly (key is a server env var).
Local/Electron route through Cloudflare AI Gateway.
Self-hosted calls Anthropic directly with user's own key.
```

### Separation of Concerns

- **InstantDB**: User identity, subscription state, usage tracking, billing metadata. Central DB shared across all deployment targets (Fly.io, local, Electron, future cloud). Built-in auth (magic codes, Google OAuth) eliminates the need for a custom auth system.
- **Stripe**: Payment processing, subscription lifecycle, invoicing, customer portal. Source of truth for "what has been paid." Webhooks push subscription state changes to InstantDB.
- **Cloudflare AI Gateway**: Sits between the user's app and Anthropic for local Mac and Electron paid accounts. Handles API key injection (key configured in Cloudflare dashboard), response caching, rate limiting, and analytics. Auth and per-user usage checks TBD — ideally handled within the gateway to avoid an extra hop.
- **Local filesystem** (`~/HappyHQ/`): Work files, streams, tasks, samples. Unchanged by billing.

### API Key Delivery

Paid accounts use our Anthropic API key. How that key reaches the SDK depends on where the agent runs:

| Scenario         | Agent runs on  | API key delivery                                                  |
| ---------------- | -------------- | ----------------------------------------------------------------- |
| Fly.io / Cloud   | Our server     | Server env var (`ANTHROPIC_API_KEY`) — key never leaves our infra |
| Local Mac (paid) | User's machine | API proxy — key injected server-side, never on the user's machine |
| Electron (paid)  | User's machine | API proxy — same as local Mac                                     |
| Self-hosted      | User's machine | User's own key — no proxy needed                                  |

**How the proxy works:** The Claude Agent SDK and underlying CLI support `ANTHROPIC_BASE_URL` as an environment variable. For paid accounts, the app sets this to the Cloudflare AI Gateway endpoint via the SDK's `env` option — the same mechanism already used by `getAuthEnv()` in `lib/agents/auth.server.ts`.

**Cloudflare AI Gateway** handles API key injection and forwarding to Anthropic. It also provides response caching, rate limiting, and analytics for free. The Anthropic API key is configured in the Cloudflare dashboard — it never appears in our codebase or on the user's machine.

What still needs investigation: can Cloudflare AI Gateway handle our auth and usage checks (validating session tokens, enforcing per-user billing limits) natively, or do we need a thin Cloudflare Worker in front of it? Ideally we want a single hop (user → AI Gateway → Anthropic), not two (user → Worker → AI Gateway → Anthropic). This depends on whether the gateway supports custom auth middleware or per-user rate limiting keyed off a custom header.

Fly.io / Cloud instances do not use the gateway — they call Anthropic directly with the API key from the server env var. The gateway is only for cases where the agent runs on the user's machine (local Mac, Electron).

### Why InstantDB

- **Built-in auth**: Magic codes and Google OAuth out of the box. No custom auth system to build.
- **Works everywhere**: Client SDK runs in browser, Node.js, and Electron. Same code, same DB, regardless of deployment target.
- **Real-time**: Usage counters update across clients instantly. Dashboard reflects task progress live.
- **One DB for all surfaces**: Local app, Fly.io hosted, Electron desktop, future cloud — all talk to the same InstantDB instance.

### Data Flow

1. User logs in via InstantDB auth (magic code or Google OAuth)
2. On first upgrade (not first login), a Stripe customer is created and the ID is stored in InstantDB
3. User subscribes via Stripe Checkout → webhook updates InstantDB with tier and subscription info
4. Task runs → SDK calls route through Cloudflare AI Gateway (local/Electron) or direct to Anthropic (Fly.io) → usage tracked in InstantDB in real-time
5. Task completes → usage finalized in InstantDB

## InstantDB Schema

Extends the `users` table from [Accounts](accounts.md) with billing fields.

```
$users (built-in InstantDB users table, extended here)
  + stripeCustomerId: string (optional, added when user first upgrades)

subscriptions
  - stripeSubscriptionId: string
  - tier: "free" | "starter" | "pro" | "max"
  - status: "active" | "past_due" | "canceled"
  - currentPeriodStart: date
  - currentPeriodEnd: date

usage
  - periodStart: date
  - periodEnd: date
  - usedMinutes: number
  - includedMinutes: number (denormalized from tier for fast checks)

taskRuns
  - stream: string
  - task: string
  - startedAt: date
  - endedAt: date (optional)
  - minutes: number
  - status: "running" | "completed" | "aborted" | "failed"

Links (defined in schema.ts via i.schema({ links: {} })):
  userSubscriptions:
    forward: { on: 'subscriptions', has: 'one', label: 'user' }
    reverse: { on: '$users', has: 'many', label: 'subscriptions' }
  userUsage:
    forward: { on: 'usage', has: 'one', label: 'user' }
    reverse: { on: '$users', has: 'many', label: 'usage' }
  usageTaskRuns:
    forward: { on: 'taskRuns', has: 'one', label: 'usagePeriod' }
    reverse: { on: 'usage', has: 'many', label: 'taskRuns' }

Note: $users must always be on the reverse side per InstantDB requirement.
The forward side is the entity that belongs to one user/parent.
```

All billing entities live in `lib/accounts/schema.ts` (the shared schema file), not in `ee/`. This is intentional — the schema is shared infrastructure that must be importable by both client and admin SDKs. EE code reads/writes to these tables; the schema just declares they exist.

## Auth

Billing requires user identity via [Accounts](accounts.md). The accounts spec defines InstantDB auth (magic code, Google OAuth, sessions). Billing adds Stripe-specific behavior on top:

- **On first upgrade**: Create a Stripe customer, store `stripeCustomerId` in InstantDB `users` table
- **No Stripe customer for free users**: Free users exist only in InstantDB. Stripe customer is created only when the user initiates an upgrade.

### First-Time Billing Flow

1. User signs up via accounts (magic code or Google OAuth) → free tier assigned
2. User starts building streams, uploading samples, chatting with Q
3. Payment only surfaces when they hit a free tier limit ("Upgrade to keep going")
4. User clicks "Upgrade" → Stripe customer created → Checkout flow → subscription active

## Stripe Integration

### Products and Prices

- Product: "Q"
- 4 subscription prices: Free ($0/mo), Starter ($30/mo), Pro ($100/mo), Max ($500/mo)
- No metered overage in v0. Users upgrade tiers to get more hours. Future: add-on hour bundles.

### Webhooks

| Event                           | Action                                                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `checkout.session.completed`    | Write subscription to InstantDB and create initial usage period                                                     |
| `customer.subscription.updated` | Update tier in InstantDB                                                                                            |
| `customer.subscription.deleted` | Set status to `canceled` in InstantDB                                                                               |
| `invoice.paid`                  | Create new usage period if one doesn't already exist for this billing cycle (deduplicates against checkout handler) |
| `invoice.payment_failed`        | Flag subscription status as `past_due`                                                                              |

Webhooks are handled by the Cloudflare billing worker (`workers/billing/`), not the Next.js app. Stripe sends events to the worker's `/webhook/stripe` endpoint. The worker verifies the signature, processes the event, and writes to InstantDB. The app reads billing state reactively from InstantDB — it never receives webhooks directly.

**Upgrade behavior:** When a free user upgrades, `checkout.session.completed` closes the existing free-tier usage period (`periodEnd = now - 1`) and creates a fresh paid period with `usedMinutes: 0` and the new tier's `includedMinutes`. Free-tier usage does not carry over — the user gets a clean slate. Period dates use the Stripe subscription's actual `current_period_end` to stay aligned with future `invoice.paid` webhooks.

**Webhook race condition:** `checkout.session.completed` and `invoice.paid` fire near-simultaneously after checkout. `checkout.session.completed` owns initial usage period creation. `invoice.paid` checks for an existing current-period record before creating, preventing duplicates.

### Cancellation

Cancellation uses `stripe.subscriptions.update({ cancel_at_period_end: true })`, never `stripe.subscriptions.cancel()` (which terminates immediately with a prorated refund). The user retains paid access until their billing period ends. Stripe fires `customer.subscription.deleted` at period end — the webhook handler updates status to `canceled` in InstantDB. No immediate DB update is needed on the cancel action itself.

## Usage Tracking

Runtime is the primary billing lever. Tracked in InstantDB for real-time access across all clients.

### How Runtime Is Measured

- `runLoop()` starts → `startTaskRun()` creates a `taskRun` record in InstantDB with `status: "running"`, linked to the current `usage` period via `usagePeriod`
- Each working loop iteration → `updateUsage()` increments `usedMinutes` on the `usage` record by the iteration duration
- Budget enforcement → `canStartTask()` returns `remainingMinutes`, converted to USD (`remainingMinutes * LLM_COST_PER_MINUTE_USD`) and passed as `maxBudgetUsd` to the SDK's `query()`. When the budget is exhausted, the SDK returns `error_max_budget_usd` and the loop writes `status: 'stopped'` with `stopReason: 'budget'` and `stoppedDuring` indicating the active phase
- Run completes → `finalizeTaskRun()` writes `endedAt`, final `minutes`, and status (`completed` or `aborted`)
- Both planning and working time count toward the total duration recorded in `finalizeTaskRun()`. Per-iteration `updateUsage()` calls only occur during working iterations; planning time is captured in the final total

### Free-Tier Usage Bootstrapping

Free-tier users never go through Stripe checkout, so no webhook creates their usage period. `getCurrentUsage()` lazily creates a free-tier usage period (5 min included, 30-day window) on first access when no current period exists and the user has no active subscription. This ensures free-tier task runs are tracked and limits are enforced from the first interaction.

### Limit Enforcement

Limits are hard. Tasks are blocked or aborted when usage is exhausted.

**Pre-task check** (`canStartTask()`):

- Read `usage.usedMinutes` vs `usage.includedMinutes` from InstantDB
- If over limit → block task, show upgrade prompt
- If close to limit (<5 min remaining) → warn user, allow task to start

**Mid-run budget enforcement** (via SDK):

- Before each run phase starts, `canStartTask()` returns `remainingMinutes`
- Converted to USD (`remainingMinutes * LLM_COST_PER_MINUTE_USD`) and passed as `maxBudgetUsd` to the SDK's `query()` call
- When the SDK exhausts the budget, it returns `error_max_budget_usd` → the loop writes `status: 'stopped'` with `stopReason: 'budget'` and `stoppedDuring: 'planning' | 'working'` to `.run.json`
- The task is resumable — the user can click Continue to resume from iteration N+1 without clearing `working/` or `outputs/`. `plan.md` stays intact.
- Both planning and working phases can be stopped by billing limits

**Stripe reporting**:

- No metered overage billing in v0 — usage is tracked in InstantDB only
- Stripe usage meters may be added later for add-on hour bundles

### Other Limits

- **Storage**: Not enforced in v0. Tier limits are defined (`storageBytes` in plans.ts) but no check function exists yet. Future: total size of `~/HappyHQ/` checked against tier limit with soft enforcement (warn but don't block).
- **Streams**: Count of stream directories checked against tier limit (free = 1). Hard enforcement on stream creation.
- **Samples**: Count per stream checked against tier limit (free = 3). Hard enforcement on upload.
- **Specs**: Count per stream checked against tier limit (free = 1). Hard enforcement on spec creation.

### Failed Runs

Failed runs count against usage. AI costs are incurred regardless of outcome.

## Billing UI

### Settings > Billing

Current plan display, usage meter (visual bar showing hours used vs remaining), manage subscription button (opens Stripe Customer Portal), upgrade button.

### Upgrade Flow

1. User hits limit → sees upgrade prompt in the Island
2. Clicks "Upgrade" → redirected to Stripe Checkout (pre-filled email from InstantDB)
3. Completes payment → Stripe webhook fires → InstantDB updated
4. User redirected back to Q → limit check passes → they continue

### Usage Indicator

`UsageIndicator` component in the sidebar account footer dropdown. Shows remaining time as compact text (e.g., "42m left", "2h 15m left", "No runtime left"). Color-coded: muted (>50% remaining), amber (25–50%), red (<25% or exhausted). Updates in real-time via `db.useQuery()` on usage and subscription records. The `useBillingData()` hook (in `usage-indicator.tsx`) provides the shared data source.

`TierBadge` shows the capitalized tier name (e.g., "Starter") in the dropdown.

### Limit Reached

When `canStartTask()` returns false (403 with `{ upgrade: true }`), `LimitReachedOverlay` appears in the Dynamic Island as an expanded shell with:

- "You've used all your included runtime"
- "Upgrade your plan to keep running tasks."
- "Upgrade plan" button → POST `/api/billing/checkout` with `tier: 'starter'` → Stripe Checkout redirect

The `upgradeNeeded` flag flows from `useRunActions()` through the desktop store to `DynamicIsland`.

### Mid-Run Budget Stop

When a task is stopped mid-run due to billing limits (`stopped` status with `stopReason: 'budget'` in `.run.json`), the UI shows phase-specific messaging based on `stoppedDuring`:

- `stoppedDuring: 'planning'` → "Planning paused" with Continue button in the plan section
- `stoppedDuring: 'working'` → "Working paused" with Continue button in the work section

The Continue button is disabled when `remainingMinutes <= 0` or `upgradeNeeded` is true — the user must upgrade before resuming. Resuming continues from where the run left off without clearing files. Budget stops auto-resume (no explicit `resume` flag needed).

### Pre-Run Billing Block

When `canStartTask()` blocks working start after plan approval (the user approved but has no remaining minutes):

- The route commits "Plan accepted" immediately (via `commitGitState()`)
- Writes `status: 'stopped'` with `stoppedDuring: 'working'` and `stopReason: 'budget'` to `.run.json`
- Returns 403 with `{ upgrade: true }`
- The UI shows a Continue button instead of re-showing plan approval
- When the user upgrades and clicks Continue, `POST /api/run/start` with `mode: 'working'` resumes from the stopped state, skipping file clearing

### Low Balance Warning

When `canStartTask()` returns `{ allowed: true, warning: 'low_balance', remainingMinutes }`, a non-blocking `LowBalanceWarning` banner appears above the island (amber pill: "3m of runtime left" or "Less than 1 minute of runtime left"). Shown both in idle state and during active runs.

### Free Tier Object Limits

When `createStream` or `uploadFile` server actions throw billing limit errors (e.g., "Free plan allows 1 stream. Upgrade to create more."), the error message surfaces as:

- Inline text in `NameInputDialog` (sidebar stream/task rename dialogs)
- Toast notification via `sonner` in the home composer

## Licensing & Open Source

HappyHQ is the product. It's open source (MIT or similar) — streams, tasks, learning, planning, working. BYO API key, run locally or self-host. No billing, no usage tracking, no InstantDB required.

**EE** is a commercial add-on layer (source-available, separate license) that adds: billing, subscriptions, payment processing (Stripe), usage metering and enforcement, auth via InstantDB (magic code, Google OAuth), multi-user workspaces, and any future paid features (integrations, concurrency, etc.).

### Code Organization

- EE code lives in a dedicated directory (e.g., `ee/` within the app)
- Accounts are core (`lib/accounts/`), not EE — billing imports from accounts, never the reverse
- The core app never imports from EE — it runs fully without it
- `BILLING_ENABLED` env var activates EE features (server-side); `NEXT_PUBLIC_BILLING_ENABLED` for client-side gating
- EE license allows source visibility (users can read the code) but restricts redistribution and commercial use

### Documentation

- Root `README.md` should note the open source / EE split
- `LICENSE` at repo root for the open source product
- `ee/LICENSE` for EE terms
- Contributing guide should clarify which features go where

## Environment Variables

| Variable                      | Required                 | Description                                                                         |
| ----------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `BILLING_ENABLED`             | No                       | Set to `true` to activate EE billing features. When unset, app runs as open source. |
| `NEXT_PUBLIC_BILLING_ENABLED` | When EE                  | Client-side variant (needed by sidebar footer, billing UI components)               |
| `INSTANT_APP_ID`              | When EE                  | InstantDB application ID (server-side, admin SDK)                                   |
| `INSTANT_APP_ADMIN_TOKEN`     | When EE                  | InstantDB admin token for server-side operations                                    |
| `STRIPE_SECRET_KEY`           | When EE                  | Stripe server-side API key                                                          |
| `STRIPE_PUBLISHABLE_KEY`      | When EE                  | Stripe client-side key (kept for reference; Checkout uses customer ID server-side)  |
| `STRIPE_PRICE_ID_STARTER`     | When EE                  | Stripe price ID for Starter tier                                                    |
| `STRIPE_PRICE_ID_PRO`         | When EE                  | Stripe price ID for Pro tier                                                        |
| `STRIPE_PRICE_ID_MAX`         | When EE                  | Stripe price ID for Max tier                                                        |
| `CLOUDFLARE_AI_GATEWAY_URL`   | When EE + local/Electron | AI Gateway endpoint for API key delivery                                            |
| `NEXT_PUBLIC_APP_URL`         | Optional                 | App URL for Stripe Checkout redirect URLs (defaults to `http://localhost:3000`)     |

For local dev with billing, use Stripe test mode keys. Webhooks are handled by the separate private `billing` service repo (Cloudflare Worker) — clone that repo and run it locally with `pnpm dev`, then use `stripe listen --forward-to localhost:8787/webhook/stripe`.

## Files

| File                                                    | Role                                                                                                   |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ee/lib/billing/types.ts`                               | `TierName`, `TierLimits`, `Subscription`, `Usage`, `TaskRun`                                           |
| `ee/lib/billing/plans.ts`                               | Tier definitions (runtime, storage, users, object limits per tier)                                     |
| `ee/lib/billing/config.ts`                              | `isBillingEnabled()` — requires both BILLING_ENABLED + ACCOUNTS                                        |
| `ee/lib/billing/stripe.server.ts`                       | Stripe client, `getOrCreateStripeCustomer`, `cancelSubscription` (cancel-at-period-end, not immediate) |
| `ee/lib/billing/checkout.server.ts`                     | `createCheckoutSession()` with metadata for tier identification                                        |
| `ee/lib/billing/portal.server.ts`                       | `createPortalSession()` for Stripe Customer Portal                                                     |
| `ee/lib/billing/usage.server.ts`                        | `getCurrentUsage`, `startTaskRun`, `updateUsage`, `finalizeTaskRun`                                    |
| `ee/lib/billing/limits.server.ts`                       | `canStartTask`, `canCreateStream`, etc.                                                                |
| `app/api/billing/checkout/route.ts`                     | Create Stripe Checkout session (thin wrapper)                                                          |
| `app/api/billing/portal/route.ts`                       | Create Stripe Customer Portal session (thin wrapper)                                                   |
| `components/features/settings/billing-settings.tsx`     | Billing card in settings: plan, usage meter, manage/upgrade                                            |
| `components/features/sidebar/atoms/usage-indicator.tsx` | `UsageIndicator`, `TierBadge`, `useBillingData()` hook                                                 |
| `components/features/billing/upgrade-prompt.tsx`        | Reusable upgrade CTA (inline + overlay variants)                                                       |
| `components/features/billing/limit-reached.tsx`         | `LimitReachedOverlay`, `LowBalanceWarning`                                                             |

## Implementation Phases

### Phase 1: Billing Foundation (requires Accounts spec implemented first)

- Extend InstantDB schema with billing tables (subscriptions, usage, taskRuns)
- Add `stripeCustomerId` field to users table
- Add `BILLING_ENABLED` flag to gate all billing behavior
- Create Stripe customer on first upgrade (not on signup)

### Phase 2: Stripe + Subscriptions

- Set up Stripe products and prices
- Implement Checkout flow (upgrade from free)
- Implement Customer Portal (manage subscription)
- Build webhook handler → sync subscription state to InstantDB
- Add billing settings page

### Phase 3: Usage Tracking + Enforcement

- Instrument runtime tracking in planning and working modes
- Write usage to InstantDB in real-time
- Implement pre-task limit check and mid-run abort
- Report usage to Stripe meters for overage
- Add usage indicator and limit-reached UI

### Phase 4: Free Tier + Polish

- Implement free tier guardrails (stream, sample, spec, runtime limits)
- Storage tracking (soft limits for v0)
- Low balance warnings
- Billing emails (via Stripe)
- Grace periods for failed payments

## Acceptance Criteria

- [x] InstantDB schema extended with subscriptions, usage, and taskRuns tables
- [x] Stripe customer created on first upgrade, ID stored in InstantDB users table
- [x] Stripe Checkout flow: select tier → pay → subscription active in app
- [x] Stripe Customer Portal: manage/cancel subscription from billing settings
- [x] Stripe webhooks update subscription state in InstantDB
- [x] Runtime tracked during planning and working modes
- [x] Usage updated in InstantDB in real-time during task runs
- [x] Pre-task limit check blocks task start when usage exhausted (403 + upgrade:true)
- [x] Mid-run budget stop halts task gracefully when billing limit hit (stopped status with stopReason: 'budget')
- [x] Budget-stopped tasks are resumable via Continue button (no clearing of working dir/outputs)
- [x] Planning can also be stopped by billing limits (stoppedDuring: 'planning', stopReason: 'budget')
- [x] Pre-run billing block after plan approval writes stopped status with budget reason and commits "Plan accepted"
- [x] SDK budget-based enforcement via maxBudgetUsd replaces polling-based checkMidRunLimit()
- [x] Hitting limit blocks new tasks with upgrade prompt (LimitReachedOverlay in island)
- [x] Billing settings page shows current plan, usage meter, and management options
- [x] Usage indicator visible in sidebar account footer dropdown
- [x] Upgrade prompt shown when limit reached (blocking overlay + Stripe Checkout redirect)
- [x] Low balance warning shown as non-blocking banner when < 5 min remaining
- [x] Free tier guardrails enforced (1 stream, 3 samples, 1 spec, 5 min runtime)
- [x] `BILLING_ENABLED=false` runs the app without any billing gates or InstantDB
- [x] EE code isolated in `ee/` directory, core app uses dynamic imports only
- [ ] Storage limits enforced (deferred — tier limits defined but no check function yet)

## Testing

_To be defined during implementation._

## Open Questions

1. **Pricing validation**: Instrument runtime tracking early to validate $15/hr against real cost data before public launch
2. **InstantDB pricing**: Verify InstantDB's own pricing works at expected scale
3. **Concurrency limits**: Tier-gated — free=1, starter=2, pro=3, max=unlimited. Budget reservation on run start prevents double-spending across concurrent runs. See [Concurrency](concurrency.md)
4. **Annual pricing**: Not in v0, common for SaaS
5. **Self-hosted pro tier**: Open source is free — is there a paid self-hosted option? (Not v0)
6. **EE license terms**: Specific license text TBD
7. **Cloudflare AI Gateway auth**: Can the gateway handle per-user session validation and usage limit checks natively, or do we need a Cloudflare Worker in front of it? Single hop (user → gateway → Anthropic) is the goal.

## Cross-References

- [Accounts](accounts.md) — User identity layer (core, not EE). Billing depends on accounts for user auth (magic code, Google OAuth, sessions). `BILLING_ENABLED` requires `ACCOUNTS_ENABLED`. Account code lives in `lib/accounts/`.
- [Auth](auth.md) — Password gate and Anthropic credential management. `getAuthEnv()` is where `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` will be set for paid accounts on local/Electron.
- [Agent Configuration](agent-config.md) — SDK `env` option used to pass proxy config to Claude Code CLI
- [Deployment](deployment.md) — Fly.io provisioning, environment variables
- [Working](working.md) — Work loop where runtime metering and mid-run limit checks are injected
- [Planning](planning.md) — Planning mode where runtime metering is also injected
- [App Shell](app-shell.md) — Where usage indicator and upgrade prompts surface
- [Island](island.md) — Where limit-reached blocking UI appears
