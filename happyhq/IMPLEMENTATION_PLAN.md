# Exercise Harness — Implementation Plan

Scope: build the dev-only Playwright harness described in
[specs/playground.md §521](specs/playground.md) — `pnpm tsx scripts/exercise.ts`
spawns the dev server with `HAPPYHQ_ROOT` pointed at a sandbox directory,
drives the real running app through Playwright per a script in
`scripts/exercises/`, and captures `dom.html` / `console.jsonl` /
`network.jsonl` / `logs.jsonl` / `wire.jsonl` into
`<root>/.exercises/<id>/`. The artifact directory is the deliverable —
Ralphie greps it; a human reads the same files to follow along.

This plan covers the harness CLI plus the four supporting pieces called
out in the spec:

1. `HAPPYHQ_ROOT` plumbing (verify) and new path helpers in `lib/fs/paths.ts`
2. Wire-event tee in `lib/run/loop.server.ts`
3. Activity-reducer extraction (`useRunActivity` → pure `reduceActivity`)
4. Smoke + rename-stream (#24) exercise scripts as the verification battery

---

## 1. Current state — what already exists

- **`HAPPYHQ_ROOT` plumbing is already done.** `lib/constants.server.ts:4-5`
  reads `process.env.HAPPYHQ_ROOT` with a `~/HappyHQ` fallback. Every helper
  in `lib/fs/paths.ts` (`streamPath`, `taskPath`, `chatPath`, `qPath`,
  `logsDir`, `safePath`) routes through `HAPPYHQ_ROOT`. `loop.server.ts`
  uses `HAPPYHQ_ROOT` as the `cwd` for git ops (`loop.server.ts:1117,1122`).
  No production code hardcodes `~/HappyHQ`. **The spec's "HAPPYHQ_ROOT
  plumbing in lib/constants.server.ts + lib/fs/paths.ts" is largely
  satisfied — only path _additions_ are needed**, not refactoring.

  Existing escape hatches that bypass `HAPPYHQ_ROOT` and need a smoke audit:
  - `scripts/smoke-test.ts:23` and `scripts/read-logs.ts:25` already honour
    the env var (good — these are CLI scripts, not the running server).
  - `lib/report-error.ts:5` is a comment only.
  - No production runtime path skips the env var.

- **Run loop has a single fan-out chokepoint.** `lib/run/loop.server.ts:1021`
  `broadcast(chunk: Uint8Array)` is the only path bytes reach subscribers.
  It is called from five sites — all `broadcast(encodeEvent(event))` —
  inside planning (l. 471, 501), working (l. 729, 759), and the heartbeat
  keepalive (l. 1044). Tee insertion at `broadcast` covers every emitted
  `ChatStreamEvent`.

- **`encodeEvent` and `filterMessage` are reusable as-is**
  (`lib/run/filter.server.ts:127, 20`). The spec mandates "reused
  unchanged"; this matches.

- **`ChatStreamEvent` type lives at `lib/chat/types.ts:5-17`** with **12
  variants**: `partial`, `assistant`, `tool_progress`, `subagent_event`,
  `result`, `error`, `auth_error`, `pending_confirmation`,
  `stream_content_changed`, `task_content_changed`, `mode_changed`,
  `heartbeat`. None contain credentials or API keys; safe to persist to
  disk verbatim.

- **`useRunActivity` is implemented imperatively, not as a reducer.**
  `components/features/desktop/hooks/use-run-activity.ts:101-554` keeps 7
  refs (`blockIndexMapRef`, `partialJsonRef`, `mergedDetailsRef`,
  `confirmedRunningRef`, `blockLineCountRef`, `lastToolStepRef`,
  `subagentStartedAtRef`) and updates `activitySteps` from inside a
  `for-await` over `/api/run/stream`. Tests live next to it
  (`use-run-activity.test.ts`, 4 subagent tests).
  The for-await body **only handles 6 of the 12 event variants** today:
  `partial` (l. 185), `tool_progress` (l. 349), `assistant` (l. 392),
  `subagent_event` (l. 435), `task_content_changed` (l. 504), `result`
  (l. 506). The other six (`error`, `auth_error`, `pending_confirmation`,
  `stream_content_changed`, `mode_changed`, `heartbeat`) are silently
  ignored. The reducer extraction must preserve this — it's a refactor,
  not a feature addition.

- **No existing `runId` concept.** Runs are identified by stream/task pair
  - per-iteration `crypto.randomUUID()` session IDs (planning has one,
    working accumulates many in `workingSessionIds`). The harness needs a
    single ID per `startRun()` invocation to address `wire.jsonl`.

- **No `lib/exercise/`, `lib/run/wire-tee.server.ts`, `scripts/exercises/`,
  `scripts/exercise.ts`, `lib/run/activity-reducer.ts` exist.** All new.

- **No existing harness or browser-automation infra.** Playwright is not
  yet a dependency.

- **API endpoints the harness can rely on:**
  - `GET /api/auth/status` — readiness probe; returns 200 quickly even on
    a fresh sandbox (`app/api/auth/status/route.ts:1-22`).
  - `GET /api/fs/streams`, `GET /api/fs/task-items`, `GET /api/run/active`
    — list endpoints used by `scripts/smoke-test.ts`.
  - `POST /api/chat`, `POST /api/run/start` — for exercises that need to
    fire real requests bypassing the UI.
  - `renameStream` is a server action (`lib/actions/streams.ts`), reachable
    only via the UI sidebar or by calling the action via `page.request`
    against the action's invoker route.

- **Reserved `<HAPPYHQ_ROOT>/` directories.** `lib/fs/read.server.ts:32`
  has `RESERVED_ROOT_DIRS = ['tasks', '.chats', 'task']`. The stream
  listing also filters dot-prefixed entries (`read.server.ts:718`), which
  hides `.git`, `.q`, `.logs`. New `.exercises/` and `.runs/` are
  dot-prefixed so the listing filter handles them automatically; we
  should still add both to `RESERVED_ROOT_DIRS` for explicitness so a
  user-typed stream name "exercises" or "runs" can't collide.

- **Logs format** (`lib/log.server.ts`, `specs/logging.md`): JSONL at
  `<HAPPYHQ_ROOT>/.logs/<YYYY-MM-DD>.jsonl`, one record per line with
  `{t: ISO, event: dotted.name, ...}`. Slicing by `t` window is
  straightforward; midnight rollover means slicing may need to read two
  day files.

---

## 2. Target state — what we are building

```
happyhq/
├─ scripts/
│   ├─ exercise.ts                       # NEW: harness CLI
│   └─ exercises/
│       ├─ smoke.ts                      # NEW: minimal verification
│       └─ rename-stream.ts              # NEW: #24 verification
├─ lib/
│   ├─ exercise/
│   │   └─ dump.ts                       # NEW: dump() factory used by harness
│   ├─ fs/
│   │   └─ paths.ts                      # EDIT: + runsDir, runWirePath, exerciseDir, exercisesDir
│   └─ run/
│       ├─ loop.server.ts                # EDIT: mint runId, refactor broadcast, tee
│       ├─ wire-tee.server.ts            # NEW: appendWireEvent(runId, event)
│       └─ activity-reducer.ts           # NEW: pure reducer + tests
├─ components/features/desktop/hooks/
│   └─ use-run-activity.ts               # EDIT: rewrite around useReducer(reduceActivity)
└─ package.json                          # EDIT: + playwright devDep + postinstall hook
```

A run produces `<HAPPYHQ_ROOT>/.runs/<runId>/wire.jsonl` regardless of
whether an exercise is driving — it is a small, additive on-disk record
of every emitted `ChatStreamEvent` for that run. Inside an exercise,
the harness copies the `wire.jsonl` slice for runs that fired during
the exercise window into `.exercises/<id>/wire.jsonl`.

---

## 3. Architecture decisions

### 3.1 `runId` minted per `startRun()` invocation

A single `runId` covers one `startRun()` call (one planning _or_ one
working multi-iteration loop). Generated at `startRun()` entry with
`crypto.randomUUID()`, stored on `RunLoopState.activeRunId`, cleared in
the same `finally` that resets `activeRunStream`/`activeRunTask`.

Rationale: matches the spec's `<HAPPYHQ_ROOT>/.runs/<runId>/wire.jsonl`
shape; `runId` is independent of the per-iteration session IDs (which
remain inside iteration metrics for billing/log correlation). Validates
with the existing `assertSafePathSegment` (UUID matches the regex).

### 3.2 Wire tee inside `broadcast()`, refactored to take `ChatStreamEvent`

Today `broadcast(chunk: Uint8Array)` is called as
`broadcast(encodeEvent(event))` from five sites. Refactor to
`broadcast(event: ChatStreamEvent)` so encoding _and_ teeing happen
once, at the chokepoint. The five callsites simplify to
`broadcast(event)`. Behaviour is unchanged for subscribers (same bytes,
same fan-out).

The tee call is fire-and-forget (`appendWireEvent(runId, event).catch(...)`)
to avoid blocking the run loop on disk I/O. `appendWireEvent` uses
`fs.appendFile` so concurrent appends within a single run are
serialised by Node, and the file is opened/closed each call (cheap for
JSONL frequency).

### 3.3 No new "wire-tee subscriber" abstraction

Earlier drafts considered modelling the tee as another subscriber on the
fan-out. Reject — subscribers are per-HTTP-request `WritableStream`s, and
treating a file as one would conflate liveness signalling with durable
recording. A direct `appendWireEvent` call inside `broadcast` is simpler
and isolates the FS error surface.

### 3.4 Activity reducer: state-only refactor, no behavioural change

Pure reducer takes the _full_ prior `ActivityState` (including what are
today refs) and returns the next state:

```ts
// lib/run/activity-reducer.ts
export interface ActivityState {
  steps: ActivityStep[]
  // moved from refs in the hook:
  blockIndexMap: Map<number, string>
  partialJson: Map<number, string>
  mergedDetails: Map<string, string[]>
  confirmedRunning: Set<string>
  blockLineCount: Map<number, number>
  lastToolStep: { toolName: string; toolUseId: string } | null
  subagentStartedAt: Map<string, number>
}

export function initialActivityState(): ActivityState
export function reduceActivity(
  prev: ActivityState,
  event: ChatStreamEvent,
  now: number, // injected — was Date.now() in hook
): ActivityState
```

`now` parameterisation is mandatory because today the hook calls
`Date.now()` at `use-run-activity.ts:442` (subagent started),
`l. 467` (subagent progress elapsed), `l. 488` (subagent completed
elapsed) — these three feed the activity state and must take `now` as
input. The remaining two (`l. 505`, `l. 534`) write
`lastContentChangeAt`, which is connection/UI state owned by the hook,
not activity state — they stay in the hook untouched. A pure reducer
is the only way replays of a captured `wire.jsonl` produce a
deterministic snapshot.

The hook keeps its non-pure work: fetch `/api/run/stream`, abort
controller, reconnect on 404, the `isActive` mount/unmount lifecycle,
status-line and `lastResultAt` sub-states (not part of `ActivityState`).
Inside the `for-await`, each event becomes `dispatch({event, now: Date.now()})`.

The reducer is a state-update primitive; `useReducer` is the local hook
pattern. No SWR, no Zustand, no global state.

### 3.5 Exercise IDs, sandboxing, and key passthrough

- `--id` defaults to `ex-<8-hex>` if omitted. Validated by
  `assertSafePathSegment`.
- `--root` defaults to `os.tmpdir() + /happyhq-exercise-<id>`. The
  harness creates it (idempotent mkdir-p), spawns the dev server with
  `HAPPYHQ_ROOT=<root>` and a free `PORT`, and _never_ writes outside
  that directory.
- `--keep` (default true per spec) controls whether `<root>` is left
  intact after exit. Inverse `--no-keep` cleans up.
- `ANTHROPIC_API_KEY` is _passed through_ from the parent env so
  exercises that fire real runs (rename-stream, future bug-fix
  exercises) can reach the SDK. No token is _written_ into the sandbox
  unless the exercise itself does so via the UI (login flow). UI-only
  exercises don't need a key.
- Pollution audit baked into the smoke verification: assert that
  `~/HappyHQ/` (or whatever the parent shell's `HAPPYHQ_ROOT` resolves
  to) has the same file count + mtimes before and after. Catches any
  future regression that bypasses the env var.

### 3.6 Wire-slice algorithm for `<root>/.exercises/<id>/wire.jsonl`

When the exercise starts, snapshot `listdir(<root>/.runs/)` → `before`.
When it ends, list again → `after`. For each `runId` in `after \ before`:
`cat <root>/.runs/<runId>/wire.jsonl >> <exDir>/wire.jsonl` (with a
delimiter line `{"_runId": "..."}` between runs so consumers can
demultiplex). Simpler than time-window filtering and exact for the
"runs that fired during this exercise" semantics.

### 3.7 Logs-slice algorithm for `<root>/.exercises/<id>/logs.jsonl`

Capture `started: Date.now()` before the script runs and `ended` after.
Read `<root>/.logs/<YYYY-MM-DD>.jsonl` for the started-day and (if
different) ended-day. Filter records whose `t` (`Date.parse`) falls in
`[started, ended]`. Write to `<exDir>/logs.jsonl`.

### 3.8 `dump(name?)` semantics

`dump()` (no arg, called automatically at end-of-exercise) writes the
final `<exDir>/dom.html`. `dump('foo')` (called inside the script)
writes `<exDir>/dom-foo.html` and `<exDir>/screenshots/foo.png`. The
factory is in `lib/exercise/dump.ts`; the harness wires the page +
artifact dir and injects the closure into the script's `run({ page,
dump, root })` call.

### 3.9 Exit-code contract

- Script `run()` returns normally → exit 0; `meta.json.exit = 0`.
- Script throws → harness catches, captures final artifacts,
  `meta.json.exit = 1`, `meta.json.error = err.message + err.stack`,
  process exits 1.
- Dev server fails to start within timeout → exit 2 with
  `error: "dev server timeout"`.
- Harness internal error (e.g. Playwright launch failure) → exit 3.

---

## 4. File-by-file work

### 4.1 `lib/fs/paths.ts` — EDIT

Add four helpers, all using existing `assertSafePathSegment`
(`lib/fs/paths.ts:102-109`, regex
`/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/`). Also extend
`RESERVED_ROOT_DIRS` (`lib/fs/read.server.ts:32`) to include
`'.runs'` and `'.exercises'`.

```ts
export function runsDir(): string {
  return path.join(HAPPYHQ_ROOT, '.runs')
}

