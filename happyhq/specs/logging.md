# Logging

File-based server logging for Q.

Q is a local, file-first app — but its runtime events vanish into the console. When something breaks, neither the user nor the LLM assisting them can see what happened. This spec defines a persistent, file-based log that captures domain events and error context in the same place.

## Problem

Server-side events (task creation, run lifecycle, errors, action failures) are logged to `console.log`/`console.error` with prefixed tags. These are ephemeral — they disappear when the terminal scrolls or the process restarts. When a user asks for help debugging ("this task failed, what happened?"), the LLM has to guess or ask the user to reproduce.

Chat journals (`.chats/{id}/journal.jsonl`) and run state (`.run.json`) capture agent-level detail, but system-level events — what server actions ran, what API routes errored, what lifecycle transitions happened — have no persistent record.

This matters even more as Q moves toward autonomous operation — the app calling an LLM to debug or fix issues. The log becomes the handoff context: read the last N lines of today's log, that's your orientation.

## Design

### Where

Daily JSONL files in `~/HappyHQ/.logs/`:

```
~/HappyHQ/.logs/
├── 2025-04-07.jsonl
├── 2025-04-08.jsonl
└── 2025-04-09.jsonl
```

The `.logs/` directory is dotfile-hidden like `.chats/` and `.q/`, and gitignored (git history is the mutation audit trail; logs are runtime events that would bloat the repo). One file per calendar day, named by ISO date. No rotation logic needed — each file is naturally scoped.

### Format

One JSON object per line, appended. Every line has `t` (ISO timestamp) and `event` (dotted name). Everything else is event-specific context:

```jsonl
{"t":"2025-04-07T10:00:00.123Z","event":"task.created","task":"quarterly-report","stream":"reports"}
{"t":"2025-04-07T10:01:00.456Z","event":"run.started","task":"quarterly-report","stream":"reports","mode":"planning","session":"a1b2c3d4"}
{"t":"2025-04-07T10:02:30.789Z","event":"run.completed","task":"quarterly-report","stream":"reports","mode":"planning","session":"a1b2c3d4","cost":0.45,"duration_ms":90000}
{"t":"2025-04-07T10:03:00.100Z","event":"run.started","task":"quarterly-report","stream":"reports","mode":"working","session":"e5f6g7h8"}
{"t":"2025-04-07T10:04:00.200Z","event":"run.iteration","task":"quarterly-report","iteration":1,"cost":0.32,"duration_ms":60000}
{"t":"2025-04-07T10:05:00.300Z","event":"run.completed","task":"quarterly-report","stream":"reports","mode":"working","cost":0.77,"iterations":2,"duration_ms":120000}
{"t":"2025-04-07T10:06:00.012Z","event":"action.failed","action":"createTask","error":"EACCES: permission denied","stack":"Error: EACCES..."}
{"t":"2025-04-07T10:07:00.345Z","event":"api.error","route":"/api/fs/task","status":500,"error":"ENOENT: no such file","stack":"..."}
```

**Key principle:** successful events carry domain context (what happened). Failures carry debug context (error message, stack trace, relevant state). Same file, same format — errors are visible _in context_ of what was happening around them. Cross-references (`session`, `chat`) bridge the log to detailed artifacts (SDK journals, .run.json) without duplicating them.

### API

```typescript
import { log } from '@/lib/log.server'

// Domain events — include cross-references so grep connects the dots
log('task.created', { task: slug, stream: streamSlug })
log('run.started', {
  task: taskName,
  stream: streamName,
  mode: 'planning',
  session: planningSessionId,
})
log('run.iteration', {
  task: taskName,
  iteration: 1,
  cost: iterationCost,
  duration_ms: iterDurationMs,
})
log('run.completed', {
  task: taskName,
  stream: streamName,
  mode,
  cost: totalCost,
  iterations: iteration,
  duration_ms: Date.now() - runStartMs,
})

// Failures — include error, stack, and what was in progress
log('run.error', {
  task: taskName,
  stream: streamName,
  mode,
  session: sessionId,
  error: err.message,
  stack: err.stack,
})
log('action.failed', {
  action: 'createTask',
  error: err.message,
  stack: err.stack,
})
```

`log(event: string, data?: Record<string, unknown>)` — that's the entire API. No log levels, no categories, no configuration. The event name (dotted convention) provides all the structure needed for filtering.

### Write behavior

- `appendFileSync` — synchronous, simple, no dropped events. At Q's volume (dozens of events/day) there's no performance concern.
- Auto-creates `.logs/` directory and daily file on first write.
- If the write fails (disk full, permissions), catch and swallow — logging must never crash the app.
- Server-only module (`.server.ts` suffix).

### Event naming convention

Dotted names, noun.verb pattern:

- `task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.deleted`, `task.assigned`, `task.input_added`, `task.input_deleted`
- `run.started`, `run.iteration`, `run.completed`, `run.error`, `run.stopped`
- `stream.created`, `stream.deleted`, `stream.renamed`, `stream.updated`, `stream.spec_deleted`
- `chat.created`, `chat.deleted`
- `file.uploaded`, `file.deleted`
- `sample.added`
- `api.error` — catch-all for API route errors
- `client.error` — uncaught JS exception (window.onerror)
- `client.unhandled_rejection` — unhandled promise rejection
- `client.react.error` — React ErrorBoundary catch
- `client.react.render_error` — Next.js error.tsx page triggered
- `client.fetch.error` — SWR fetcher received a 5xx response

### Field conventions

Consistent field names so `grep` works reliably across all events:

- `task` — always the task slug (never `taskSlug`, `slug`, or `taskName`)
- `stream` — always the stream slug
- `session` — SDK session UUID, bridges to chat journals in `~/.claude/projects/`
- `chat` — chat session ID, bridges to `.chats/{id}/`
- `mode` — `planning` | `working` | `learning` | `general`
- `iteration` — 1-indexed iteration number on run events
- `cost` — USD cost (number), on run events
- `duration_ms` — elapsed time in milliseconds
- `reason` — why a run stopped: `budget` | `user` | `iteration_limit`
- `field` — which field was updated (on `*.updated` events, e.g. `title`, `playbook`, `description`)
- `file` — filename/slug for file and sample events
- `error` + `stack` — on failure events (error is the message, stack is the trace)

### What to log

**Do log:**

- Server action success/failure (the action layer is the mutation boundary)
- Run lifecycle (started, iteration, completed, error, stopped)
- API route errors (5xx responses)
- Task lifecycle (created, completed, deleted)

**Don't log:**

- API route reads (GET requests that succeed — too noisy, no value)
- Agent SDK messages (already captured in chat journals and .run.json)
- Sensitive data (API keys, auth tokens)

### Client-side error reporting

Client errors (React crashes, unhandled exceptions, failed fetches) are forwarded to the server log via `POST /api/log`. The client calls `reportError(event, data)` from `lib/report-error.ts`, which uses `sendBeacon` for reliability. The `/api/log` endpoint namespaces all events under `client.*` and writes them via the same `log()` function.

This makes client errors visible alongside server events in the unified log timeline — Claude Code can read `npx tsx scripts/read-logs.ts --event=client.` to see what broke in the UI.

### Relationship to existing observability

Q already persists diagnostic data at the agent level:

- **`.run.json`** — run-level summary: status, cost, iterations, session IDs
- **Chat journals** (`~/.claude/projects/{path}/{session}.jsonl`) — agent-level detail: messages, tool calls, thinking blocks
- **Debug bundles** — one-click export of journal + specs + environment for user-reported issues

This log fills the gap between them: **system-level events** that connect domain actions to agent execution. A `run.started` entry with a `session` field bridges to the journal; a `task.created` entry shows which action created the task; an `action.failed` entry captures the error that the user never saw.

## Implementation

