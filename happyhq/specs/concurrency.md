# Concurrency

How Q handles multiple simultaneous task runs and concurrent chat sessions.

## Purpose

Define the concurrency model for task runs and chat. Currently the app enforces a single active run globally and blocks the chat composer while streaming. This spec lifts both constraints: multiple tasks can run concurrently, and chat operates without artificial blocking.

## Concurrency Model

Two concerns, two rules:

**Task runs** — one run per task, multiple tasks concurrently. A task cannot have two runs at once (planning or working), but different tasks can run in parallel. The global concurrency limit is tier-gated:

| Tier    | Concurrent runs |
| ------- | --------------- |
| Free    | 1               |
| Starter | 2               |
| Pro     | 3               |
| Max     | Unlimited       |

On local deployments the real cap is machine resources — CPU, memory, API rate limits. In a future cloud mode with VMs-per-task, the artificial cap goes away entirely; each task gets its own compute.

**Chat** — unlimited concurrent sessions. The human is the slowest part. Multiple chat windows already work independently (each has its own store and session). Within a single chat, the user can send while Q is responding — the message queues and Q processes it after the current turn.

## Task Runs: Backend State

### Current: Singleton

`lib/run/loop.server.ts` stores one `RunLoopState` on `globalThis`. Every field assumes a single active run:

```typescript
interface RunLoopState {
  abortController: AbortController | null
  subscribers: Set<WritableStreamDefaultWriter<Uint8Array>>
  streamActive: boolean
  loopPromise: Promise<void> | null
  starting: boolean
  activeRunStream: string | null
  activeRunTask: string | null
}
```

### New: Map-Keyed Registry

Replace the singleton with a registry keyed by task slug (per-task concurrency is 1, so task slug is a unique key):

```typescript
interface RunRegistry {
  runs: Map<string, RunLoopState> // taskSlug → RunLoopState
  starting: Set<string> // taskSlugs with in-flight starts (TOCTOU guard)
}
```

Each `RunLoopState` keeps its own `abortController`, `subscribers`, `loopPromise`, and metadata (`activeRunStream`, `activeRunTask`). The `streamActive` boolean stays per-run.

### Function Changes

| Function                      | Current                                    | New                                                                                              |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `startRun(stream, task, ...)` | Checks singleton, throws if any run active | Checks `runs.has(task)` for per-task guard, checks `runs.size < MAX_CONCURRENT` for global limit |
| `stopRun()`                   | Aborts the singleton controller            | `stopRun(task)` — aborts the specific run's controller                                           |
| `getActiveStream()`           | Returns the singleton stream               | `getActiveStream(task)` — returns the specific run's subscriber stream                           |
| `getActiveRunInfo()`          | Returns `{stream, task}` or null           | Returns all active runs: `Array<{stream, task}>`                                                 |
| `isRunActive()`               | Checks singleton                           | `isRunActive(task?)` — with arg checks specific task, without arg checks if any run is active    |
| `broadcast()`                 | Writes to global subscriber Set            | `broadcast(task, chunk)` — writes to the specific run's subscriber Set                           |

The `starting` guard becomes `Set<string>` — multiple tasks can be in the start phase simultaneously without TOCTOU races, as long as each task slug appears at most once.

### Concurrency Limit Enforcement

```typescript
function startRun(stream: string, task: string, ...): void {
  const r = getRegistry()

  // Per-task guard (409)
  if (r.runs.has(task) || r.starting.has(task)) {
    throw new Error(`Run already active for ${task}`)
  }
  if (r.queue.some((q) => q.task === task)) {
    throw new Error(`Run already queued for ${task}`)
  }

  // Global limit — queue instead of rejecting
  const limit = getConcurrencyLimit(userId)  // from billing tier
  if (r.runs.size >= limit) {
    enqueueRun({ stream, task, mode, userId, resume })
    return  // writes .run.json with status: 'queued'
  }

  r.starting.add(task)
  // ... async setup, then r.starting.delete(task) and r.runs.set(task, state)
}
```

## Task Runs: API Route Changes

All four `/api/run/*` routes need updates:

**`POST /api/run/start`** — already receives `{ task }`. Changes: per-task 409 (this task already running or queued). When the global limit is reached, the run queues and returns `{ status: 'queued' }`. Only returns 429 if the queue itself is full (10 items).