export function runWirePath(runId: string): string {
  assertSafePathSegment(runId, 'run id')
  return path.join(HAPPYHQ_ROOT, '.runs', runId, 'wire.jsonl')
}

export function exercisesDir(): string {
  return path.join(HAPPYHQ_ROOT, '.exercises')
}

export function exerciseDir(id: string): string {
  assertSafePathSegment(id, 'exercise id')
  return path.join(HAPPYHQ_ROOT, '.exercises', id)
}
```

Tests: extend `lib/fs/paths.test.ts` with positive + negative cases for
each (matching existing pattern for `taskPath`/`chatPath`).

### 4.2 `lib/run/wire-tee.server.ts` — NEW

```ts
import fs from 'node:fs/promises'
import path from 'node:path'
import { runWirePath } from '@/lib/fs/paths'
import type { ChatStreamEvent } from '@/lib/chat/types'

export async function appendWireEvent(
  runId: string,
  event: ChatStreamEvent,
): Promise<void> {
  const file = runWirePath(runId)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8')
}
```

Notes:

- `runWirePath` validates the runId regex barrier — keeps the
  `js/path-injection` sanitiser model intact.
- `mkdir({recursive: true})` is idempotent; cheap on repeat calls.
- Errors propagate; the caller in `loop.server.ts` swallows with
  `.catch(err => log('wire.tee.error', { err: String(err) }))`. A
  failed tee must never break the run.

Tests: `wire-tee.server.test.ts` writes two events, reads back the file,
asserts JSONL roundtrip + parent-dir creation.

### 4.3 `lib/run/loop.server.ts` — EDIT

Three changes:

**(a)** Add `activeRunId: string | null` to `RunLoopState` (l. 48-58).
Initialise in `getState()` (l. 64-77).

**(b)** In `startRun()` (l. 94 onwards), mint
`s.activeRunId = crypto.randomUUID()` alongside
`s.activeRunStream`/`s.activeRunTask`. Reset to `null` in the same
`finally`/cleanup blocks that null those fields (l. 220-225, 442-444).

**(c)** Refactor `broadcast` (l. 1021):

```ts
function broadcast(event: ChatStreamEvent): void {
  const s = getState()
  const chunk = encodeEvent(event)

  if (s.activeRunId) {
    appendWireEvent(s.activeRunId, event).catch((err) => {
      log('wire.tee.error', {
        err: err instanceof Error ? err.message : String(err),
      })
    })
  }

  for (const writer of s.subscribers) {
    writer.write(chunk).catch(() => {
      writer.close().catch(() => {})
      s.subscribers.delete(writer)
    })
  }
}
```

Update the five callsites (l. 471, 501, 729, 759, 1044) from
`broadcast(encodeEvent(event))` → `broadcast(event)`. Keep `encodeEvent`
as-is (used internally now).

Tests: extend `loop.server.test.ts` to assert that a run produces a
`.runs/<runId>/wire.jsonl` containing the events its iteration emitted.
Existing `MOCK_ROOT = '/mock/home/HappyHQ'` mock stays unchanged.

### 4.4 `lib/run/activity-reducer.ts` (+`.test.ts`) — NEW

Move the imperative body of `useRunActivity`'s `for-await` block into a
pure reducer. Mechanical extraction:

| Today (in hook)                     | After                                                       |
| ----------------------------------- | ----------------------------------------------------------- |
| `setActivitySteps(prev => ...)`     | `next.steps = ...`                                          |
| `blockIndexMapRef.current.set(...)` | `next.blockIndexMap = new Map(prev.blockIndexMap).set(...)` |
| `Date.now()`                        | `now` parameter                                             |
| `getToolLabel(name)`                | imported as-is from `@/lib/chat/tool-labels`                |

Each top-level `if` branch in the hook becomes a case in
`reduceActivity`. The reducer handles the **6 event types the hook
handles today** (`partial`, `tool_progress`, `assistant`,
`subagent_event`, `task_content_changed`, `result`) and falls through
on the other 6 — same observable behaviour. Subagent elapsed-time math
uses `now - prev.subagentStartedAt.get(taskId)`.

`statusLine`, `lastResultAt`, `lastContentChangeAt`, `isConnected` stay
in the hook — they are connection/UI state, not activity state.

**Pre-extraction verification (do this first, before §4.5).**
The "behavioural parity" claim assumes the existing 4 tests in
`use-run-activity.test.ts` are clock-independent — i.e. their expected
values don't embed `Date.now()` snapshots from when the test runs.
If any test asserts on subagent `elapsedSeconds` or any other
`Date.now()`-derived field, the new reducer will produce different
values than the live hook on replay, and the tests will appear to
"fail" the parity check even though behavior is identical. **Audit
the 4 tests for `Date.now()` dependence before starting the
extraction**: if they're clock-clean, replay-parity is the right
test; if they aren't, either inject a fake clock via
`vi.setSystemTime()` in the reducer tests or factor out the
clock-dependent assertions into a separate test that exercises both
implementations against the same frozen `now`. Do not silently update
expected values to match the new reducer — that defeats the parity
check.

Tests (`activity-reducer.test.ts`):

- Replay the 4 fixtures from `use-run-activity.test.ts` through
  `reduceActivity` and assert the same final `steps`. Proves
  behavioural parity (modulo the clock audit above).
- Add a subagent elapsed-time test that injects a fixed `now` to
  verify determinism.
- (Future) once exercises capture `wire.jsonl`, drop a fixture in
  `lib/run/__fixtures__/wire-issue-26.jsonl` and snapshot the reducer
  output as the regression test.

### 4.5 `components/features/desktop/hooks/use-run-activity.ts` — EDIT

- Replace 7 refs and `useState<ActivityStep[]>` with
  `useReducer(reduceActivity, undefined, initialActivityState)`.
- `for-await` body becomes
  `dispatch({ event, now: Date.now() })` for every wire event. Wrap
  reducer in a thin local action shape: `useReducer<typeof reduceActivity,
