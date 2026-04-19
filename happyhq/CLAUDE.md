## Commands

- `pnpm install` — install dependencies (run from repo root)
- `pnpm dev` — start dev server
- `pnpm build` — build the app
- `pnpm test` — run all unit tests for this package
- `pnpm test lib/run/loop.server.test.ts` — run a specific test file (path relative to `happyhq/`)
- `pnpm lint` — lint
- `pnpm check-types` — type-check
- `pnpm format` — format with Prettier (run from repo root)

**Important**: All commands above must be run from the `happyhq/` directory, not the repo root. From the repo root, use `pnpm --filter=happyhq test` to target this package specifically.

## Structure

- `app/` — Next.js App Router pages and layouts
- `components/` — React components
- `lib/` — Utilities and business logic
- `lib/database/` — InstantDB schema and SDK initialization
- `specs/` — Feature specifications

## Patterns

- Tailwind v4: config via CSS in `globals.css`, no tailwind.config
- `@/*` path alias maps to project root
- Vitest for unit tests, co-located next to source (e.g., `lib/fs/read.server.test.ts`)
- Use Testing Library for component tests, plain Vitest for utility tests
- Tests verify behavior and contracts, not implementation details. Test what the system guarantees — "missing files return null", "paths outside root are rejected" — not how it's built internally.

## Key Libraries

- SWR is the single source of truth for server data (streams, tasks, chats, desktop data)
- Zustand stores hold only client-only state (UI flags, run actions, activity steps) — no server data, no useEffect bridges
- `WorkspaceInitializer` in the layout warms the SWR cache; components read via `useSWR` hooks
- Page routes wrap panel content in `SWRConfig fallback` so data is available on first render (no flash)
- Server actions in `lib/actions.ts` for user mutations
- `@anthropic-ai/claude-agent-sdk` for agent orchestration (not Vercel AI SDK)

## Conventions

- `lib/fs/*.server.ts` for filesystem access — routes never import from `fs` directly
- `.server.ts` suffix = server-only modules
- API routes are thin wrappers over `lib/fs/` helpers (5-10 lines)
- After server action success, call `invalidateStream(streamSlug)` — filter-based invalidation that hits all active caches
- Errors: API routes return `{ error: string }` + HTTP status code
- Filesystem reads: return `null` for missing (ENOENT), throw for real errors
- Components use `error.status` to render empty state (404) vs error UI (500)

## React Patterns

- Prefer derived/computed values over `useEffect` + `setState` — if a value can be calculated from existing state or props, compute it inline during render
- Reserve `useEffect` for true side effects: DOM events, subscriptions, navigation, and DOM manipulation
- Never use `useEffect` to fetch data — use SWR (see Key Libraries)

## Database (InstantDB)

- Schema: `lib/database/schema.ts` (re-exported by root `instant.schema.ts` for CLI)
- Permissions: `instant.perms.ts` (root)
- Client SDK: `lib/database/instant.ts` — returns `db` (null when InstantDB disabled)
- Admin SDK: `lib/database/instant.server.ts` — `getAdminDb()` for server actions

### Client SDK is fire-and-forget

Don't `await` client SDK methods (`db.transact()`, `db.auth.*`, `db.storage.delete()`). Use `.catch()` for errors. State flows reactively via `useAuth()` / `useQuery()`. Only `await` when you need the return value (e.g., `db.storage.uploadFile()` returns a file ID). The admin SDK is the opposite — all methods are async and must be awaited.

### CLI commands (run from `happyhq/`)

- `pnpm db:push-schema` — push schema changes to InstantDB
- `pnpm db:push-perms` — push permission rules
- `pnpm db:push` — push both
- `pnpm dlx instant-cli login` — authenticate (required first time)

The CLI reads `NEXT_PUBLIC_INSTANT_APP_ID` from `.env.local`.

## Testing

- Follow instructions in `testing.md`

## Debugging Q (runtime logs)

Structured logs at `~/HappyHQ/.logs/YYYY-MM-DD.jsonl` — one JSON object per line with `{t, event, ...context}`.

Events: `task.*`, `run.*`, `stream.*`, `chat.*`, `file.*`, `sample.*`, `action.failed`, `api.error`, `client.*`

Query logs:

- `npx tsx scripts/read-logs.ts` — last 20 events
- `npx tsx scripts/read-logs.ts --event=run.error` — recent errors
- `npx tsx scripts/read-logs.ts --task=<slug>` — events for a specific task
- `npx tsx scripts/read-logs.ts --stream=<slug>` — events for a stream
- `npx tsx scripts/read-logs.ts --last=50 --event=run.` — run lifecycle

Or grep directly: `grep 'run.error\|action.failed' ~/HappyHQ/.logs/$(date +%Y-%m-%d).jsonl`

After changing agent behavior (prompts, tools, run loop), start Q and run a task to verify the change works at runtime — tests verify plumbing, logs verify behavior.

## Using HappyHQ's API (for verification)

HappyHQ's API is open for local use (no auth needed). Start the dev server, then drive it via curl.

Start: `pnpm dev` (or `pnpm build && pnpm start` for stable no-HMR mode)

Key endpoints:

- `GET  /api/auth/status` — health check (is HappyHQ running, is auth configured)
- `GET  /api/fs/streams` — list all streams
- `GET  /api/fs/task?task=<slug>` — read task content, inputs, outputs, run state
- `GET  /api/fs/task-items` — list all tasks
- `POST /api/run/start` — start a run: `{"task":"<slug>","stream":"<slug>","mode":"planning"|"working"}`
- `GET  /api/run/active` — poll run status (404 means done)
- `POST /api/run/stop` — stop active run
- `GET  /api/run/stream` — stream NDJSON run output in real time
- `POST /api/chat` — chat with agent: `{"message":"...","sessionId":"<uuid>","streamSlug":"<slug>"}`

Verification workflow:

1. Start HappyHQ in the background (`pnpm dev &` or production build)
2. Trigger the behavior to verify (start a run, send a chat message, etc.)
3. Poll `/api/run/active` until 404 (run finished)
4. Read logs: `npx tsx scripts/read-logs.ts --task=<slug>`
5. Read outputs: `curl localhost:3000/api/fs/task?task=<slug>`
6. Kill the server when done

## After code changes

Run these checks after making changes. Stop at first failure and fix.

1. `pnpm check-types && pnpm lint && pnpm test` — must all pass
2. If the dev server is running: `npx tsx scripts/smoke-test.ts` — API health + error check
3. Check for client errors: `npx tsx scripts/read-logs.ts --event=client. --last=10`
4. Check for server errors: `npx tsx scripts/read-logs.ts --event=api.error --last=10`
5. If you changed agent behavior, start a run and check: `npx tsx scripts/read-logs.ts --event=run. --last=10`

Client-side errors (React crashes, failed fetches, unhandled exceptions) are forwarded to the server log automatically via `reportError()` in `lib/report-error.ts`. They appear as `client.*` events in the same log files.