```
200: { status: 'planning' | 'working' }     // started immediately
200: { status: 'queued' }                    // concurrency limit, queued for later
409: { error: 'Run already active for {task}' }
429: { error: 'Queue full' }                 // queue at 10, something is wrong
```

**`POST /api/run/stop`** — already receives `{ stream, task }`. Changes: stops the specific run by task key. Returns 404 if that task has no active run (instead of checking a singleton).

**`GET /api/run/stream`** — needs `?task=<slug>` query parameter to subscribe to the correct run's fan-out stream. Without it, returns 400. Each client still gets an independent `TransformStream`.

**`GET /api/run/active`** — returns all active runs instead of one:

```typescript
// Current
Response: { stream: string, task: string } | null

// New
Response: Array<{ stream: string, task: string }>  // empty array = no active runs
```

The chat composer's busy check changes from "is anything running → disable" to reading the array for informational display.

## Task Runs: Subscriber Fan-Out

Currently a single global `Set<WritableStreamDefaultWriter>`. Moves inside each `RunLoopState`:

```typescript
// Each run has its own subscribers
interface RunLoopState {
  // ...
  subscribers: Set<WritableStreamDefaultWriter<Uint8Array>>
}

function broadcast(task: string, chunk: Uint8Array): void {
  const run = getRegistry().runs.get(task)
  if (!run) return
  for (const writer of run.subscribers) {
    writer.write(chunk).catch(() => {
      writer.close().catch(() => {})
      run.subscribers.delete(writer)
    })
  }
}
```

Clients connect to `GET /api/run/stream?task=<slug>` and receive only that run's events. No cross-talk between concurrent runs.

## Run Queue

When a user starts a task and the concurrency limit is reached, the run queues instead of failing. The user sees "Queued" — the task auto-starts when a slot opens.

### Queue State

The queue lives on the same `globalThis` registry (survives HMR):

```typescript
interface QueuedRun {
  stream: string
  task: string
  mode: 'planning' | 'working'
  userId?: string
  resume?: boolean
  queuedAt: string // ISO 8601
}

interface RunRegistry {
  runs: Map<string, RunLoopState>
  starting: Set<string>
  queue: QueuedRun[] // FIFO, bounded
}
```

Bounded at 10 items. If the queue is full, return 429 — at that point something is wrong.

### Enqueue