Action>(...)` with `Action = {event: ChatStreamEvent, now: number}`.
- Keep `statusLine`/`isConnected`/`lastResultAt`/`lastContentChangeAt`
  as separate `useState` (they are not part of `ActivityState`).
- Cleanup-on-`isActive=false` resets via
  `dispatch({type: 'reset'})` _or_ `useReducer` re-init key — pick the
  reducer pattern: a synthetic `{event: {type: 'reset'}}` action.
  (Alternative: keep state via `useReducer` and re-mount via `key`
  prop — reject, doesn't fit the hook shape.)
- Existing 4 tests in `use-run-activity.test.ts` must stay green
  unchanged. They drive via mocked `fetch` — they don't see internal
  state shape, only `result.current.activitySteps`.

### 4.6 `lib/exercise/dump.ts` — NEW

```ts
import type { Page } from 'playwright'
import fs from 'node:fs/promises'
import path from 'node:path'

export interface DumpHelper {
  (name?: string): Promise<void>
}

export function createDump(page: Page, exDir: string): DumpHelper {
  return async function dump(name?: string) {
    const html = await page.content()
    if (name) {
      await fs.writeFile(path.join(exDir, `dom-${name}.html`), html, 'utf8')
      await fs.mkdir(path.join(exDir, 'screenshots'), { recursive: true })
      await page.screenshot({
        path: path.join(exDir, 'screenshots', `${name}.png`),
        fullPage: true,
      })
    } else {
      await fs.writeFile(path.join(exDir, 'dom.html'), html, 'utf8')
    }
  }
}
```

Validated `name` segment via `assertSafePathSegment` to lock down the
filename interpolation.

### 4.7 `scripts/exercise.ts` — NEW

CLI structure (~250 LoC):

1. **Arg parsing** (inline, matching `read-logs.ts` style — no library):
   `--root`, `--script`, `--id`, `--keep`/`--no-keep`, `--port`,
   `--help`. Bail with usage on bad input.
2. **Resolve paths**: `id`, `root`, `exDir = <root>/.exercises/<id>`.
   `mkdir -p` `exDir` and `<exDir>/screenshots`.
3. **Find a free port** (use Node `net.createServer().listen(0)` then
   close — well-known pattern).
4. **Spawn dev server**: `child_process.spawn('pnpm', ['next', 'dev'],
{ cwd: <happyhq dir>, env: { ...process.env, HAPPYHQ_ROOT: root,
PORT: String(port) } })`. Log stdout/stderr to `<exDir>/server.log`.
5. **Wait for readiness**: poll `GET http://localhost:<port>/api/auth/status`
   every 250ms, max 60s, then bail.
