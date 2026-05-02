# Working

How Q loops through a task.

## Purpose

Define the loop that Q works through to complete a task. Each iteration is a fresh Worker that reads file state, does one piece of work, and exits. The app keeps the loop going — starting iterations and checking for completion. This spec covers the loop mechanics: starting, checking, stopping, and re-running. It does not cover what Q does within each iteration (that's the working prompt — see [Agent Configuration](agent-config.md)) or what the user sees while Q works (see [Desktop](desktop.md)).

## Entry Point

The user approves the working plan in the Desktop (see [Planning](planning.md)). Approval triggers the app to start the working loop.

## The Loop

Each iteration is a fresh Worker instance. No state carries over except what's on the filesystem.

1. **App starts iteration** — creates a fresh Worker (Opus orchestrator) in working mode
2. **Q does its thing** — reads file state, does work, writes to the filesystem, commits to git (see [Git Layer](git-layer.md)), exits. Within this step, the Opus orchestrator may spawn parallel subagents for file reading, reference material scanning, and content generation — Opus handles decisions, synthesis, and quality judgment (see [Agent Configuration](agent-config.md))
3. **App checks git log** — runs `git log --format='%s' -1 -- tasks/{taskName}` and checks if the latest commit message contains `[done]`
4. **If `[done]` found** — loop ends, Q is done
5. **If not `[done]`** — check iteration count against `MAX_ITERATIONS` (20). If at the limit, write `status: 'stopped'` with `error: 'Iteration limit reached'` to `.run.json` and close the stream. Otherwise, go to step 1

The app does not tell Q what to do within an iteration. Q reads the working plan, checks what exists, decides what to work on, does it, and exits. That's the prompt's job (see [Agent Configuration](agent-config.md)).

### Implementation note

This is a while loop, not a state machine. Don't overbuild it.

```
while (not done && not stopped && under max iterations) {
  run one Worker iteration via query()
  check if [done] in latest git commit message → done
}
write final status to .run.json
```

`.run.json` is a status file that says "planning", "working", "completed", or "stopped" so the UI knows what to show. Write it at the start, update iteration count after each iteration, write final status at the end. That's it.

Edge cases like HMR killing module state during dev or stale `.run.json` on server restart are handled by `clearStaleRun()` — if `.run.json` says working but no loop is active, it writes `status: 'stopped'` with `error: 'Run lost (server restarted)'`. The stop endpoint detects this automatically; no manual recovery needed.

### Why Fresh Instances

Each iteration creates a new Worker — no state carries over except what's on the filesystem. This is the core Ralph Wiggum principle.

- **No context bloat** — each Worker starts clean, reads file state
- **No context rot** — long conversations don't degrade quality
- **Right-sized work** — each iteration does one thing well
- **Auditable** — each step is a separate git commit
- **Subagent context gone too** — any subagents spawned within an iteration are also discarded between iterations, which is fine — each iteration starts clean

If one iteration goes wrong, it doesn't poison the next.

## Completion

The completion signal is `[done]` in the final git commit message. Q includes it when it has written all deliverables to `outputs/` and considers the task done. It's a deliberate act — the same commit Q is already making, with `[done]` appended to the message subject.

The app checks after each iteration by running `git log --format='%s' -1 -- tasks/{taskName}` and checking if the output contains `[done]`. One shell command, no custom file format, no separate write. The working plan is for the human (see [Planning](planning.md)). `[done]` is for the app.

## Iteration Limit

Hardcoded at 20 iterations (`MAX_ITERATIONS` in `lib/constants.ts`). A safety valve — if Q hasn't written `[done]` after 20 iterations, the loop halts and writes `status: 'stopped'` with `error: 'Iteration limit reached'` to `.run.json`. The user sees this in the Desktop and can start a new run with a tighter plan or different approach.

This is not expected behavior. Well-scoped plans should complete within the limit. If Q is hitting the limit, the plan is too broad or Q is stuck — either way, human judgment is needed.

## No-Progress Stop

A second safety valve, tighter than the iteration limit. The working prompt mandates a `git commit` per iteration. If the latest commit touching `tasks/{taskName}/` doesn't advance for 2 consecutive iterations, the loop halts and writes `status: 'stopped'` with `stopReason: 'no_progress'` to `.run.json`.

After each iteration (success or error path), the loop reads `git log --format=%H -1 -- tasks/{taskName}` and compares the SHA to the one captured at the start. Same SHA → "stale" counter increments; new SHA → counter resets. When the counter hits 2, the run stops early.

Why a separate signal from `iteration_limit`:

- **Catches stuck runs cheaper.** A confused or already-finished agent that keeps iterating without committing burns ~$0.40/iter for nothing. No-progress catches it after iter 2 instead of iter 20.
- **More diagnosable.** `iteration_limit` reads as "Q needed more iterations." `no_progress` reads as "Q stalled" — different remediation. The first suggests scope; the second suggests the plan is exhausted or the agent is confused.
- **Hardened, not heuristic.** The check is binary (commit advanced or not), so it doesn't kill good runs. A working agent commits every iteration per the prompt.

Threshold of 2 (not 1) tolerates a single iteration that errored before commit — fresh-context retry can self-heal one bad iteration. Two in a row indicates a real problem.

**Watch for in the wild:** if `no_progress` fires on legitimate runs, the candidates are (a) the agent intentionally not committing because it had nothing to add — but the working prompt forbids this; (b) commits landing somewhere outside `tasks/{taskName}/` so `git log -- <path>` doesn't see them — possible if the agent edits stream-level files; (c) network/SDK errors before commit twice in a row — rare. If false positives appear, the fix is to widen the path the check looks at, not to weaken the threshold.

## What Q Produces

- **Working artifacts** in `working/` — Q's breadcrumbs. Extracted facts, draft sections, analysis notes. These show Q's process, not just its output. The detail of what artifacts look like is the prompt's job.
- **Final outputs** in `outputs/` — the deliverables. The files that matter over time.

Git history is the progress trail. Each iteration's commit message describes what was done; commit timestamps record when. Q (and humans) can run `git log -- tasks/{taskName}` to see the full sequence of steps.

## Stopping

### User Can Stop at Any Time

The island has a stop button (visible whenever Q is working). When the user clicks stop:

1. The app calls `abortController.abort()` — this immediately terminates the current SDK query
2. The loop halts — no new iteration starts
3. Whatever was written before the abort persists. Git commits that completed are preserved.

Stopping is not an error — it's how you manage the loop.

### After Stopping

The user can teach Q what to change (see [Learning](learning.md)), generate a new plan for the same task (see [Planning](planning.md)), approve it, and start a new run.

## Fresh Run Model

Each new run starts fresh:

- `working/` and `outputs/` are cleared at the start of each new run
- When re-planning (`mode: 'planning'`), `plan.md` is also deleted so Q starts without bias from the previous plan
- When restarting from plan (`mode: 'working'`), `plan.md` is restored to the version the user approved — because Q mutates `plan.md` during working to track progress, and a restart should reset to the approved baseline. Mechanism: `git log --grep='Plan accepted'` finds the approval commit, `git restore --source={hash}` resets the file. Best-effort — if no commit is found, the current plan is left as-is.
- Git preserves the previous state — nothing is truly lost
- The new run uses the latest playbook, specs, and working plan

## Errors

The loop keeps running on agent errors. Each iteration is fresh — if one fails, the next reads file state and figures it out. In many cases, fresh context self-heals problems that confused the previous iteration. The one exception is auth errors (invalid or revoked API key) — these terminate the loop immediately and clear stored credentials, since they won't self-heal across iterations.

If Q is stuck in a loop of failures, the user stops it. That's the human-in-the-loop value — the user is watching and can intervene.

Rate limit errors (429) are handled at the infrastructure level with retry and backoff before they reach the loop. That's the app being a responsible API client, not loop behavior.

## Client Disconnection

The working loop runs server-side and does not depend on the client connection. If the client disconnects (browser tab closed, network issue), the loop continues. When the client reconnects, it reads current file state from the filesystem via the API routes (see [Data Flow](data-flow.md)).

**Stream writes are fire-and-forget.** The loop writes SDK events to the `TransformStream` for client liveness, but never `await`s the write. `TransformStream` applies backpressure when the readable side isn't consumed — if the loop awaited writes, a disconnected client (or an unconsumed readable side) would hang the loop indefinitely. Instead, writes are non-blocking: `writer.write(chunk).catch(() => {})`. Events may be dropped under backpressure; this is acceptable because the stream is a liveness signal, not a durable log. The client reads authoritative state from the filesystem via SWR on reconnect.

## Server Orchestration

How the app starts, monitors, stops, and reconnects to the working loop over HTTP. Uses the same two patterns as the rest of the app: SDK streaming for real-time liveness, filesystem + SWR for state.

### API Endpoints

Four routes under `app/api/run/`:

**`POST /api/run/start`** — Starts the working loop for a task. Returns immediately — the loop runs in the background as a detached async function. Clears `working/` and `outputs/` (fresh run model). When `mode` is `'planning'`, also deletes `plan.md` so Q plans from scratch. Writes `.run.json`. When called with `mode: 'planning'`, writes `status: 'planning'` to `.run.json`. When called with `mode: 'working'`, writes `status: 'working'`.

```
Request:  { stream?: string, task: string, mode: 'discovery' | 'planning' | 'working' }
Response: { status: 'discovering' | 'planning' | 'working' }
409:      { error: 'Run already active' }
```

**`POST /api/run/stop`** — Idempotent stop with stale run recovery. Accepts an optional `{ stream, task }` body for validation (returns 409 if the active run belongs to a different stream/task). Three response paths:

1. **Active run** — calls `abortController.abort()` to terminate the current SDK query immediately. Returns `{ status: 'stopping' }`.
2. **Stale run** — no server-side process, but `.run.json` says `working` or `planning` (e.g., after HMR killed the loop). Calls `clearStaleRun()` which writes `status: 'stopped'` with `error: 'Run lost (server restarted)'` to `.run.json`. Returns `{ status: 'cleared_stale' }`.
3. **No run** — no active run, no stale state. Returns `{ status: 'no_run' }`.

Partial writes persist on disk — the filesystem is the state, git preserves history.

**`POST /api/run/answer`** — Submits user answers during discovery Q&A. Thin wrapper that calls `submitAnswer(sessionId, answers)` on the pending-questions store, resolving the blocked `canUseTool` promise. The server knows the active discovery session ID from module-level state — the client doesn't need to provide it. Returns 404 if no discovery session is waiting for answers. See [Discovery](discovery.md).

```
Request:  { answers: Record<string, string> }
Response: { status: 'answered' }
404:      { error: 'No pending question' }
```

**`GET /api/run/stream`** — SDK message stream for the active run. Same pattern as the chat route (`POST /api/chat`): the server pipes SDK messages from the current iteration's `query()` call through a `ReadableStream`. The `SDKResultMessage` that ends each iteration's `query()` call serves as the iteration boundary — the client receives it, calls `mutate` on the task content SWR key to pick up updated files, and then sees SDK messages from the next iteration begin. When the run ends, the stream closes. The client connects for real-time liveness; disconnecting does not stop the loop.

**`GET /api/run/active`** — Returns the currently active run info or null. Used by the chat composer to detect when Q is busy (one mode at a time constraint — see [Agent Configuration](agent-config.md)). Calls `getActiveRunInfo()` from `lib/run/loop.server.ts`.

```
Response: { stream: string, task: string } | null
```

### Run State: `.run.json`

Run state lives on the filesystem at the task root — `{task}/.run.json`. Written by the loop, read by the client via SWR (through the task content API). No in-memory state object, no `lib/run-state.ts`. This is the same `.run.json` written during planning — see [Planning](planning.md) for the planning-phase states and failure contract. The `RunInfo` interface below covers all phases.

```typescript
/** Metrics for a single phase invocation (discovery, planning, or one working iteration). */
interface PhaseRecord {
  phase: 'discovery' | 'planning' | 'working'
  iteration?: number // Working iterations only (1, 2, 3...). Absent for discovery/planning.
  sessionId: string // SDK session UUID — used to open session transcript
  costUsd: number
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  contextWindow?: number
  contextWindowUsedPct?: number
}

interface RunInfo {
  status:
    | 'queued'
    | 'discovering'
    | 'planning'
    | 'plan_ready'
    | 'working'
    | 'completed'
    | 'stopped'
  stoppedDuring?: 'discovery' | 'planning' | 'working'
  queuedAt?: string // ISO 8601 — set when status is 'queued'
  stopReason?: 'budget' | 'user' | 'error' | 'iteration_limit' | 'no_progress'
  startedAt: string // ISO 8601 timestamp
  lastIterationAt: string // ISO 8601 timestamp, updated after each phase/iteration
  error: string | null
  costUsd?: number // Cumulative total across all phases
  phases: PhaseRecord[] // Append-only log — one entry per discovery, planning, each working iteration
  pendingQuestions?: object // Current AskUserQuestion input, if discovery is waiting for answers
}
```

Each phase appends a `PhaseRecord` when it completes. The panel reads `phases.find(p => p.phase === 'discovery')?.durationMs` for "Discovered 18s", `phases.find(p => p.phase === 'planning')?.durationMs` for "Planned 3m", and `phases.filter(p => p.phase === 'working')` for working iterations. No positional guessing. Session transcripts are opened via `phases[n].sessionId`.

> **Migration note:** This replaces the previous `planningCostUsd`, `planningSessionId`, `workingSessionIds`, and `iterations` fields. Existing `.run.json` files with the old shape will need a compatibility shim or one-time migration. This refactor is a prerequisite for discovery — see [Discovery](discovery.md).

The loop writes `.run.json`:

- On start: `{ status: 'working', iteration: 0, ... }`
- After each iteration: updates `iteration` and `lastIterationAt`
- On terminal state: updates `status` to `completed` or `stopped` (with optional `error` and `stopReason` fields for diagnostics)

One run at a time per task. Start reads `.run.json` to check — if `status` is `planning`, `plan_ready`, `working`, or `queued` for this task, returns 409. Terminal states are overwritten by a new start. Budget-stopped runs (`stopReason: 'budget'`) auto-resume without clearing working files; other stopped runs require explicit `resume: true` to preserve state. When the global concurrency limit is reached, the run queues instead of failing — see [Concurrency](concurrency.md).

### State Machine

Eight states. No error state — if the loop crashes, status is `stopped` with the `error` field populated.

| Status        | Entry trigger                                                     | Desktop renders                                                                                                                                                                                                                       | User actions                                       |
| ------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `queued`      | Start Task when concurrency limit reached                         | Task card shows "Queued". Auto-starts when a slot opens.                                                                                                                                                                              | Stop button (cancels queue entry).                 |
| `discovering` | Start Task clicked / Start button clicked / dequeued              | Island shows discovery activity; questions render in island when Q asks. See [Discovery](discovery.md).                                                                                                                               | Stop button (in island).                           |
| `planning`    | Discovery completes (auto-transition) / restart from plan         | Island shows planning activity (spinner, activity steps).                                                                                                                                                                             | Stop button (in island).                           |
| `plan_ready`  | Planning agent completes successfully                             | Plan auto-opens as window. PlanApproval replaces island.                                                                                                                                                                              | Approve (starts working) or open sidebar to teach. |
| `working`     | Approve clicked / Start button clicked (after planning completes) | Island shows activity steps, task icons show files.                                                                                                                                                                                   | Stop button (in island).                           |
| `completed`   | `[done]` found in git commit message                              | All files listed, outputs viewable.                                                                                                                                                                                                   | Start button (restart from scratch).               |
| `stopped`     | User stop, crash, iteration limit, no-progress, or billing limit  | Progress shows what completed. Error field shown if present. `stopReason` discriminates the cause: `budget` shows Continue + upgrade prompt (violet); `user`/`error`/`iteration_limit`/`no_progress` show Restart + Continue (amber). | Continue (resumes) or Restart (from scratch).      |

Transitions: `queued → discovering → planning → plan_ready → working → completed` is the happy path. Discovery auto-transitions to planning (server-driven, no user action — see [Discovery](discovery.md)). `queued` transitions to `discovering` or `planning` automatically when a concurrency slot opens (see [Concurrency](concurrency.md)). Any state can transition to `stopped` via user stop, error, or billing limit. `stopReason` captures why: `'budget'` (billing limit), `'user'` (user clicked Stop), `'error'` (crash/auth failure), `'iteration_limit'` (hit max iterations), `'no_progress'` (agent committed nothing for 2 consecutive iterations — see [No-Progress Stop](#no-progress-stop)). Budget stops auto-resume on Continue; other stops require explicit `resume: true`. `stoppedDuring` records which phase was active when stopped.

### Minimal In-Memory State

The loop uses a small set of in-memory variables in `lib/run/loop.server.ts`. No run-state object, no class — just the variables needed for the single active run, stored on `globalThis` via `Symbol.for()` to survive Next.js dev-mode bundle isolation (same pattern as `active-sessions.ts`).

```typescript
// lib/run/loop.server.ts — accessed via getState()
interface RunLoopState {
  abortController: AbortController | null // Passed to each query(), used for stop
  subscribers: Set<WritableStreamDefaultWriter> // Fan-out to GET /api/run/stream clients
  streamActive: boolean // Whether a run is active (gates subscriber creation)
  loopPromise: Promise<void> | null // The detached async loop
  starting: boolean // Synchronous guard against concurrent startRun calls
  activeRunStream: string | null // Current run's stream name (powers GET /api/run/active)
  activeRunTask: string | null // Current run's task name
}
```

**Why `globalThis`?** In Next.js dev mode, API routes are lazily compiled into separate bundles. Bare `let` variables at module scope get duplicated — `/api/run/start` and `/api/run/stream` each get their own copy, so `startRun()` sets `streamActive = true` in one instance while `getActiveStream()` reads `false` from another. `globalThis` with `Symbol.for()` ensures a single shared state object across all bundles. This applies to any server-side singleton that multiple API routes need to share.

**Concurrent runs.** The singleton `RunLoopState` becomes a `Map<string, RunLoopState>` keyed by task slug when concurrent task runs are enabled. See [Concurrency](concurrency.md) for the registry design, API route changes, and subscriber fan-out per run.

The `abortController` is passed to each `query()` call. The subscribers set lets `GET /api/run/stream` create independent fan-out streams. `activeRunStream`/`activeRunTask` power `GET /api/run/active` (used by the chat composer's busy state). Each `query()` also receives `maxBudgetUsd` as a cost safety net — prevents runaway API costs on a single stuck iteration.

### Stop Mechanism

1. User clicks stop → client sends `POST /api/run/stop`
2. Server calls `abortController.abort()` — this **immediately** terminates the current SDK query. No waiting for the iteration to finish. Stop means stop.
3. Client shows "Stopping..." immediately (optimistic UI)
4. The aborted `query()` throws an `AbortError` — the loop catches it, writes `.run.json` with `status: 'stopped'`, and closes the stream
5. Client detects stream closed → refetches task content via SWR → sees `stopped` in `.run.json`

### Client Reconnection

Client reads `.run.json` via SWR (through the task content API). If `status` is `working`, connects to `GET /api/run/stream` for live activity. If terminal, reads filesystem state — no replay, no event history needed.

**404 retry**: There is a brief window between the client's optimistic update (showing a run as active) and the server's loop initialization (stream endpoint becoming available). During this window, `GET /api/run/stream` returns 404. The `useRunActivity` hook retries with a 2-second delay (`RECONNECT_DELAY_MS = 2000`). Retries stop when `isActive` becomes false (the run ended or the user navigated away).

### Activity Steps

The client tracks tool activity during a run to give the user ambient awareness of what Q is doing. The `useRunActivity` hook (`components/features/desktop/hooks/use-run-activity.ts`) connects to `GET /api/run/stream`, processes NDJSON events, and maintains an `activitySteps` array.

```typescript
interface ActivityStep {
  toolUseId: string // SDK tool_use block ID (or '__thinking__' for thinking)
  toolName: string // Raw tool name (e.g., "Read", "Write", "Bash")
  label: string // Human-readable label via getToolLabel()
  detail: string | null // File path, pattern, or action detail
  linesAdded: number | null // Running line count for Write/Edit (null for other tools)
  elapsedSeconds: number // Time since tool started
  isActive: boolean // True while tool is still running
}
```

Steps are derived primarily from **`partial`** stream events (`includePartialMessages: true` on planning/working agents), which carry SDK `StreamEvent` subtypes. This enables detail extraction _before_ a tool completes — the user sees what Q is doing as it starts, not after it finishes.

**Thinking step tracking.** A stable `__thinking__` step is created on `content_block_start` with type `'thinking'` or `'text'`. This shows in the island during Claude's thinking phase. The thinking step is marked inactive when the first tool execution begins.

**Early detail extraction.** As partial JSON accumulates from `content_block_delta` events, `extractPartialDetail()` uses regex to extract:

- `file_path` → basename (Read, Write, Edit)
- `pattern` → literal string (Glob, Grep)
- `description` → first 50 chars, preferred over `command` (Bash)
- `query` → quoted string (WebSearch)
- `url` → hostname (WebFetch)

**Parallel tool merging.** When multiple identical tool calls stack (e.g., 3 parallel Reads), they merge into a single activity step rather than flashing multiple steps. The decision is made at `tool_use` block creation: if the previous step has the same `toolName` and hasn't yet received a `tool_progress` event, the new block routes to the existing step. Details from merged blocks are joined with ", " separators.

**Line count tracking.** For Write and Edit tools, `extractLineCount()` scans partial JSON for `"content":"` or `"new_string":"` fields and counts `\n` escape sequences. Per-block counts are stored in a ref and summed across merged blocks to produce the `linesAdded` field — displayed in the island as "+N lines added".

Fallback: `assistant` events provide authoritative detail via `getToolDetail()` when the full tool_use block is available, overriding partial extractions. `tool_progress` events still create/update steps as a secondary signal. On a `result` event (iteration boundary), steps are cleared — each iteration starts fresh.

The island's `TaskWorkingContent` renders the most recent step's label and detail as a compact status line. Hidden tools (where `getToolLabel` returns null) are excluded from the display. See [Island](island.md) for the visual treatment.

## Design Decisions

**Q does the work, the app keeps the loop going.** The Worker is stateless — it reads files, does work, writes files, and exits. The app holds the loop state (completion marker, user stop signal) and decides whether to continue. This separation means Q doesn't need to be trusted with loop control.

**Fresh instance per iteration.** Prevents context bloat and context rot. Each iteration starts clean by reading file state, not by remembering what happened before. Each step is auditable — Q commits to git before exiting.

**`[done]` in the commit message as completion signal, not plan parsing.** The working plan is for the human — it shows intent and surfaces assumptions. `[done]` in the final commit message is for the app — it's an intentional signal in the place Q already writes to. No extra file, no custom format. Q reads `git log` to understand what's been done in previous iterations; the app reads `git log` to detect completion. One mechanism, two uses.

**Keep running on errors.** Each iteration is fresh. If one fails, the next reads state and tries to figure it out. This is more resilient than halting — fresh context often self-heals the problem. Detecting "failure" is itself complex (what counts? exit code? nothing written? an exception?) and adds a category of bugs. The user watches and stops if Q is stuck.

**Immediate stop via `abortController`.** When the user clicks Stop, the app calls `abortController.abort()` which immediately terminates the current SDK query. Files written before the abort are preserved on disk. Git commits that completed before the abort are preserved. A partially-written file or uncommitted change is acceptable — the user can restart the run (which clears `working/` and `outputs/`) or continue from the current state. The alternative — waiting for the iteration to finish — means the user clicks Stop and watches Q keep working for potentially minutes. That's not stop.

**Cost safety via `maxBudgetUsd`.** Each `query()` call receives a `maxBudgetUsd` option — a per-iteration cost cap. If Q gets stuck reasoning in circles within a single iteration, the SDK stops at the budget limit instead of burning credits indefinitely. Set once in configuration, forget about it. Complements `MAX_ITERATIONS` (which caps iteration count, not cost per iteration). This same mechanism enforces billing limits: `canStartTask()` returns `remainingMinutes`, converted to USD and passed as `maxBudgetUsd`. When the budget is exhausted, the SDK returns `error_max_budget_usd` and the loop writes `status: 'stopped'` with `stopReason: 'budget'` — replacing the old polling-based `checkMidRunLimit()` approach. See [Billing](billing.md) for details.

**Detached async function, not a queued job.** With a single local user, a background promise is the simplest approach. The start route kicks off the loop and returns immediately. No job queue, no worker threads. The function captures its own abort controller and stream reference.

**SDK streaming for liveness, filesystem for state.** The working loop already calls `query()` per iteration — that stream is the real-time signal. `.run.json` is the state. The client connects to `GET /api/run/stream` for live activity (same shape as the chat route) and reads `.run.json` via SWR for status.

**Run state on disk, not in memory.** `.run.json` at the task root replaces in-memory run state. Written by the loop, read by the client via SWR. Survives server restart — eliminates the "lost on restart" edge case that the in-memory approach accepted.

**Max iteration limit as safety valve.** Hardcoded at 20 (`MAX_ITERATIONS`). Prevents runaway loops from burning API credits indefinitely. Not a substitute for well-scoped plans — it's a guardrail. Distinct from user stop (intentional) and `[done]` completion (success) — the iteration limit sets status to `stopped` with an error message telling the user "Q didn't finish" so they can investigate and adjust.

**Fresh run after feedback.** `working/` and `outputs/` are cleared for each new run. Partial resume is complex and error-prone. A clean slate with updated knowledge is predictable. Git preserves history of all past runs, so nothing is lost.

## Acceptance Criteria

- [x] Approval button in Desktop starts the working loop (see [Planning](planning.md))
- [x] Each iteration gets a fresh Worker instance (no accumulated context)
- [x] Q commits to git as part of each iteration (see [Git Layer](git-layer.md)) _(prompt scope, not loop implementation — `prompts/working.md` line 14 instructs `git add -A && git commit`)_
- [x] App checks git log for `[done]` after each iteration; loop ends when found
- [x] Loop halts after 20 iterations if `[done]` not found; writes `status: 'stopped'` with `error: 'Iteration limit reached'` to `.run.json`
- [x] Loop halts early with `stopReason: 'no_progress'` when the latest commit on `tasks/{taskName}/` doesn't advance for 2 consecutive iterations
- [x] Loop continues on agent errors — fresh iteration, fresh context
- [x] User can stop the loop at any time; `abortController.abort()` terminates the current iteration immediately
- [x] After stopping, user can start a new plan + run for the same task (via "No, start over" in plan approval or restart from sidebar)
- [x] New runs start fresh — `working/` and `outputs/` cleared, git preserves history
- [ ] Rate limit errors (429) retried with backoff at the infrastructure level _(SDK/infrastructure scope — deferred)_
- [x] Client disconnection does not terminate the server-side working loop
- [x] One working loop at a time per task (multiple tasks can run concurrently — see [Concurrency](concurrency.md))
- [x] `POST /api/run/start` writes `.run.json`, starts loop asynchronously; returns 409 if already active
- [x] `POST /api/run/stop` calls `abortController.abort()` to immediately terminate the current iteration
- [x] Each `query()` call receives `maxBudgetUsd` as a per-iteration cost safety net
- [x] `.run.json` written at task root; updated after each iteration and on terminal states
- [x] `GET /api/run/stream` pipes SDK messages from current iteration to client (same pattern as chat route)
- [x] Client reads `.run.json` via SWR for run status; connects to stream for live activity
- [x] Server restart with stale `working` status in `.run.json` does not block new runs
      For visual details of the working, completed, and stopped phases (Qutie expressions, stop button, progress animation, file tree, status line), see [Desktop](desktop.md).

## Testing

Run loop — working mode (`lib/run/loop.server.test.ts`):

- [x] Iterative loop with `[done]` completion detection in git log (`lib/run/loop.server.test.ts`)
- [x] MAX_ITERATIONS (20) safety valve halts loop (`lib/run/loop.server.test.ts`)
- [x] No-progress stop fires when 2 consecutive iterations don't advance the task's git head (`lib/run/loop.server.test.ts`)
- [x] Error continuation — fresh iteration after failure (`lib/run/loop.server.test.ts`)
- [x] No `[done]` in git log → loop continues to next iteration (`lib/run/loop.server.test.ts`)
- [x] Concurrent run prevention (409) (`lib/run/loop.server.test.ts`)
- [x] Fresh run model — working/ and outputs/ cleared (`lib/run/loop.server.test.ts`)
- [x] `stopRun` aborts controller, module state cleanup (`lib/run/loop.server.test.ts`)
- [x] NDJSON stream output to client (`lib/run/loop.server.test.ts`)
- [x] Per-iteration cost budget via maxBudgetUsd (`lib/run/loop.server.test.ts`)
- [x] `startedAt` consistency across iterations (`lib/run/loop.server.test.ts`)

SDK message filtering (`lib/run/filter.server.test.ts`):

- [x] `filterMessage` converts stream_event, assistant, tool_progress, result types (`lib/run/filter.server.test.ts`)
- [x] `stripMcpPrefix` removes mcp**{server}** from tool names (`lib/run/filter.server.test.ts`)
- [x] `encodeEvent` produces valid NDJSON (`lib/run/filter.server.test.ts`)
- [x] Immutability of original SDK messages (`lib/run/filter.server.test.ts`)

API routes:

- [x] POST /api/run/start validates mode, checks task existence, returns 409 (`app/api/run/start/route.test.ts`)
- [x] POST /api/run/stop handles race conditions (`app/api/run/stop/route.test.ts`)
- [x] GET /api/run/stream returns NDJSON with correct headers (`app/api/run/stream/route.test.ts`)
- [x] GET /api/run/active returns active run info or null (`app/api/run/active/route.test.ts`)

Not tested (deferred or by design):

- Rate limit (429) retry with backoff (spec marks as deferred)
- Client disconnection not terminating server loop (fire-and-forget write pattern)
- `.run.json` persistence across server restart (`clearStaleRun` recovery)

## Edge Cases

- **User stops immediately after starting**: Whatever was written so far persists. User can re-run.
- **User stops then immediately restarts**: Previous loop must be fully stopped before a new one begins.
- **Q writes `[done]` but outputs/ is empty**: Treat as done — Q decided the task was complete. The user can review and re-run if they disagree.
- **Server restart during a run**: `.run.json` persists with `status: 'working'` but no loop is active. On next start attempt, the app detects no active loop and allows a new run. Files from the previous run persist; git preserves history.
- **Client reconnects mid-run**: Client reads current file state from the API. The loop is unaffected.
- **Worker iteration hangs**: `maxBudgetUsd` cost cap catches runaway iterations — the SDK stops the query when the budget is exhausted. Treated as an error — loop continues with a fresh iteration. The user can see the error in `.run.json` and stop if it keeps happening.
- **Q hits iteration limit**: Loop halts. Whatever was written persists. User reviews partial output in Desktop, can refine the plan and start a new run.

## Constraints

- One working loop at a time per task. Multiple tasks can run concurrently — see [Concurrency](concurrency.md).
- Fresh run after feedback (no partial resume).
- Q commits to git each iteration — the prompt governs this, not the app (see [Git Layer](git-layer.md)).
- Q reads stream-level content (playbook, specs, samples) each iteration via workspace-relative paths (e.g., `acme-client/playbook.md`) — CWD is workspace root, no symlinks. Always using the latest.
- Runs locally only.
- The app does not modify Q's output — it only runs the loop.