When `startRun()` finds the global limit reached but the per-task guard passes (this task isn't already running or queued):

1. Push a `QueuedRun` entry to the queue
2. Write `.run.json` with `status: 'queued'` and `queuedAt` timestamp
3. Return `{ status: 'queued' }` to the client (not 409 or 429)

The API route returns immediately — no blocking, no polling.

### Dequeue

The dequeue trigger is the `finally` block in `runLoop()` — the single exit point where every run cleans up state. After clearing the finished run's entry from the registry:

```typescript
finally {
  // ... existing cleanup (close subscribers, null out state) ...
  registry.runs.delete(task)

  // Dequeue next
  const next = registry.queue.shift()
  if (next) {
    // Fire-and-forget — startRun handles its own errors
    startRun(next.stream, next.task, next.mode, next.userId, next.resume)
      .catch((err) => console.error('[Q:queue] Failed to start queued run:', err))
  }
}
```

FIFO — first queued, first started. No priority system. The dequeued run goes through the normal `startRun()` path (TOCTOU guard, billing check, `.run.json` update from `queued` → `planning`/`working`).

### `.run.json` Status: `queued`

A new status value in `RunInfo`:

```typescript
status: 'queued' | 'planning' | 'plan_ready' | 'working' | 'completed' | 'stopped'
queuedAt?: string // ISO 8601, set when status is 'queued'
```

The UI reads this via SWR like any other status. Task card shows "Queued" with the queue position or time. When the run starts, `.run.json` transitions to `planning` or `working` — SWR picks up the change on the next poll.

### Stop a Queued Task

`POST /api/run/stop` with a task that's queued (not yet running): remove it from the queue array, write `.run.json` with `status: 'stopped'`, `stopReason: 'user'`. No AbortController involved — it never started.

### Server Restart

Queued items are in-memory — lost on restart. `.run.json` still says `queued` on disk. `clearStaleRun()` detects this (no active loop, no queue entry) and writes `status: 'stopped'` with `error: 'Run lost (server restarted)'`. The user sees the task as stopped and can re-start it. Same recovery path as stale `working` status today.

### Duplicate Prevention

A task cannot appear in both `runs` and `queue` simultaneously. `startRun()` checks both:

```typescript
if (registry.runs.has(task) || registry.starting.has(task)) {
  throw new Error(`Run already active for ${task}`)
}
if (registry.queue.some((q) => q.task === task)) {
  throw new Error(`Run already queued for ${task}`)
}
```

## Git Operations: Simple Retry

### The Problem

Git uses a repo-wide `index.lock` at `~/HappyHQ/.git/index.lock` for any index-mutating operation (`git add`, `git commit`). Two tasks committing simultaneously collide — one fails with `fatal: Unable to create '.git/index.lock': File exists`. This happens even when tasks write to completely separate directories, because the lock is per-repo, not per-directory.

### The Solution

Simple retry with exponential backoff. When any git operation hits an `index.lock` error, retry up to 3 times:

| Attempt | Delay |
| ------- | ----- |
| 1       | 100ms |
| 2       | 200ms |
| 3       | 400ms |

The lock is held for milliseconds (staging + commit is fast for small changesets), so retries almost always succeed on the first attempt.

### Why Retry Over Async Mutex

Q runs git commands via bash tool calls during iterations (`git add -A && git commit`). The app cannot wrap agent-initiated bash commands in a mutex — they happen inside the SDK's tool execution, outside app control. A mutex only covers app-level calls (`commitGitState`, `isTaskCompleted`), leaving agent commits unprotected.

Retry handles both paths:

- **App-level calls** (`commitGitState` in `lib/git/sync.server.ts`) — wrap `execSync` in a retry helper
- **Agent bash calls** — the agent sees the git error in bash output and naturally retries (fresh context, reads error, tries again)

### Why Not Worktrees or Branches

Git worktrees give each task a separate working tree with an independent index file, avoiding the lock entirely. But they add significant complexity: separate directory layout, history merging strategy, path resolution changes across the codebase. All of that to solve a problem that happens rarely and is fixed by waiting 50ms. Not worth it.

### Implementation

A retry wrapper in `lib/git/sync.server.ts`:

```typescript
function execGitWithRetry(command: string, options: ExecSyncOptions): string {
  const delays = [100, 200, 400]
  for (let attempt = 0; ; attempt++) {
    try {
      return execSync(command, options).toString().trim()
    } catch (err) {
      const isLockError = String(err).includes('index.lock')
      if (!isLockError || attempt >= delays.length) throw err
      // Sleep and retry
      Atomics.wait(
        new Int32Array(new SharedArrayBuffer(4)),
        0,
        0,
        delays[attempt],
      )
    }
  }
}
```

Apply to `commitGitState()` and `isTaskCompleted()`. Agent-side retries are natural — the agent reads the bash error and decides what to do. No prompt change needed; the error message is self-explanatory.

## Cost & Billing

### Already Concurrent-Ready

`.run.json` is per-task — each task tracks its own `costUsd`, `iterations[]`, and `planningCostUsd`. No cross-task state. The billing integration (`startTaskRun`, `updateUsage`, `finalizeTaskRun`) already receives `taskName` — multiple in-flight `taskRunId`s work naturally as independent InstantDB records.

### Budget Race Condition

Two runs starting simultaneously both call `canStartTask()` and both see the full remaining budget. Each gets allocated the full remaining minutes, effectively double-spending.

**Solution:** Deduct estimated budget on start, reconcile on finish. When `startRun()` begins, write a tentative usage reservation (e.g., 5 minutes) to the billing record. `canStartTask()` factors in reservations from other active runs. On run completion, the reservation is replaced with actual usage. If a run stops early, the unused reservation is released.

This is the same pattern payment systems use for authorization holds. The exact reservation amount can be tuned — start conservative (the per-iteration `maxBudgetUsd`), adjust based on observed run durations.

### Tier-Gated Concurrency Limit

The concurrency limit is read from the user's billing tier at run start. See the Concurrency Model table above. `getConcurrencyLimit(userId)` queries the subscription and returns the tier's limit. When billing is disabled (local/self-hosted), the limit defaults to unlimited.

## Chat Concurrency

### Multiple Chat Sessions

Per-session isolation already exists in `lib/chat/active-sessions.ts` — a `Map<sessionId, AbortController>` where each session manages its own lifecycle. No architectural change needed. The UI should allow multiple chat windows without mutual interference.

### Send While Streaming

The Agent SDK supports queuing user messages during an active turn via `SDKUserMessage.priority`:

```typescript
type SDKUserMessage = {
  type: 'user'
  message: MessageParam
  priority?: 'now' | 'next' | 'later'
  // ...
}
```

- **`'now'`** — interrupt and process immediately
- **`'next'`** — process after the current turn finishes
- **`'later'`** — low priority, processed when idle

The SDK also provides:

- **`Query.streamInput(stream)`** — feed an `AsyncIterable<SDKUserMessage>` into an active query
- **`SDKSession.send(message)`** — send a message to a persistent session (the `unstable_v2_createSession` API)
- **`cancel_async_message`** — drop a queued message by UUID before it's processed

### Current Behavior

The app uses `query()` per-message with the `isStreaming` flag blocking the composer:

```tsx
<Composer
  disabled={isStreaming}
  placeholder={isStreaming ? 'Q is working...' : '...'}
/>
```

The user cannot type or send while Q responds. Stop is the only interaction.

### Target Behavior

1. **Allow typing while streaming** — remove `disabled={isStreaming}` from the composer input. The user can draft their next message while watching Q's response.
2. **Allow sending while streaming** — the sent message is queued with `priority: 'next'`. Q finishes the current response, then processes the queued message as the next turn. The UI shows the queued message in the chat thread with a "queued" indicator.
3. **Cancel queued messages** — if the user changes their mind, they can delete a queued message before Q processes it (via `cancel_async_message`).

This may involve migrating the chat route from per-request `query()` calls to `streamInput()` on a long-lived query, or adopting the `unstable_v2_createSession` session API for persistent multi-turn sessions. The migration path depends on SDK stability — `streamInput()` is available on the current `Query` object and may be the simpler first step.

## UI Implications

### Already Concurrent-Ready

- **Task cards** — derive `isRunActive` from their own `.run.json` data via SWR. Multiple tasks showing active simultaneously works out of the box.
- **Island** — shows activity for the currently open task. `useRunActivity` connects to a specific task's stream. Works as-is once `GET /api/run/stream` accepts `?task=`.
- **SWR data** — keyed per `(stream, task)`. No cross-talk.

### Needs Work

- **`GET /api/run/stream` route** — needs `?task=` query param. `useRunActivity` hook passes the current task slug.
- **`GET /api/run/active` response shape** — changes from single object to array. Consumer code in the chat composer and elsewhere needs to handle the new shape.
- **Chat composer busy state** — currently checks "is anything running" and disables. Should become informational only — show which tasks are running (e.g., a small badge or status line), but don't block the composer.
- **Visual treatment of multiple concurrent runs** — TBD. The sidebar could show activity badges on running tasks. The island already scopes to the open task. No design needed for a "multi-run dashboard" in v1 — the existing per-task UI handles it.

## Implementation Sequence

1. **Backend state refactor** — `loop.server.ts` singleton → Map-keyed registry + API route updates (start, stop, active, stream)
2. **Git retry** — `sync.server.ts` retry wrapper around `execSync` git calls
3. **Per-run subscriber fan-out** — move `subscribers` Set into each `RunLoopState`, scope `broadcast()` per-run
4. **UI updates** — stream endpoint `?task=` param, `useRunActivity` hook, composer busy state, `/active` response shape
5. **Billing** — concurrent budget reservation, tier-gated limit enforcement
6. **Chat send-while-streaming** — SDK `streamInput()` or session API migration, composer unblock

Steps 1-3 can ship as a single PR. Step 4 is a separate PR. Steps 5-6 are independent and can follow in any order.

### Callsite Map

Every file that needs changes for the backend state refactor (step 1). UI-derived state (SWR-based `isRunActive` on task cards, stores) works automatically — no changes needed there.

**Run loop exports** (`lib/run/loop.server.ts` — signature changes):

| Export               | Consumers                                                       | Change                                         |
| -------------------- | --------------------------------------------------------------- | ---------------------------------------------- |
| `startRun()`         | `app/api/run/start/route.ts`                                    | Already passes task; add queue-or-start logic  |
| `stopRun()`          | `app/api/run/stop/route.ts:34`                                  | Pass `task` parameter                          |
| `isRunActive()`      | `app/api/run/stop/route.ts:33`                                  | Pass `task` parameter                          |
| `getActiveRunInfo()` | `app/api/run/active/route.ts:4`, `app/api/run/stop/route.ts:22` | Returns array; stop route checks specific task |
| `getActiveStream()`  | `app/api/run/stream/route.ts:4`                                 | Pass `task` from `?task=` query param          |

**Client-side** (step 4):

| Consumer                    | File                                                        | Change                                                                          |
| --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Run stream fetch            | `components/features/desktop/hooks/use-run-activity.ts:160` | Add `?task=${taskSlug}` to fetch URL. Already has a TODO comment flagging this. |
| `/api/run/active` consumers | Chat composer busy state                                    | Handle array response instead of single object                                  |

**Git retry** (step 2 — no callsite changes, internal implementation):

`commitGitState()` in `lib/git/sync.server.ts` is called from 19 places — server actions (`lib/actions/tasks.ts`, `streams.ts`, `shared.ts`, `web-input.ts`, `samples.ts`, `ingestion.ts`) and the run start route. The retry wrapper goes inside `commitGitState()` itself, so **no callers need updating**. But note: user-initiated actions (create task, rename stream, delete sample, etc.) also call `commitGitState` and can collide with concurrent agent runs — the retry covers these too.

### Implementation Gotchas

**`plan_ready` occupies a concurrency slot.** A task in `plan_ready` (waiting for user plan approval) counts as an active run — its `RunLoopState` is in the registry with a live `abortController`. If a user starts 3 tasks and all finish planning simultaneously, all 3 sit in `plan_ready` consuming all slots. Queued tasks can't start until the user approves or stops one. This is correct behavior (the run's resources are allocated), but the UI should surface it — e.g., "3/3 slots used — approve or stop a plan to free a slot."