6. **Snapshot pre-state**: `before = listdir(<root>/.runs)` (likely empty
   for a fresh sandbox), `started = Date.now()`.
7. **Dynamic-import the script**: `await import(path.resolve(scriptPath))`.
   Fail clear if no `run` export.
8. **Launch Playwright**: `chromium.launch()`, `browser.newContext()`,
   `page = await context.newPage()`.
9. **Wire listeners**:
   - `page.on('console', msg => consoleEvents.push({...}))`
   - `page.on('pageerror', err => consoleEvents.push({level: 'pageerror', text: err.stack}))`
   - `page.on('request', req => networkEvents.push({phase: 'request', ...}))`
   - `page.on('response', res => networkEvents.push({phase: 'response', ...}))`
10. **Run script**: `await script.run({ page, dump: createDump(page, exDir), root })`.
    Inside try/catch.
11. **Final dump** (always, even on throw): `await dump()` → writes
    `dom.html`. Capture `ended = Date.now()`.
12. **Write artifacts**:
    - `<exDir>/console.jsonl` (one event per line)
    - `<exDir>/network.jsonl`
    - `<exDir>/logs.jsonl` (sliced from `<root>/.logs/<date>.jsonl` by
      `[started, ended]`)
    - `<exDir>/wire.jsonl` (concatenated from new
      `<root>/.runs/<runId>/wire.jsonl` files in `after \ before`)
    - `<exDir>/meta.json`: `{ id, script, root, port, started, ended,
durationMs, exit, error?, runIds: string[] }`
13. **Tear down**: `await browser.close()`, `child.kill('SIGTERM')`,
    grace 2s, `child.kill('SIGKILL')` if still alive.