| File                           | Action | What                                                                                                                                         |
| ------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/lib/log.server.ts`        | Create | `log(event, data?)` — append JSONL to daily file in `~/HappyHQ/.logs/`                                                                       |
| `app/lib/fs/paths.ts`          | Modify | Add `logsDir()` path helper                                                                                                                  |
| `app/lib/actions/tasks.ts`     | Modify | `task.created`, `task.updated`, `task.assigned`, `task.completed`, `task.reopened`, `task.deleted`, `task.input_added`, `task.input_deleted` |
| `app/lib/actions/streams.ts`   | Modify | `stream.created`, `stream.deleted`, `stream.renamed`, `stream.updated`, `stream.spec_deleted`                                                |
| `app/lib/actions/chat.ts`      | Modify | `chat.created`, `chat.deleted`                                                                                                               |
| `app/lib/actions/ingestion.ts` | Modify | `file.uploaded`, `file.deleted`, `sample.added`                                                                                              |
| `app/lib/run/loop.server.ts`   | Modify | `run.started`, `run.iteration`, `run.completed`, `run.error`, `run.stopped`                                                                  |
| `app/app/api/*/route.ts`       | Modify | `api.error` in catch blocks for 5xx responses                                                                                                |

### What not to build (yet)

- No log levels — the event name is the level. `run.error` vs `run.completed` tells you everything.
- No log viewer UI — the files are plain text. The LLM reads them, the user can `cat` them.
- No log aggregation or shipping — local app, local files.
- No configuration — it's always on. The cost is negligible.

### Future

**Request context** — Every log line currently gets context from explicit arguments at the call site. A natural v2 is request-scoped context set once at the API route / server action boundary, merged into every `log()` call automatically via `AsyncLocalStorage`. Fields: `actor` ('user' | 'agent' | 'system'), `surface` ('chat' | 'taskList' | 'desktop' | 'settings'), `userId`, `session`, `mode`. Client sends surface/actor via header; server wraps handler with `withLogContext()`. Fully additive — existing lines gain fields, nothing breaks.

**`action.failed` wrapper** — Higher-order function `withLogging(actionName, fn)` that wraps any server action: logs the event name on success, catches + logs `action.failed` with error/stack on failure. Eliminates manual try/catch instrumentation at each call site.

**Log in the debug bundle** — Include today's log (or last N lines) in the debug bundle export (`assembleDebugBundle`). When a user reports an issue, the developer gets the system-level timeline alongside the journal. Small change to `lib/chat/assemble-debug-bundle.server.ts`.

**Log reader MCP tool** — When the agent is called from the app to debug, it shouldn't have to know about daily file paths. A `ReadLogs({ task?, stream?, last?: 20 })` MCP tool that filters and returns recent entries makes the autonomous handoff seamless.

**Log rotation** — Daily files accumulate indefinitely. Add a cleanup pass (on app start or daily) that deletes files older than N days (30 is reasonable). Trivial — `readdir` + filter by filename date + `rm`.

## Acceptance Criteria

- [x] `log(event, data)` function exists in `lib/log.server.ts` and is importable from server modules
- [x] Every `log()` call appends exactly one JSONL line to `~/HappyHQ/.logs/{YYYY-MM-DD}.jsonl`
- [x] Every line contains `t` (ISO timestamp) and `event` (string) fields
- [x] `.logs/` directory is auto-created on first write
- [ ] `.logs/` is gitignored in `~/HappyHQ/.gitignore` (the workspace repo, not the app source repo) — log files never appear in git status
- [x] Logging never throws — write failures are caught and swallowed
- [x] Non-serializable data (circular references) produces a fallback line with `_serializationError: true`
- [x] Task events logged from task actions: `task.created`, `task.updated`, `task.completed`, `task.reopened`, `task.deleted`, `task.assigned`, `task.input_added`, `task.input_deleted`
- [x] Stream events logged from stream actions: `stream.created`, `stream.deleted`, `stream.renamed`, `stream.updated`, `stream.spec_deleted`
- [x] Chat events logged from chat actions: `chat.created`, `chat.deleted`
- [x] File events logged from ingestion actions: `file.uploaded`, `file.deleted`, `sample.added`
- [x] Run lifecycle logged from the run loop: `run.started`, `run.iteration`, `run.completed`, `run.error`, `run.stopped`
- [x] `run.stopped` events include `reason` field (`budget` | `user` | `iteration_limit`)
- [x] `api.error` events logged from API route catch blocks (run/start route)
- [x] Failure events include `error` message field
- [x] Cross-reference fields (`task`, `stream`, `session`, `mode`, `cost`, `duration_ms`) use consistent names per the field conventions
- [x] Remaining API route 5xx catch blocks instrumented with `api.error`
- [x] Client-side errors forwarded to server log via `POST /api/log` and `reportError()`
- [x] Global error handlers (`window.onerror`, `unhandledrejection`) wired up via `<ErrorReporter />`
- [x] Error boundaries (`error.tsx`, `ErrorBoundary`) report errors server-side
- [x] SWR fetcher reports 5xx responses via `client.fetch.error`

## Testing

Log module (`lib/log.server.test.ts`):

- [x] `log()` appends a valid JSON line with `t` and `event` fields (`lib/log.server.test.ts`)
- [x] `log()` includes all data fields in the JSON line (`lib/log.server.test.ts`)
- [x] `log()` creates `.logs/` directory if missing (`lib/log.server.test.ts`)
- [x] `log()` creates daily file named by ISO date (YYYY-MM-DD.jsonl) (`lib/log.server.test.ts`)
- [x] `log()` appends to existing daily file (does not overwrite) (`lib/log.server.test.ts`)
- [x] `log()` does not throw when directory creation fails (`lib/log.server.test.ts`)
- [x] `log()` does not throw when file write fails (`lib/log.server.test.ts`)
- [x] `log()` handles undefined/null data gracefully (`lib/log.server.test.ts`)
- [x] `log()` writes fallback line with `_serializationError` on circular reference (`lib/log.server.test.ts`)
- [ ] `logsDir()` returns correct path under HAPPYHQ_ROOT (`lib/fs/paths.test.ts`)

Integration (verified manually or via existing test suites):

- [ ] Server actions produce log entries when invoked through tests
- [ ] Run loop produces `run.started` → `run.iteration` → `run.completed` sequence

## Edge Cases

- **`.logs/` directory deleted while app is running**: `log()` re-creates it on next write. The `mkdirSync` call is guarded with `{ recursive: true }` and runs every time — no cached "directory exists" flag.
- **Concurrent writes from multiple API routes**: `appendFileSync` is atomic for small writes (< PIPE_BUF, typically 4KB on macOS/Linux). A single JSONL line is well under this. No locking needed.
- **Disk full**: `log()` catches and swallows the error. The app continues normally. Log lines are lost but nothing crashes.
- **Midnight rollover during a run**: Events before midnight go to today's file, events after go to tomorrow's. The timestamp inside each line is authoritative — the filename is for convenience, not correctness.
- **Very long stack traces**: No truncation. A single log line with a full stack trace might be 2-3KB. At Q's volume this is fine.
- **Non-serializable data**: `JSON.stringify` drops functions and converts undefined to null silently, but _throws_ on circular references. The `log()` function should catch stringify failures and write a fallback line with the event name and an `"_serializationError"` flag.