**`clearStaleRun` needs a startup sweep.** Currently `clearStaleRun(task)` is called per-task from the stop route. With concurrent runs, server restart can leave multiple stale `.run.json` files. Add a startup sweep that scans all tasks (via `listTasks()` or similar) and clears any with `status` in `['queued', 'planning', 'working']` that don't have a corresponding entry in the registry. Call this once during server initialization (e.g., in the git init or app startup path).

**Dequeue must happen after full cleanup.** In the `finally` block, the dequeue call must come after `registry.runs.delete(task)` — otherwise the dequeued run's `startRun()` sees the finished run still in the registry and either thinks the limit is exceeded or hits the per-task guard. Order: close subscribers → clear state → delete from registry → dequeue next.

**Existing tests mock the singleton.** `loop.server.test.ts` mocks `getState()` returning a single object. Tests need to be updated to mock `getRegistry()` with a Map. The test structure is otherwise sound — just swap the mock shape.

**Internal `getState()` references inside `loop.server.ts`.** The callsite map covers exported function consumers, but `runLoop()` (line 314), `runPlanningIteration()`, and `runWorkingLoop()` all call `getState()` internally to access the singleton. These must change to receive or look up their run's state from the registry by task key. Pass the task slug through or capture the `RunLoopState` reference at `startRun()` time and thread it into the loop functions.