14. **Exit**: `process.exit(meta.exit)`.

All FS writes use `lib/fs/write.server.ts:writeTextFile`/`ensureDirectory`
(already imported via `@/`).

### 4.8 `scripts/exercises/smoke.ts` — NEW

Minimal verification (per spec §667-672):

```ts
import type { Page } from 'playwright'
import type { DumpHelper } from '@/lib/exercise/dump'

export async function run({
  page,
  dump,
  root,
}: {
  page: Page
  dump: DumpHelper
  root: string
}) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // open the composer, type a message, submit
  const composer = page.getByRole('textbox', { name: /message/i })
  await composer.fill('hello from the harness')
  await composer.press('Enter')

  // wait for either the assistant message OR an auth-error toast
  await page.waitForSelector(
    '[data-role="assistant-message"], [data-role="auth-error"]',
    { timeout: 10_000 },
  )

  await dump('after-send')
}
```

Notes:

- The composer textareas in `components/features/chat/composer.tsx`
  (l. 328 and l. 387) currently have no `aria-label`; the placeholder
  text drives accessibility. Add `aria-label="Message"` to both so
  `getByRole('textbox', { name: /message/i })` resolves stably across
  themes. This is part of the work, ~2 lines.
- `data-role="assistant-message"` adds cleanly to `AssistantMessage` in
  `components/features/chat/messages/chat-message.tsx` (~l. 113). One
  line.
- `data-role="auth-error"` is **not** a one-liner — auth-error toasts
  surface via `toastError()` over Sonner, whose markup is rendered by
  the library. Either pass the attribute through Sonner's
  `unstyled`/`classNames` API, or render the auth-error toast as a
  custom JSX node (Sonner supports `toast.custom(...)`) so we control
  the wrapper. Plan adopts the second option; ~10 LoC in
  `components/common/ui/sonner.tsx`.
- The smoke does _not_ assert success — it asserts the harness round-
  trips. The pollution audit (a bash check after the harness exits)
  closes the loop.

### 4.9 `scripts/exercises/rename-stream.ts` — NEW

Verifies issue #24 (rename stream while windows open). **The current
codebase has no functional rename UI** — `components/features/sidebar/
molecules/name-dialog.tsx` and `atoms/dropdown-menu.tsx` exist as
unwired components, and `renameStream` (`lib/actions/streams.ts:84-101`)
only renames the FS directory; it does not update `windowStore` open
windows. So the bug is reproducible only once a rename gesture exists.

Two ways to land the exercise:

- **(A) Wire the sidebar rename gesture as a precondition.** Connect
  `ItemDropdownMenu` to each stream row, open `NameInputDialog` on
  Rename, call the existing `renameStream` action on submit. ~50 LoC.
  Lands in the same harness PR series. The exercise then drives this
  real UI gesture. Recommended.