**Logging is append-only JSONL.** Concurrent runs write to the same `~/HappyHQ/.logs/YYYY-MM-DD.jsonl` file. This is fine — Node's `fs.appendFileSync` / `fs.appendFile` on a single-line payload is atomic under `PIPE_BUF` (4KB on macOS/Linux), and each log entry is well under that. Log entries already include `task` and `stream` fields, so interleaved lines are filterable. No change needed.

## Design Decisions

**Map keyed by task slug, not stream+task or run ID.** Per-task concurrency is always 1, so the task slug is a natural unique key. A composite key adds complexity with no benefit — you'd never look up "all runs for a stream" at the run-loop level (that's a UI concern served by SWR).

**Simple retry over async mutex for git.** The app can't control when the agent runs git commands — they happen inside SDK tool execution. A mutex only protects app-level git calls, leaving a gap. Retry covers both paths with zero coordination. The lock window is so small (milliseconds) that retries are essentially free.

**Tier-gated limit, not hardcoded.** Concurrency is a natural value lever for pricing tiers. Free tier stays at 1 (current behavior, no regression). Paid tiers unlock parallelism. Max tier is unlimited because the user is paying for the compute and the machine/cloud resources are the real constraint.

**Chat composer unblocked.** The human is the slowest part of the conversation. Blocking the composer while Q responds forces the user to wait, then context-switch back to typing. The SDK's `priority: 'next'` mechanism exists precisely for this — the user sends their follow-up, Q processes it in order, no interruption.