- **(B) Drive rename via direct action invocation in `page.evaluate`**
  (call the server action's POST endpoint from inside the page). Avoids
  building UI; messier and less faithful to the user-visible bug.

Plan adopts **(A)**. The actual #24 _fix_ (rewriting `windowStore`
state when a stream renames, mirroring the existing `rewriteTaskPaths`
helper at `stores/windowStore.ts:502`) is **out of scope here** — this
work delivers the exercise that _demonstrates_ the bug. Once the fix
lands separately, the same exercise becomes the green regression test.

Steps:

1. Pre-seed: call `createStream` server action (`lib/actions/streams.ts:
26-65`) via the action endpoint, or pre-write `<root>/acme/` via
   `ensureDirectory` + a seed task before the dev server boots. Either
   route is fine; option two avoids racing the readiness probe.
2. `page.goto('/acme')` — open the desktop view for that stream.
3. Click a file/task entry in the sidebar to materialise a window.
4. `dump('before-rename')` — snapshot DOM + screenshot the window state.
5. Trigger rename via the new sidebar gesture: open the row's dropdown
   (`data-role="stream-row-menu"`), click Rename, type `acme-renamed`
   into `NameInputDialog`, submit.
6. `await page.waitForURL(/acme-renamed/)` (or a stable readiness
   sentinel — the URL may not change without the windowStore fix).
7. Assert all window titles/URLs now reference `acme-renamed`, none
   reference `acme`. If any window still shows the old name or 404s,
   throw — that's the #24 reproduction. Either outcome (clean rename
   or broken windows) is recorded as evidence.
8. `dump('after-rename')`.

The exercise stays in the repo as the permanent regression test for #24.

### 4.10 `package.json` — EDIT

Add `playwright` (the SDK package) to `devDependencies` — **not**
`@playwright/test`. The harness is a CLI driver, not a test suite;
the test runner brings test-discovery globals and lifecycle hooks
that don't belong inside a one-shot CLI. Imports throughout the
harness use `import { chromium, type Page } from 'playwright'`.

Add a `postinstall` script that runs `playwright install chromium`
so a fresh `pnpm install` lands a working harness — per spec
[§ Setup — browser binaries](specs/playground.md#setup--browser-binaries).
The harness CLI (§4.7) checks for the binary on launch and fails
fast with the install command if it's missing — a Playwright
internal stack trace is the wrong UX for "you forgot postinstall."

Single browser only — no WebKit/Firefox parity for a dev tool.

---

## 5. Implementation order

Each step lands as a separate PR (small, reviewable). Steps 1-3 are
pure refactors with no behavioural change — they ship safely without
the harness. Steps 4-7 wire it together.

1. **Path helpers** (`lib/fs/paths.ts` + tests). Trivial; unblocks
   everything else. PR title: `feat(fs): add exerciseDir/runWirePath helpers`.
2. **Activity reducer extraction** (`lib/run/activity-reducer.ts` +
   `use-run-activity.ts` rewrite + reducer tests). Existing hook tests
   stay green; reducer tests prove parity. PR title:
   `refactor(run): extract activity reducer for replay`.
3. **Wire tee** (`lib/run/wire-tee.server.ts` + `loop.server.ts` edit
   - tests). After this lands, every run produces `wire.jsonl` whether
     the harness exists or not — instantly useful for log-grepping past
     runs. PR title: `feat(run): tee wire events to .runs/<runId>/wire.jsonl`.
4. **Dump helper + harness CLI skeleton** (`lib/exercise/dump.ts`,
   `scripts/exercise.ts` minus exercise scripts, Playwright dep).
   Verify by running it with an empty no-op script — should produce
   `meta.json` + `console.jsonl` + `network.jsonl` + `dom.html`. PR
   title: `feat(harness): scripts/exercise.ts CLI skeleton`.
5. **Smoke exercise + selector hooks** (`scripts/exercises/smoke.ts`,
   `aria-label="Message"` on composer, `data-role="assistant-message"`,
   custom Sonner toast for `data-role="auth-error"`). PR title:
   `feat(harness): smoke exercise + selector hooks`.
6. **Sidebar rename gesture** (wire `ItemDropdownMenu` +
   `NameInputDialog` to each stream row, call `renameStream` on
   submit). Standalone improvement; exercise depends on it. PR title:
   `feat(sidebar): wire rename gesture for streams`.
7. **Rename-stream exercise** (`scripts/exercises/rename-stream.ts`).
   First exercise that catches a real bug; the artifact dir is the
   evidence whether #24 is fixed or still reproducing. PR title:
   `feat(harness): rename-stream exercise (verifies #24)`.
8. **Wire-replay regression test for #26** (drop a captured
   `wire.jsonl` fixture into `lib/run/__fixtures__/`, snapshot
   `reduceActivity` output). PR title:
   `test(run): pin subagent activity rendering (#26) via wire replay`.

---

## 6. Verification

Each step ships with its own checks; the cumulative end-state is:

- `pnpm check-types && pnpm lint && pnpm test` green (existing test
  suite + new reducer tests + new path-helper tests + new wire-tee
  tests).
- `pnpm tsx scripts/exercise.ts --root /tmp/exercise-smoke --script
scripts/exercises/smoke.ts` exits 0; the artifact dir contains all
  six expected files; `dom.html` shows the post-send page.
- **Pollution audit**: `find ~/HappyHQ -newer /tmp/exercise-smoke/meta.json`
  is empty (the user's real root was untouched).
- `pnpm tsx scripts/exercise.ts --root /tmp/exercise-rename --script
scripts/exercises/rename-stream.ts` either exits 0 (#24 fixed) or
  exits 1 with a `dom-after-rename.html` showing the broken window
  state — that artifact is the bug report.
- `pnpm test lib/run/activity-reducer.test.ts` passes against the
  captured `wire.jsonl` fixture (#26 regression-pinned).

---

## 7. Open questions / risks

- **Selector stability.** The smoke and rename-stream scripts need
  durable selectors. The codebase has 38 ad-hoc `data-testid` usages
  across 10 files but no convention, and zero `data-role` usages today
  (verified). The plan introduces `data-role` attributes specifically
  for harness-driven flows (assistant message, auth-error toast,
  sidebar stream-row menu, window title bar). These are stable hooks,
  not test-only — they describe semantic role, so reuse is fine. Keep
  the count small; expand only when an exercise needs one.
- **Rename UI is half-built.** `NameInputDialog` and `ItemDropdownMenu`
  exist but aren't wired into the sidebar; `renameStream` only renames
  the FS dir and does not touch `windowStore`. Section 4.9 calls for
  ~50 LoC of sidebar wiring as a precondition for the rename-stream
  exercise. The deeper #24 fix (windowStore rewrite, mirroring the
  existing `rewriteTaskPaths` at `stores/windowStore.ts:502`) is
  separate work — the exercise _demonstrates_ the bug and becomes the
  regression test once #24 is fixed.
- **`--keep` flag semantics.** Spec writes `[--keep]` (default keep).
  Plan reads this as default-keep with `--no-keep` to opt into cleanup,
  consistent with Ralphie's "leave artifacts" intent. Confirm with
  spec author if ambiguous.
- **`pending_confirmation` event in wire.jsonl.** The 12th
  `ChatStreamEvent` variant fires when the agent waits on user
  permission for a tool. It will land in `wire.jsonl`. The reducer
  has no case for it today (matches current hook) and won't grow one
  here. Replays may want to surface it; defer.
- **Fly env quirks.** `loop.server.ts:1048-1053` has a `FLY_APP_NAME`
  self-ping interval. In the harness, `FLY_APP_NAME` is unset, so the
  ping is skipped. No risk, but worth noting.
- **`MOCK_ROOT` vs sandbox.** `loop.server.test.ts` mocks
  `HAPPYHQ_ROOT = '/mock/home/HappyHQ'` and writes to that path during
  tests. The new wire-tee will also write there. The existing
  `vitest.setup.ts` already prevents tests from writing to the real
  log file; extend the same pattern to `.runs/` if needed (or use
  `os.tmpdir()` based mocks).
- **Concurrent runs across exercises.** Sequential-only per spec
  [§ Constraints](specs/playground.md#constraints) — concurrent
  harness invocations against the same `HAPPYHQ_ROOT` are not
  supported. The wire-slice algorithm (§3.6) snapshots `.runs/`
  before/after the exercise window; under parallel exec the diff is
  ambiguous and runs would cross-contaminate. Parallelism is per-root,
  not per-exercise. The single-run-at-a-time invariant in
  `loop.server.ts` carries forward; harness scripts that fire a run
  wait for it before exiting.
- **Heartbeat noise in `wire.jsonl`.** Heartbeats fire every 20s
  during a run. They are valid `ChatStreamEvent`s and will land in
  `wire.jsonl`. Fine for the activity reducer (heartbeat case is a
  no-op); replays may want to filter them. Not a blocker.
- **Dev server start time.** First-cold `next dev` can take 5-15s. The
  60s readiness timeout is conservative; keep it for CI futures.