**No branches or worktrees for concurrent git.** Single branch, single working tree. Tasks write to isolated directories (`tasks/{task}/`), and the rare git lock collision is handled by retry. Branches would require merge strategies, worktrees would change the filesystem layout. Both add complexity far exceeding the problem's severity.

**Budget reservation on start.** Prevents double-spending when multiple runs start simultaneously. Same pattern as payment authorization holds — reserve on start, reconcile on finish. Conservative default reservation (one iteration's `maxBudgetUsd`) limits overcommitment.

**`plan_ready` holds its concurrency slot.** A task waiting for plan approval keeps its `RunLoopState` in the registry. This is deliberate — the planning session's resources are allocated, and releasing the slot would mean re-acquiring it on approval (which could fail if the limit is now full). The cost is that idle `plan_ready` tasks block queued work. The UI should make this visible so the user knows to approve or stop plans to free slots. If this becomes a pain point, a future refinement could release the slot on `plan_ready` and re-acquire on approval (with automatic queuing if the limit is now full).

**`git add -A` stages the entire repo, not per-task paths.** This means task B's commit can sweep up task A's uncommitted files if they happen to overlap. The retry mechanism handles `index.lock` contention, but not this staging race. This is acceptable: the files are still versioned correctly (just attributed to the wrong commit), and nobody inspects commit-level attribution. If it becomes a problem, `commitGitState()` can be narrowed to `git add -- tasks/{task}/` for task-scoped commits — but that's a separate concern from concurrency and is already tracked in [Bugs & Enhancements](../.dev/bugs-enhancements.md) as the targeted staging enhancement.

## Acceptance Criteria

- [ ] Multiple tasks can run concurrently (planning or working, different tasks)
- [ ] Per-task concurrency stays at 1 — starting a run for an already-running task returns 409
- [ ] Global concurrency limit enforced per billing tier — exceeding limit queues the run
- [ ] Queued runs auto-start FIFO when a slot opens (dequeue in `finally` block)
- [ ] `.run.json` shows `status: 'queued'` with `queuedAt` timestamp while waiting
- [ ] Stopping a queued task removes it from the queue and writes `status: 'stopped'`
- [ ] Queue bounded at 10 — returns 429 only when queue is full
- [ ] Server restart clears stale `queued` status via `clearStaleRun()`
- [ ] A task cannot be both running and queued simultaneously
- [ ] Each run has independent `AbortController`, subscriber Set, and loop state
- [ ] `POST /api/run/stop` stops a specific run by task, not the global singleton
- [ ] `GET /api/run/stream?task=<slug>` returns events for that run only
- [ ] `GET /api/run/active` returns all active runs as an array
- [ ] Git `index.lock` collisions retried with exponential backoff (3 attempts, 100/200/400ms)
- [ ] `commitGitState()` and `isTaskCompleted()` use the retry wrapper
- [ ] Billing budget reservation on run start, reconciled on completion
- [ ] Chat composer allows typing while Q is streaming
- [ ] Chat composer allows sending while Q is streaming (message queued with `priority: 'next'`)
- [ ] Queued chat messages can be cancelled before processing
- [ ] Server restart with multiple stale `.run.json` files clears all via `clearStaleRun()`
- [ ] Stopping one run does not affect other concurrent runs

## Testing

Run loop — concurrent runs (`lib/run/loop.server.test.ts`):

- [ ] Two concurrent runs on different tasks succeed
- [ ] Concurrent run on the same task returns 409
- [ ] Global concurrency limit enforcement (run N+1 queues)
- [ ] Per-run subscriber isolation — events from run A don't leak to run B's stream
- [ ] Per-run stop — stopping task A doesn't affect task B
- [ ] Server restart clears all stale runs

Git retry (`lib/git/sync.server.test.ts`):

- [ ] `execGitWithRetry` succeeds on first attempt (no lock)
- [ ] `execGitWithRetry` retries on `index.lock` error and succeeds
- [ ] `execGitWithRetry` throws after 3 failed retries
- [ ] Non-lock errors are not retried

Run queue (`lib/run/loop.server.test.ts`):

- [ ] Run queues when concurrency limit reached (returns `{ status: 'queued' }`)
- [ ] Queued run auto-starts when active run finishes (FIFO)
- [ ] Stopping a queued run removes it from the queue
- [ ] Queue rejects when full (10 items, returns 429)
- [ ] Duplicate task in queue rejected
- [ ] Server restart clears stale `queued` status
- [ ] Dequeue skips runs that fail billing check, tries next

API routes:

- [ ] `POST /api/run/start` returns `{ status: 'queued' }` when at concurrency limit
- [ ] `GET /api/run/stream?task=` routes to correct run's stream
- [ ] `GET /api/run/active` returns array of all active runs

## Edge Cases

- **Two tasks commit at the same instant**: One hits `index.lock`, retries after 100ms, succeeds. The lock window is <50ms — first retry almost always works.
- **User stops one task while others continue**: Per-run `AbortController` — `stopRun(task)` aborts only that run's controller. Other runs are unaffected.
- **Server restart with multiple stale `.run.json` files**: `clearStaleRun()` iterates all tasks, writes `status: 'stopped'` with `error: 'Run lost (server restarted)'` for any task where `.run.json` says `working` or `planning` but no loop is active.
- **Budget race — two runs start simultaneously**: Both see full remaining budget. Budget reservation prevents double-spending — each start deducts a tentative hold, so the second start sees reduced availability.
- **Queued run's billing check fails at dequeue time**: Between queueing and starting, the user may have exhausted their budget. `startRun()` catches this — the dequeued run fails to start, `.run.json` transitions from `queued` to `stopped` with `stopReason: 'budget'`. The next item in the queue is tried.
- **User stops a queued task then re-starts it**: Stop removes it from the queue. Re-start goes through the normal path — either starts immediately (slot available) or re-queues.
- **All running tasks finish simultaneously**: Each `finally` block calls `dequeueNext()`. The first one to execute dequeues an item. The second finds the queue shorter (or empty). No double-start because `startRun()` has the per-task TOCTOU guard.
- **HMR kills one run's loop but not another**: Each run's `loopPromise` is independent. The surviving run continues. The killed run leaves a stale `.run.json` — detected and cleared on next interaction (same as today's single-run stale detection).
- **User sends chat message while Q is mid-response**: Message queued with `priority: 'next'`. Q finishes current response, then processes the queued message. If user deletes the queued message before Q gets to it, `cancel_async_message` drops it.
- **Rate limits under concurrent runs**: Multiple Opus sessions consume rate limit quota faster. The SDK's built-in retry with backoff handles 429s at the request level. Under heavy concurrency, runs may slow down due to rate limiting — this is natural backpressure, not an error.
- **All slots occupied by `plan_ready` tasks**: Tasks waiting for plan approval hold their concurrency slot. Queued tasks can't start until the user approves or stops one. The UI should surface this — "approve or stop a plan to free a slot."

## Constraints

- Per-task concurrency is always 1. No two runs on the same task.
- Global concurrency capped by billing tier (free=1, pro=3, max=unlimited). Local deployments also bounded by machine resources.
- Git operations serialized via retry, not mutex. Single branch, single working tree.
- No git branches or worktrees for isolation.
- Chat send-while-streaming depends on SDK `streamInput()` or session API stability.
- Runs are local only. Cloud VM-per-task is a future concern with different concurrency semantics.

## Cross-References

- [Working](working.md) — run loop mechanics, iteration model, `.run.json` state machine
- [Git Layer](git-layer.md) — commit strategy, `index.lock` retry approach
- [Billing](billing.md) — tier-gated concurrency limits, budget enforcement
- [Data Flow](data-flow.md) — API routes, SWR caching, stream patterns
- [Agent Configuration](agent-config.md) — SDK query configuration, tool permissions
- [Chat](chat.md) — chat surfaces, composer, session management
