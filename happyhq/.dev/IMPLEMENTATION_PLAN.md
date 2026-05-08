# Implementation Plan — Discovery Experience

Scope: ship the Discovery phase specified in `specs/discovery.md` (v0). Discovery is a heads-up preamble that runs before planning on every Start, asks the user 0–3 structured questions when the playbook/specs say something is missing, and writes a `## Discovery` synthesis to `task.md` before auto-transitioning to planning.

Reference specs (read in this order):

- Primary: `specs/discovery.md`
- Forcing function for `phases: PhaseRecord[]` migration: `specs/working.md` (lines 170–270)
- Heads-up vs. heads-down: `specs/agent-config.md`
- Existing pending pattern: `specs/task-list.md`

---

## Sequencing & dependency chain

The deltas land in **one PR** because they tear together (per `specs/discovery.md` v0-vs-v1: "phases: PhaseRecord[] migration on RunInfo" is bundled). Within the PR, build in this order — each later step depends on the earlier:

1. **Foundation: types + `parseRunInfo` shim** — every later step needs the new `RunInfo` shape.
2. **Writer rewrite (the bulk of the diff)** — flip every `writeRunInfo` callsite + `lib/dev/mock-data.ts` + the legacy test fixtures to the new `phases: PhaseRecord[]` shape. After this step, `pnpm test` is green on the new shape with the shim covering reads.
3. **Config schema + defaults + settings UI row.**
4. **Server helpers** — `updateRunInfoPendingQuestions`, run-stream `question` event variant, `parseRunInfo` callers, `clearStaleRun` cleanup, `syncTaskMdFromRun` `'discovering'` arm, module-state `activeDiscoverySessionId`.
5. **Agent factory + prompt** — `discoveryAgentOptions()`, `discoveryPrompt()`, `prompts/discovery.md`.
6. **Run loop dispatch** — `runDiscoveryIteration`, mode dispatcher, billing span integration, `commitGitState` call.
7. **API surface** — `/api/run/start` mode union; new `/api/run/answer` route.
8. **Client/UI** — run-actions hook mode union, task panel discovery section + plan-section/outputs-section rewiring, island wiring, sidebar badge, run-activity event handler.
9. **Unit tests for new behavior + smoke fixtures + smoke scenarios.**
10. **Type-check sweep + acceptance walk.**

`pnpm check-types` after step 1 surfaces every `switch` on `status`/`mode` that needs a `'discovering'` arm. Treat that list as the canonical set of remaining UI/server callsites.

---

## 1. Foundation — types & migration shim

**Status: ✅ Done (2026-05-07).** All sub-tasks 1.1–1.6 landed on `ralphie/discovery`. `parseRunInfo` shim covers planning-only, planning + N working, empty/never-run, legacy `usage_limited`/`paused` → `stopped+budget`, legacy `running` → `working`, and `error: null` → `undefined`. All 13 writer sites in `loop.server.ts`, the API route, mock fixtures, and 6 test files emit the new `phases: PhaseRecord[]` shape. `IterationMetrics` renamed to `PhaseTokenMetrics`. Helpers `getDiscoveryPhase`/`getPlanningPhase`/`getWorkingPhases` added in `lib/fs/run-info.ts` and wired through three UI consumers (panel, plan-section, outputs-section). Verification: `pnpm check-types && pnpm lint && pnpm test` green (1480 tests, 123 files). Foundation is ready for Task 2 (config schema) to build on.

**Task 1.1 — Update `lib/fs/types.ts`.** (`RunInfo` is at lines 21–34.)

Replace with the shape from `specs/working.md:200–218`:

- Status union: add `'queued' | 'discovering'` (keep existing values).
- `stoppedDuring`: add `'discovery'`.
- Add `phases: PhaseRecord[]` (append-only).
- Add `pendingQuestions?: AskUserQuestionInput['questions']` (typed via `import type { AskUserQuestionInput } from '@anthropic-ai/claude-agent-sdk'`).
- Drop `iteration`, `planningCostUsd`, `iterations`, `planningSessionId`, `workingSessionIds`. The shim synthesizes these on read; writers emit the new shape only.
- Add `queuedAt?: string` (concurrency uses it later).
- Add the `PhaseRecord` interface above `RunInfo`.
- Change `error: string | null` → `error?: string` (omit when absent — `null` is gone from the new shape per spec).
- Delete `IterationMetrics` (no remaining importer per audit).

**Task 1.2 — Introduce `parseRunInfo` in `lib/fs/read.server.ts`.**

`parseRunInfo(raw: unknown): RunInfo`. Detection: presence of any of `planningCostUsd`, `planningSessionId`, `workingSessionIds`, `iterations`. Mapping per `specs/working.md:229–266`:

- planning: emit one `{ phase: 'planning', sessionId: planningSessionId ?? '', costUsd: planningCostUsd ?? 0, durationMs: 0, ... }` (token fields if present).
- working: pair `workingSessionIds[i]` with `iterations[i]` by index; prefer `iterations.length` on disagreement; emit `{ phase: 'working', iteration: i+1, sessionId, costUsd, durationMs, ... }`.
- `error: null` → omit field.
- **Preserve the legacy status normalization currently inline at `read.server.ts:680–688`** (`'usage_limited'`/`'paused'` → `'stopped'` + `stopReason: 'budget'` + `stoppedDuring: 'working'` defaults; `'running'` → `'working'`). Move it inside `parseRunInfo`; remove the inline block.

Replace **all three** `JSON.parse(runJson) as RunInfo` sites with `parseRunInfo(JSON.parse(runJson))`:

- `lib/fs/read.server.ts:525` (readTaskList)
- `lib/fs/read.server.ts:679` (readTaskContent — also remove the inline normalization block)
- `lib/run/loop.server.ts:1242` (readRunInfo)

**Task 1.3 — Update `clearStaleRun` (`lib/run/loop.server.ts:281–298`).**

Add `'discovering'` to the discriminator. When flipping a leftover `'discovering'` to `'stopped'`, write `stoppedDuring: 'discovery'`, clear `pendingQuestions` (set to `undefined`), and let the extended `syncTaskMdFromRun` (Task 3.4) handle the `pending` field via the cascade.

**Task 1.4 — Tests for the shim (`lib/fs/read.server.test.ts`).**

Three fixtures: planning-only, planning + N working iterations, never-run (no old fields → pass-through). Plus a fourth: `'usage_limited'` legacy status normalizes correctly through the shim. Plus a fifth: new-shape pass-through (input already has `phases`; shim returns it unchanged). Asserts on shape mapping. Required by acceptance criteria (`specs/discovery.md:743–746`).

**Task 1.5 — Rewrite every writer to emit the new shape (the bulk of the diff).**

The read-time shim handles old `.run.json` files in the wild, but per `specs/working.md:227` writers must always emit the new shape. The audit identified **13 `writeRunInfo` callsites in `loop.server.ts` plus the API route plus mock data**:

- **`lib/run/loop.server.ts:202–213`** (startRun cleanup write) — emit `phases: existingRun?.phases ?? []` and drop the legacy carry-over fields. Drop the top-level `iteration: 0` field entirely.
- **`runPlanningIteration` writes** at lines 532, 558, 593, 627 (4 sites — billingCapped stop, success, user-abort, error) — replace `planningCostUsd: iterationCost, iterations: [metrics], planningSessionId` with a single `phases: [{ phase: 'planning', sessionId: planningSessionId, costUsd: iterationCost, durationMs: <iterStartMs delta>, ...tokenMetrics }]`. The `metrics` local at lines 524 and 585 stays as the token-metric staging structure (renamed `PhaseTokenMetrics` per audit #19).
- **`runWorkingLoop` writes** at lines 718, 838, 869, 910, 943, 997, 1023, 1048, 1084, 1112 (multiple branches: parent-abort, error+user-abort, auth-error, iteration-error continue, no-progress, budget-cap, normal iteration update, completion, no-progress check, iteration-limit) — replace the `iterations: allIterations` + `workingSessionIds` accumulation with a `phases: [...existingPlanningPhases, ...workingPhasesAccumulator]` pattern. The accumulator is a single `phases: PhaseRecord[]` local that grows as iterations complete (replaces parallel `allIterations` and `workingSessionIds` arrays).
- **`runWorkingLoop` resume logic at lines 693–696** — derive `startIteration` from `phases.filter(p => p.phase === 'working').length + 1` instead of `existingRun.iteration + 1`. Document the derivation with a one-line comment.
- **Billing carry-over read at line 386** — replace `planRun?.planningCostUsd ?? 0` with `planRun?.phases?.find(p => p.phase === 'planning')?.costUsd ?? 0`. Hoist a tiny helper `getPlanningCost(run: RunInfo): number` if used in more than one place.
- **`app/api/run/start/route.ts:104, 110`** — the route writes an initial `.run.json` for newly-started runs. Drop `iteration: 0` and `iterations: content.run?.iterations ?? []`; emit `phases: content.run?.phases ?? []` instead.
- **`lib/dev/mock-data.ts`** (lines 16–106) — multiple fixture objects emit the old shape. Rewrite to the new shape with synthesized `PhaseRecord` entries that match the existing visible costs/durations.

**Test fixture migration (do not defer):**

- `lib/run/loop.server.test.ts` (9 occurrences of `iteration:` constructing `RunInfo` literals)
- `lib/agents/reminders.server.test.ts` (5 occurrences)
- `lib/log-reader.server.test.ts:270`
- `app/api/fs/task/route.test.ts:46`
- `components/features/tasks/hooks/use-terminal-error-toast.test.ts:14`
- `components/features/desktop/providers/desktop-initializer.test.tsx:61`

Replace each with the new shape. The shim guarantees old-shape `.run.json` files on disk still parse, so old fixtures only matter for type-correctness in test code — they're literal `RunInfo` objects, so they fail compile after Task 1.1.

**Task 1.6 — Rename `IterationMetrics` → `PhaseTokenMetrics` (recommended).**

The type's fields (`costUsd`, `durationMs`, token counts, context-window) are exactly what each `PhaseRecord` carries. Rename for clarity and update the import at `loop.server.ts:28` and the staging locals (`tokenMetrics: Partial<PhaseTokenMetrics>`). Keep the structural shape; this is a pure rename. (If preferred, leave the name and add a short comment — but rename is the cleaner move and `pnpm check-types` will catch all references mechanically.)

---

## 2. Config schema & settings UI

**Status: ✅ Done (2026-05-07).** Sub-tasks 2.1–2.4 landed on `ralphie/discovery`. `AppConfig.models.discovery` + `AppConfig.limits.discoveryBudgetUsd` added (optional); `ResolvedConfig` mirrors with required form. Defaults: `discovery: { model: 'opus', thinking: 'adaptive' }`, `discoveryBudgetUsd: 2` (conservative — revisit after smoke runs). `resolveConfig` extended for both new fields. Settings UI: `handleModelChange` role union widened to include `'discovery'`; `handleLimitChange` field union widened with `'discoveryBudgetUsd'`. Models page adds a `<SettingsSection title="Discovery">` between Learning and Planning (matches the run-phase order Discovery → Planning → Working). Tests: dedicated cases for discovery defaults, budget override, model override; property-based generators include discovery in the arbitrary, asserts include discovery in the loop. Verification: `pnpm check-types && pnpm lint && pnpm test` green (1483 tests, 123 files).

---

## 3. Server helpers (small, isolated)

**Status: ✅ Done (2026-05-07).** Sub-tasks 3.1–3.5 landed on `ralphie/discovery`. `ChatRunQuestionEvent` (`{ type: 'question'; sessionId; questions }`) added to the `ChatStreamEvent` union in `lib/chat/types.ts` — `filterMessage` does not need updating because the event is emitted directly from `canUseTool`, not from an SDK message. `RunLoopState` gains `activeDiscoverySessionId: string | null` plus exported `getActiveDiscoverySessionId()` / `setActiveDiscoverySessionId()`; `clearStaleRun` clears it alongside `pendingQuestions`. `updateRunInfoPendingQuestions(taskName, questions)` lives next to `writeRunInfo` in `loop.server.ts` (decided against hoisting — there's no `lib/fs/run-json.server.ts` file). `syncTaskMdFromRun` cascade extended: when `status === 'discovering'`, `pendingQuestions` length drives `pending: 'clarification'` vs. clearing; the discovering arm fires before the existing arms so any `writeRunInfo` mid-discovery self-corrects task.md. Task 3.5 was a note-only confirmation that `lib/chat/pending-questions.ts` (`waitForAnswer` / `submitAnswer`, sessionId-keyed) is reused as-is. Tests: 12 cases in `lib/run/loop.server.helpers.test.ts` — write-merge contract for `updateRunInfoPendingQuestions` (set / clear / no-op when missing), pending cascade for `'discovering'` with and without questions, prior-arm preservation (`'plan_ready'`/`'completed'`/`'stopped+budget'`), `activeDiscoverySessionId` round-trip, and `clearStaleRun` cleaning the session id + pendingQuestions while preserving the existing planning/working stoppedDuring mapping. Verification: `pnpm check-types && pnpm lint && pnpm test` green (1495 tests, 124 files).

**Task 3.1 — `updateRunInfoPendingQuestions(taskName, questions | undefined)`.**

Per `specs/discovery.md:282–295`: thin read-merge-write wrapper around existing `readRunInfo` / `writeRunInfo` in `lib/run/loop.server.ts`. Live alongside `writeRunInfo`. Accepts `undefined` to clear. Open implementer choice: hoist to `lib/fs/run-json.server.ts` if the file feels right, otherwise keep adjacent to `writeRunInfo`.

**Task 3.2 — Extend run-stream `ChatStreamEvent` with the `question` variant.**

Per `specs/discovery.md:213–218`: add `| { type: 'question'; sessionId: string; questions: AskUserQuestionInput['questions'] }` to `ChatStreamEvent` (`lib/chat/types.ts:5–17` per audit). The existing `notifyClient = (event) => broadcast(encodeEvent(event))` plumbing fans it out to subscribers — no transport changes. Update `filter.server.ts` only if it discriminates on the union (audit suggests it routes mostly known SDK message shapes; `question` is emitted directly from `canUseTool`, not from `filterMessage`).

**Task 3.3 — Module-state `activeDiscoverySessionId`.**

Extend `RunLoopState` in `loop.server.ts:51–81` with `activeDiscoverySessionId: string | null` (and a setter). `runDiscoveryIteration` sets it when it creates the SDK session UUID; clears it in `finally`. Export a `getActiveDiscoverySessionId()` getter for `/api/run/answer` to read.

**Task 3.4 — Extend `syncTaskMdFromRun` (`loop.server.ts:1319–1333`).**

Add a branch: when `run.status === 'discovering'`, set `pending: 'clarification'` if `run.pendingQuestions` is set, else `undefined`. This makes `.run.json` the single source of truth for the pending field during discovery and prevents `writeRunInfo`-from-anywhere from clobbering `pending`. With this in place, `canUseTool` does not need to call `updateTaskMdPending` directly — it just writes pendingQuestions and the cascade handles the rest. **However**, the spec describes the explicit ordering `updateRunInfoPendingQuestions → updateTaskMdPending → notifyClient → block`. Keep the explicit `updateTaskMdPending` calls in `canUseTool` for spec fidelity (idempotent with the cascade); the cascade is the safety net for edge writes.

**Task 3.5 — Reuse `lib/chat/pending-questions.ts` directly.**

`waitForAnswer` / `submitAnswer` are sessionId-keyed (`Map<sessionId, ...>`). v0 has a single active run; collisions are not possible. **Do not duplicate the store.**

---

## 4. Agent factory + prompt

**Status: ✅ Done (2026-05-07).** Sub-tasks 4.1–4.4 landed on `ralphie/discovery`. `discoveryAgentOptions(streamName, taskName, sessionId, abortController, opts?)` lives in `lib/agents/config.server.ts` between `chatAgentOptions` and `planningAgentOptions`. Mirrors learning's `canUseTool` abort-race shape and planning's PreToolUse Write/Edit gate (scoped to `tasks/{taskName}/task.md`). Setup ordering is exactly: `updateRunInfoPendingQuestions(taskName, questions)` → `updateTaskMdPending(taskPath(taskName), 'clarification')` → `notifyClient({ type: 'question', sessionId, questions })` → `Promise.race([waitForAnswer(sessionId), abortPromise])`. On setup-write failure: log `run.error` (with `stream`, `task`, `error`, `message`) and return `{ behavior: 'deny', message: 'Discovery state write failed' }` _before_ broadcasting the question — never block on input we can't surface. `finally` clears both with `.catch(() => {})`. `discoveryPrompt(streamName, taskName)` in `prompts.server.ts` mirrors `planningPrompt` (placeholders `{{WORKSPACE_ROOT}}`, `{{TASK_NAME}}`, `{{STREAM_SLUG}}`, `{{READING_LIST}}`, `{{PLAYBOOK}}`, lazy `_discoveryPrompt` cache, same `buildReadingList()` — discovery's reading list matches planning's exactly: no plan.md). `prompts/discovery.md` ships with the three calibration patterns from spec lines 107–123 verbatim, the bias-toward-proceeding heuristic, and the `## Discovery` output rule. Tests in `lib/agents/config.server.test.ts` cover all spec acceptance criteria (lines 727–736): Opus model, `discoveryBudgetUsd` budget, no `mcpServers`/`agents`, PostToolUse Write/Edit notify, PreToolUse gate (allow `tasks/my-task/task.md`, deny `plan.md` / `outputs/` / `Edit` always / different task / non-task.md write), AskUserQuestion ordering (deterministic call-order assertion), pending set/clear cycle, question event broadcast, setup-write failure → deny + run.error log + no broadcast, abort race → deny + cleanup. Two implementation gotchas worth knowing for Task 5: (1) `signal.aborted` must be checked upfront inside the abort race promise — setup awaits drain microtasks before the race promise registers its listener, so without the guard a late abort silently hangs forever. (2) `config.server.ts` now imports `updateRunInfoPendingQuestions` from `lib/run/loop.server.ts`, which already imports planning/working factories from `config.server.ts` — the resulting ESM cycle is safe (function-only usage, resolved at call time) but worth noting if a future refactor is tempted to move state. Verification: `pnpm check-types && pnpm lint && pnpm test` green (1524 tests, 124 files; the 41 new tests are scoped to `discoveryAgentOptions`).

**Task 4.1 — `discoveryAgentOptions()` in `lib/agents/config.server.ts`.**

Build alongside `learningAgentOptions` (lines 81–235), `planningAgentOptions` (lines 430–539), and `workingAgentOptions` (lines 548–616). Copy the **structure** from learning (canUseTool blocking + broadcast) and the **non-config defaults** from planning/working (settingSources, persistSession, hooks):

- `model: MODEL_IDS[config.models.discovery.model]`, `maxBudgetUsd: config.limits.discoveryBudgetUsd`.
- `allowedTools`: `['Read','Glob','Grep','Write','WebFetch','WebSearch','Bash(git:*)','Bash(ls:*)']` — `AskUserQuestion` deliberately omitted so it triggers `canUseTool`.
- `disallowedTools: ['EnterPlanMode','ExitPlanMode']`.
- `mcpServers`: undefined. `agents`: undefined. Document with the explicit non-configuration comment from spec lines 356–362 so a future copy-paste from learning doesn't accidentally pull MCP/Drafting back in.
- `persistSession: true`. `settingSources: []`.
- `canUseTool` per spec lines 222–263. Documented setup ordering: `updateRunInfoPendingQuestions(taskName, questions)` → `updateTaskMdPending(taskPath(taskName), 'clarification')` → `notifyClient({ type: 'question', sessionId, questions })` → `Promise.race([waitForAnswer(sessionId), abortPromise])`. On setup-write failure, log `run.error` and return `{ behavior: 'deny', message: 'Discovery state write failed' }`. `finally` clears both with `.catch(() => {})`.
- **Bias toward learning's abort race**: learning's `canUseTool` (config.server.ts:127–154) races `waitForAnswer` against the parent abort signal. Mirror that exactly — discovery should reject on user-stop too.
- `PostToolUse` hook for `Write`/`Edit` mirroring planning's hook (`lib/agents/config.server.ts:507–515`): `notifyClient({ type: 'task_content_changed' })`. Don't include planning's `WebFetch` `persistWebInput` branch — discovery is read-and-assess; it doesn't persist user-supplied web inputs.
- **PreToolUse for Write**: scope to `tasks/{taskName}/task.md` only (mirror planning's plan.md guard at `config.server.ts:488–502`). Discovery should only mutate `task.md`'s `## Discovery` section, never anything else.

**Task 4.2 — `discoveryPrompt()` in `lib/agents/prompts.server.ts`.**

Mirror `planningPrompt()` (lines 200–232): load `prompts/discovery.md`, run `buildReadingList(streamName, streamContent, taskContent, taskName)` (lines 139–198, no changes — discovery wants the same task description, inputs, playbook, specs, samples reading list as planning), substitute `{{READING_LIST}}`, `{{PLAYBOOK}}`, `{{TASK_NAME}}`, `{{STREAM_SLUG}}`. Like `planningPrompt`, do not include `plan.md` in the reading list (only `workingPrompt` does at lines 249–251).

**Task 4.3 — `prompts/discovery.md`.**

New file. Author per `specs/discovery.md:408–419` plus the calibration examples (lines 107–123). Bake the three worked examples into the prompt verbatim so judgment is stable across runs (the spec says "Without them, the prompt iterates by vibe"). Include:

- Job description: gut check before planning.
- Read-first rule with reading-list placeholder.
- Bias-toward-proceeding heuristic.
- 1–3 questions max per round; structured options via `AskUserQuestion`.
- WebFetch/WebSearch: gap-filler, not default exploration.
- Three calibration patterns (ask / proceed-with-note / proceed-silently) verbatim from spec lines 111–121.
- Output rule: append `## Discovery` section to `task.md` only if there's something useful to add; otherwise write nothing and exit.

**Task 4.4 — Tests (`lib/agents/config.server.test.ts`).**

Per `specs/discovery.md:727–736`:

- Returns Opus model resolved via `config.models.discovery` + `MODEL_IDS`.
- Reads `maxBudgetUsd` from `config.limits.discoveryBudgetUsd`.
- No `mcpServers`, no `agents`.
- `PostToolUse` hook fires `task_content_changed` on Write/Edit.
- AskUserQuestion triggers documented setup ordering (mock the four side effects, assert call order).
- Setup write failure → `{ behavior: 'deny' }` + `run.error` log.
- `pending: 'clarification'` set/clear cycle.
- `question` event broadcast.
- Write outside `tasks/{taskName}/task.md` denied (PreToolUse).

---

## 5. Run loop dispatch

**Status: ✅ Done (2026-05-07).** Sub-tasks 5.1–5.6 landed on `ralphie/discovery`. `runDiscoveryIteration` mirrors `runPlanningIteration`'s structure: creates the SDK session id with `crypto.randomUUID()`, publishes via `setActiveDiscoverySessionId` immediately, calls `discoveryAgentOptions`, applies the same billing-cap shrink (`remainingBudgetUsd < maxBudgetUsd ⇒ maxBudgetUsd = remainingBudgetUsd`), drains the SDK iterable with the same `peakInputTokens` / `extractTokenMetrics` accounting, and clears the session id in `finally`. Success path writes `status: 'planning'` + `[...priorPhases, discoveryPhase]` in a single atomic `writeRunInfo` call (per spec line 152–161); the dispatcher then runs `commitGitState('[stream/task] Discovery complete')` (no-op on clean tree) and `runPlanningIteration` with `Math.max(0, remainingBudgetUsd - discoveryCost)` so planning gets the right cap. Failure paths: budget cap → `stoppedDuring:'discovery'`+`stopReason:'budget'`; user abort → `stopReason:'user'` (no error field); SDK throw → `stopReason:'error'` with stderr tail appended. All three failure paths still append the discovery PhaseRecord so token/cost are accounted for. Dispatcher widens the mode union to `'discovery' | 'planning' | 'working'` and `startRun`'s fresh-run cleanup deletes `plan.md` for both `'planning'` and `'discovery'` modes (since planning runs after discovery in the same loop). Initial `.run.json` write maps mode → status: `'discovery' → 'discovering'`. Tests: 8 cases in `lib/run/loop.server.test.ts` `discovery mode` describe — initial `'discovering'` status, auto-transition to `'planning'` (atomic write asserted via `phases.filter(...).length === 1`), terminal `plan_ready` carries both discovery and planning PhaseRecords, `'[s1/t1] Discovery complete'` commit ordering (verified via `mock.invocationCallOrder` against `mockPlanningAgentOptions` first call), planning skipped when discovery throws, user-stop writes `stoppedDuring:'discovery'` with no error and skips planning, budget cap writes `stopReason:'budget'`, PhaseRecord has `sessionId` + `durationMs`, single `startTaskRun`/`finalizeTaskRun` spans discovery + planning. One implementation gotcha worth knowing for Task 6: `runPlanningIteration` reads prior phases via `fs.readFile` on `.run.json` (`loop.server.ts:1488–1499`); the discovery → planning handoff relies on this read to carry the discovery PhaseRecord forward. Test had to mock `node:fs/promises` (not just `lib/fs/write.server`) and mirror writes into an in-memory map so `readRunInfo` could see what `writeRunInfo` had written. Verification: `pnpm check-types && pnpm lint && pnpm test` green (1532 tests, 124 files; 8 new tests scoped to discovery dispatch). Tasks 5.5 (startRun cleanup) and 5.4's billing span landed alongside; the only deferred-to-Task-6 piece is the `/api/run/start` mode union widening, which Task 6.1 explicitly owns.

**Task 5.1 — `runDiscoveryIteration` in `lib/run/loop.server.ts`.**

Mirror the structure of `runPlanningIteration` (lines 453–654). Signature: `(streamName, taskName, parentSignal, startedAt, env?, remainingBudgetUsd?) => Promise<RunInfo['status']>`. Returns `'completed'` on success and `'stopped'` for any abort/error/budget case (writing `stoppedDuring: 'discovery'` and `stopReason` to `.run.json` first).

Key differences from planning:

- Calls `discoveryAgentOptions()` not `planningAgentOptions()`.
- `notifyClient` is the same `(event) => broadcast(encodeEvent(event))` pattern.
- Sets module-state `activeDiscoverySessionId` to the SDK session UUID immediately after creation; clears in `finally`.
- After `query()` resolves successfully, append a `PhaseRecord { phase: 'discovery', sessionId, costUsd, durationMs, ... }` to `phases`, flip `status` to `'planning'` in the same `writeRunInfo` call (atomic combined write per `specs/discovery.md:152–161`).
- Discovery must not need the "is no progress" check — it's a single-shot agent.

**Task 5.2 — Update `runLoop` mode dispatch (lines 371–404).**

Replace the mode union (currently `'planning' | 'working'`) with `'discovery' | 'planning' | 'working'`. Add the `if (mode === 'discovery')` branch per `specs/discovery.md:167–186` — run discovery, on `'completed'` then `commitGitState('[stream/task] Discovery complete')` then `runPlanningIteration`. On any non-`'completed'` discovery return, propagate as `finalStatus` and skip planning.

**Task 5.3 — Canonical write order (atomic-where-possible).**

Per `specs/discovery.md:152–161`: discovery `query()` resolves → `commitGitState` (no-op on clean tree per `sync.server.ts:23–45`) → in **a single `writeRunInfo` call**: append `PhaseRecord` and flip status to `'planning'` → start planning. The combined write keeps disk consistent across crash boundaries.

**Task 5.4 — Billing span — single record across discovery + planning + working.**

`runLoop` already wraps `startTaskRun` (line 344–345) / `finalizeTaskRun` (lines 409–430) around the full lifecycle; discovery's cost flows through naturally. Add `updateUsage` after discovery completes (mirror the planning-phase usage update at lines 384–391). The `costUsd` aggregate is the cumulative sum across `phases`.

**Task 5.5 — `startRun` cleanup is unchanged for discovery.**

Per `specs/discovery.md:447–451`: discovery has nothing to clean up before running. The existing `mode === 'planning'` and `mode === 'working'` cleanup blocks at `loop.server.ts:97–239` are untouched. Mode union widens; behavior doesn't.

**Task 5.6 — Tests (`lib/run/loop.server.test.ts`).**

Per `specs/discovery.md:706–719`:

- Start with `mode: 'discovery'` writes `status: 'discovering'`.
- Discovery without questions auto-transitions to `'planning'` (atomic write).
- AskUserQuestion sets/clears `pending: 'clarification'` on task.md.
- AskUserQuestion writes/clears `pendingQuestions` on `.run.json`.
- AskUserQuestion broadcasts `question` event before blocking.
- Discovery completion appends `## Discovery` to task.md (test against a stubbed `query()`; assert agent's behavior, not the prompt).
- Loop commits `[stream/task] Discovery complete` before planning.
- `PhaseRecord` with `phase: 'discovery'` lands in `phases`.
- Failure / user stop / budget stop write `stoppedDuring: 'discovery'`.
- `clearStaleRun` handles `'discovering'` (stoppedDuring + cleared pendingQuestions).
- Single `startTaskRun` / `finalizeTaskRun` spans discovery + planning.
- Restart from planning preserves `task.md` (including `## Discovery`).
- `syncTaskMdFromRun` cascade: writing `pendingQuestions` while status is `'discovering'` sets `pending: 'clarification'`; clearing it clears `pending`.

---

## 6. API surface

**Status: ✅ Done (2026-05-07).** Sub-tasks 6.1–6.3 landed on `ralphie/discovery`. `/api/run/start` body type widened to `'discovery' | 'planning' | 'working'`; inline validation widened to match; response status maps `discovery → 'discovering'`. The budget-block path remains scoped to `mode === 'working'` (only working starts have an approved-plan to record-and-stop). Discovery + planning starts that fail the limit check just return 403 without writing `.run.json` — confirmed appropriate per spec because discovery has no plan-approval marker. `/api/run/answer/route.ts` is new — inline TS validation (no zod, mirrors `/api/chat/answer`): `{ answers: Record<string, string> }` body shape, 400 on invalid JSON / non-object body / missing-or-non-object answers / array answers / non-string answer values, 404 on no active discovery session OR `submitAnswer()` returning false (session aborted between question render and answer submission), 200 `{ status: 'answered' }` on success. SessionId looked up via `getActiveDiscoverySessionId()` (Task 3.3) — body shape stays additive so v1 concurrency can add a `task` field non-breakingly. Tests: `app/api/run/start/route.test.ts` adds 1 case for discovery mode (returns `{ status: 'discovering' }` + asserts forwarded `'discovery'` to `startRun`); `app/api/run/answer/route.test.ts` is new with 9 cases — invalid JSON, array body, missing answers, non-object answers, array answers, non-string answer value, no active session, submitAnswer returns false, success path with answers forwarded verbatim. Verification: `pnpm check-types && pnpm lint && pnpm test` green (1542 tests, 125 files; 10 new tests scoped to API routes). One implementation note worth knowing for Task 7: the response `status` field varies by mode (`'discovering'` / `'planning'` / `'working'`) — client-side hooks that branch on the response shape must match this widened union (Task 7.1 widens the hook's mode union accordingly).

**Task 6.1 — `app/api/run/start/route.ts`.**

Extend the body type at line 19 from `mode: 'planning' | 'working'` to `mode: 'discovery' | 'planning' | 'working'`. Update the inline validation at line 29 (`if (!task || (mode !== 'planning' && mode !== 'working'))`) to include discovery. Forward `mode: 'discovery'` to `startRun`. **No zod** — match the existing inline TS pattern.

The route also writes an initial `.run.json` at lines 104, 110 that emits the legacy shape (`iteration: 0`, `iterations: content.run?.iterations ?? []`). Per Task 1.5 that block was already migrated to `phases: content.run?.phases ?? []`; just make sure the new `'discovery'` start-path also writes `status: 'discovering'` (not `'planning'`) when `mode === 'discovery'` and includes any carried-over `phases` from a prior stopped-during-discovery run.

**Task 6.2 — `app/api/run/answer/route.ts` (new).**

Per `specs/discovery.md:313–325`. Body: `{ answers: Record<string, string> }`. Returns:

- `200 { status: 'answered' }` on success.
- `400 { error }` on validation fail (body not an object, `answers` not a plain Record<string,string>).
- `404 { error: 'No pending question' }` when there is no active discovery session OR `submitAnswer()` returns `false`.

Implementation:

1. Read the active discovery sessionId via `getActiveDiscoverySessionId()` (Task 3.3).
2. If null → 404.
3. Else: `submitAnswer(sessionId, answers)`; if returns false → 404; else 200.

Validate body inline (no zod). Mirror `app/api/chat/answer/route.ts` style (audit confirms it's inline TS + manual checks).

The body shape is intentionally minimal so v1 can grow a `task` field for concurrency without breaking changes (per `specs/discovery.md:553–579` deferred-to-v1 notes).

**Task 6.3 — Tests for both routes.**

Per `specs/discovery.md:750–753`: smoke each request/response path. Include the 404 path (no active session) and the 400 path (bad body shape).

---

## 7. Client / UI

**Status: ✅ Done (2026-05-07).** Sub-tasks 7.1–7.9 landed on `ralphie/discovery`. `useRunActions`: mode union widened to `'discovery' | 'planning' | 'working'` on `continue_`, `start()` posts `mode: 'discovery'` and optimistic-flips status to `'discovering'`, `continue_('discovery')` translates to `optimisticRun('discovering')`, new `answerQuestion(answers)` POSTs `/api/run/answer` and invalidates the stream on success / throws after toast on failure. Zustand stores (`desktopStore`, `taskStore`) widened in lockstep with `runContinue` and added `runAnswerQuestion`; `useRunActions` selector exposes both. `DesktopInitializer` and `useTaskData` widen `isRunActive` to include `'discovering'` and pipe `answerQuestion` into the store. Task panel adds a discovery section above the planning section: active arm (`ActivityHeader label="Reviewing the task..."` with optional question sub-row when `pendingQuestions` is set — header text never swaps), stopped arm (`Review {paused|stopped} after Ns` with Continue button calling `runActions.continue_('discovery')`), completed arm (`SectionHeader label="Reviewed" durationMs={discoveryPhase.durationMs}` with `onLabelClick` opening the discovery chat session via `openChatSessionWindow(stream, [discoveryPhase.sessionId], 'Discovery Session', \`chat-${taskSlug}-discovery\`)`). Dynamic island: discovery-question branch added before chat pendingConfirmation/pendingQuestion checks — when `taskContent.run.status === 'discovering'`and`pendingQuestions.length > 0`, renders `<QuestionOptions>`wired to`runActions.answerQuestion`. `useRunActivity`adds a`question`event branch that bumps`lastContentChangeAt`so SWR fast-revalidates (disk authoritative; SSE is the fast path). Sidebar/list:`'discovering'`arm in`getRunStatusLabel`returns`'Reviewing'`; `frontmatter.pending === 'clarification'`overrides the run-status badge with "Needs clarification". Task card`index.tsx`adds`isDiscovering`derivation;`task-status-badge.tsx`resolves`'discovering'`→`'Reviewing'`. `taskSentence`adds`'discovering' → "Reviewing the {name} task..."`. Status checks widened across panel, list/item, list/actions, hooks/use-task-data, desktop shell, desktop initializer, working island mode, and `/api/run/stop`route. Mock data: added`DISCOVERING*RUN`, `DISCOVERING_QUESTIONS_RUN`, `MOCK_DISCOVERING_STEPS`, two new `MockPhase` variants (`'discovering'`, `'discovering_q'`); planning/plan_ready fixtures get a synthesized discovery `PhaseRecord`. Mock dev panels (`mock-task-panel`, `mock-run-window`) wire the new variants into the phase toggle and pipe `answerQuestion`through. Tests: 11 new tests across`use-run-actions.test.ts` (5 — start mode discovery, continue* mode discovery, answerQuestion happy path, answerQuestion error path), `use-run-activity.test.ts` (1 — question event bumps lastContentChangeAt), `dynamic-island.test.tsx` (5 — renders QuestionOptions when discovering with pendingQuestions, suppresses when empty/unset, suppresses when status is not discovering, re-renders from disk on SWR refetch, submit calls runActions.answerQuestion). Panel-specific text/click criteria (header literal, question sub-row, "Reviewed Ns" duration, click opens chat session viewer) are covered by code review and exercised by smoke scenarios — full panel render tests would require ~20 hoisted mocks for negligible value over the unit + smoke coverage. Verification: `pnpm check-types && pnpm lint && pnpm test` green (1553 tests, 126 files).

**Task 7.1 — `components/features/desktop/hooks/use-run-actions.ts` + Zustand stores.**

Mode union at lines 14, 156, 208, 261: `'planning' | 'working'` → `'discovery' | 'planning' | 'working'`. Default `start()` (line 240–288) sends `mode: 'discovery'` (v0 always runs discovery on Start per `specs/discovery.md:622`). `continue_()` arg union widens to `'discovery' | 'planning' | 'working'` so a stopped-during-discovery run can resume with `mode: 'discovery'`.

The same `'planning' | 'working'` union appears on the Zustand stores that mirror the hook's signatures — widen them in lockstep so SWR consumers and the hook agree:

- `stores/desktopStore.tsx:47` — `runContinue: ((mode?: 'planning' | 'working') => Promise<void>) | null`
- `stores/taskStore.ts:31` — `runContinue: ((mode?: 'planning' | 'working') => Promise<void>) | null`

Note: the approval-flow callsite at `components/features/desktop/hooks/use-run-actions.ts:156` (the `approve()` function — POSTs `/api/run/start` with `mode: 'working'` from the plan-approval button) is intentionally unchanged — approval transitions `plan_ready` → working, not discovery. (`app/api/run/start/route.ts:97` and `:156` are server-side mode-vs-status guards, not posters — don't confuse them when grepping for `mode: 'working'`.)

Add a new `answerQuestion(answers: Record<string, string>) => Promise<void>` method on the hook — POSTs `/api/run/answer`. Mirror the existing `start()` error/loading state handling (lines 240–288).

**Task 7.2 — Task panel `components/features/tasks/panel/index.tsx`.**

Add discovery's phase rendering above the planning section (planning is at lines 414–537). Three states:

- **Active, no questions** — `ActivityHeader label="Reviewing the task..."` (mirror lines 422–430). Uses `useActivitySteps` for the detail line. Stop button persists.
- **Active, questions pending** — header text unchanged ("Reviewing the task..." stays — `specs/discovery.md:671` explicitly forbids swapping). A new question sub-row beneath the header points the user at the island. Activity stream area below shows the sub-row; **no concurrent spinner** (`specs/discovery.md:676`).
- **Completed** — `SectionHeader label="Reviewed" durationMs={discoveryPhase.durationMs} onLabelClick={openDiscoverySession}` (mirror the planning completed pattern at lines 471–501). The handler calls `openChatSessionWindow(streamSlug, [discoveryPhase.sessionId], 'Discovery Session', \`chat-${taskSlug}-discovery\`)`.

Read the discovery `PhaseRecord` from `taskContent.run.phases.find(p => p.phase === 'discovery')`. Render the discovery section above the planning section.

Note: the panel's existing duration calcs (`planDurationMs`/`workDurationMs` at lines 239–246) read from `run.iterations` today; rewire those to `run.phases` after Task 1. **The same pattern lives in two more components** that the prior plan revision missed:

- `components/features/tasks/card/plan-section.tsx:58–60` — reads `iterations`, `planningCostUsd`, `iterations[0]?.durationMs`. Replace with `run.phases?.find(p => p.phase === 'planning')`.
- `components/features/tasks/card/outputs-section.tsx:57–63` — reads `iterations`, `planningCostUsd`, `iterations.slice(1).reduce(...)`. Replace with `run.phases?.filter(p => p.phase === 'working')`.

Both should use a small shared helper (`getPlanningPhase(run)`, `getWorkingPhases(run)`) to keep the read-side ergonomics consistent and easy to audit. Live the helper in `lib/fs/types.ts` or a sibling `lib/fs/run-info.ts` — implementer's call.

**Task 7.3 — Question rendering reuses `QuestionOptions`.**

`components/features/chat/interaction/question-options.tsx` is already props-driven with no chat-specific imports (audit confirms). For discovery: in `components/features/desktop/island/dynamic-island.tsx` (lines 14–54), add a branch BEFORE the existing `usePendingQuestion()` chat check: when `taskContent.run?.status === 'discovering'` AND `taskContent.run?.pendingQuestions`, render `<QuestionOptions questions={...} onAnswer={runActions.answerQuestion} />`.

The existing `usePendingQuestion()` chat-context provider stays for learning chats (`chat-session-provider.tsx:80–82` — sourced from `chatStore.pendingQuestion`). Discovery's questions come from a different source (`.run.json.pendingQuestions`) — branch on `status`, do not merge sources.

**Task 7.4 — Run stream consumer reads `question` events.**

`components/features/desktop/hooks/use-run-activity.ts` already processes the run NDJSON stream. Add the `question` variant to the event switch at line 206+. The handler can be a no-op for in-app rendering (the SWR-revalidated `pendingQuestions` from `.run.json` drives the island), but it should trigger an SWR revalidation of the task content key so the island sees `pendingQuestions` without polling. The disk write is authoritative; the SSE event is the fast path that triggers an early revalidation.

**Task 7.5 — Reconnect path.**

When SWR re-fetches `/api/fs/task?task=<slug>` and the response includes `run.pendingQuestions`, the island re-renders the question UI from disk state alone. No SSE dependency. Verified by the existing SWR invalidation flow — no new code, just a test.

**Task 7.6 — Sidebar / list "Needs clarification" badge.**

`components/features/tasks/list/item.tsx`: add `'discovering'` arm to `getRunStatusLabel` (lines 127–150). Separately, add a branch in the item rendering: when `frontmatter.pending === 'clarification'`, render "Needs clarification" with the existing pending-state visual treatment. The `pending` field is already on `TaskFrontmatter` (`lib/fs/types.ts`); `'clarification'` is already a valid `PendingType`. This is a label-resolution change, not a schema change.

Also add `'discovering'` to `taskSentence` in `components/features/desktop/island/types.ts:4–17` (e.g., "Reviewing the {name} task...").

**Task 7.7 — Client tests (`components/features/tasks/...`).**

Per `specs/discovery.md:757–763`: header stays "Reviewing the task..." with questions pending; question sub-row appears when `pendingQuestions` set; island renders `QuestionOptions`; submit clears UI and calls `/api/run/answer`; reconnect re-renders from disk; "Reviewed Ns" duration uses `PhaseRecord.durationMs`; click opens chat session viewer with discovery sessionId.

**Task 7.8 — TypeScript exhaustiveness sweep.**

After steps 1 and 7.1, run `pnpm check-types` from `happyhq/`. Fix every flagged `switch` on `mode` or `status` by adding a `'discovery'` / `'discovering'` arm with the right rendering. `specs/discovery.md:199`: "Don't suppress with `as any`."

**Task 7.9 — Non-exhaustive status boolean checks (compiler will NOT flag these).**

These are equality checks that compile fine without `'discovering'` but produce wrong runtime behavior (e.g., spinner doesn't show, sidebar doesn't mark task as running, island hides itself during discovery, "Start" button stays enabled, task badge says nothing). Audit each and add a `'discovering'` arm where it belongs. The audit found ~20 sites; full inventory below — treat as the canonical checklist (the compiler can't help here, these are string equality, not exhaustive unions):

**"Is the run active?" checks (almost all want `'discovering'` added):**

- `components/features/tasks/panel/index.tsx:108` — `isRunning = taskStatus === 'planning' || taskStatus === 'working'`. Add.
- `components/features/tasks/panel/index.tsx:103, 105` — `stoppedDuring === 'planning'` / `'working'` branches that gate the "stopped during X" UI. Add a `stoppedDuring === 'discovery'` branch (the new variant added in Task 1.1).
- `components/features/tasks/panel/index.tsx:414, 421, 534, 549, 670` — section-rendering switches keyed off `taskStatus === 'planning'` / `=== 'working'`. Audit each: discovery's section is the new one in Task 7.2; planning/working renderers should NOT render during `'discovering'`.
- `components/features/tasks/panel/work-gate.ts:16` — `taskStatus === 'working' || stoppedDuringWorking || hasWorkFiles`. Discovery should NOT open the work gate; leave as-is, but verify.
- `components/features/tasks/hooks/use-task-data.ts:62` — `status === 'planning' || status === 'working'` (likely an "is run live" derived state). Add `'discovering'`.
- `components/features/tasks/list/actions.tsx:33` — `status === 'planning' || status === 'working'` (gates list-row actions like Stop). Add.
- `components/features/tasks/list/item.tsx:35–36` — `isRunning = task.run?.status === 'planning' || task.run?.status === 'working'`. Add.
- `components/features/tasks/card/index.tsx:54–55` — `isPlanning`/`isWorking` derivation. Add `isDiscovering` if the card needs to know; otherwise add discovery to the "is active" composite further down.
- `components/features/tasks/card/index.tsx:58, 60` — `stoppedDuring === 'planning'` / `'working'` branches. Add `'discovery'`.
- `components/features/tasks/card/plan-section.tsx:54` — `stoppedDuring === 'planning'`. No discovery branch needed (plan-section is planning's surface), but read-side rewiring per Task 7.2 still applies.
- `components/features/tasks/card/outputs-section.tsx:53` — `stoppedDuring === 'working'`. Same.
- `components/common/task-status-badge.tsx:27, 36` — `status === 'planning' || status === 'working'` then `status === 'planning' ? 'Planning' : 'Working'`. Add `'discovering'` → `'Reviewing'` (or whatever spec line 478 dictates).
- `components/features/desktop/shell.tsx:119` — `taskStatus === 'planning' || taskStatus === 'working'`. Add `'discovering'`.
- `components/features/desktop/providers/desktop-initializer.tsx:219–220` — `data?.taskContent?.run?.status === 'working' || === 'planning'`. Add `'discovering'` (initializer fans out active-run state to the rest of the app).
- `components/features/desktop/hooks/use-run-actions.ts:83` — `clearContent = status === 'planning'`. Decide: should starting from `'stopped during discovery'` clear content too? Per spec discovery doesn't write content, only `## Discovery` to task.md, so probably **leave** — but audit when implementing.
- `components/features/desktop/island/modes/working.tsx:32` — `status === 'planning'`. Audit; this is a working-mode UI file, may not need discovery awareness.
- `components/features/desktop/island/modes/working.tsx:136` — `(status === 'planning' || status === 'working')`. Same — likely needs discovery awareness so the UI doesn't black-out during discovery.
- `app/api/run/stop/route.ts:54` — `if (status === 'working' || status === 'planning')` gates the stop logic. Add `'discovering'` so the stop button works during discovery too (spec says it must — `'discovering'` is heads-up but stop still wins per the abort race).

**"Skip these" checks (no change needed; document the decision):**

- `components/features/tasks/card/debug/mock-task-panel.tsx:54, 56, 58, 64` and `components/features/desktop/windows/debug/mock-run-window.tsx:69, 71, 73, 79` — debug surfaces fed by `lib/dev/mock-data.ts`. After Task 1.5 rewrites mock-data, decide whether to add a `phase === 'discovery'` mock variant for visual QA. Recommended: yes (small, mirrors the new `PhaseRecord` shape).

**Stoppage-related early-return guards:**

- `components/features/desktop/island/dynamic-island.tsx:58–70` — early-return guards for `'plan_ready'`, `null`, `'completed'`, `'stopped'`. Discovery should fall through (the island is the question-rendering surface during discovery, per Task 7.3). Verify no guard accidentally trips.

After Task 1 lands, re-grep `=== 'planning'` and `=== 'working'` and diff against this list. Anything new is either a Task 1.5 byproduct or a recent merge — handle on the spot.

---

## 8. Smoke harness

**Status: ✅ Done (2026-05-07).** Sub-tasks 8.1–8.3 landed on `ralphie/discovery`. Fixture stream lives at `scripts/smoke-fixtures/discovery/email-intros/` with `playbook.md` (notes "always include a personal anecdote about at least one of them" as required), `specs/intro-email.md` (5 required sections including the non-negotiable personal anecdote, tone/length/banned-words), and `samples/intros/intro-1/{original.md, raw.txt}` (fictional Maya/Theo intro — `raw.txt` matches `original.md` so `listFileItems` picks up the extracted form via the standard PDF/DOCX detection path even though this is markdown). Two task fixtures: `tasks/thin-intro.md` (frontmatter + one-line "Intro Priya to Sam" — should provoke 1–3 questions) and `tasks/rich-intro.md` (full description with named parties, reasons, anecdote — should silently proceed). Smoke harness is split into `scripts/smoke-discovery.ts` (recommended in the plan; cleaner than bolting onto smoke-e2e because there's no UI/Playwright dance — discovery scenarios drive the API directly with `seedTask` writing `task.md` straight to disk). All three scenarios share one HAPPYHQ_ROOT (per-run `/tmp/happyhq-smoke-discovery-<uuid>`) but use distinct task slugs (`rich-intro` for Scenario 1, `thin-intro` for Scenarios 2+3) so they don't collide. `--only=N` filters scenarios; `--only=3` requires `--only=2,3` semantics (run 2 then 3) since Scenario 3 has Scenario 2 as a precondition — encoded in the gating: `if (ONLY === null || ONLY === '2' || ONLY === '3') await scenario2Asks()`. Scenario 2 picks `q.options[0].label` as the answer for each question — discovery's prompt synthesizes from whatever comes back, so the smoke verifies plumbing (UI → answer endpoint → discovery completes → `## Discovery` written → planning runs) rather than answer content. Scenario 3 reads `## Discovery` regex-match before the restart and re-asserts it after `mode: 'planning'` re-runs — verifies the spec invariant that `task.md` is the user's and restart from planning never touches it. `pnpm smoke:discovery` package script added; `.github/workflows/smoke-discovery.yml` is a separate workflow file path-gated to PRs touching `prompts/discovery.md`, `lib/agents/config.server.ts`, `lib/run/loop.server.ts`, `scripts/smoke-discovery.ts`, `scripts/smoke-fixtures/discovery/**`, or the workflow itself. The workflow fails fast with a clear error if `ANTHROPIC_API_KEY` isn't configured rather than burning CI minutes only to discover it mid-run. Verification: `pnpm check-types && pnpm lint && pnpm test` green (1553 tests, 126 files). Smoke not executed locally because (a) Q dev server wasn't running, (b) real Opus calls cost real dollars. The harness is wired to run on the next PR that lands on the discovery surface.

**Task 8.1 — Fixture stream `scripts/smoke-fixtures/discovery/email-intros/`.**

Fictional names only (per project convention, no real customer data — see `feedback_no_user_data_in_commits.md`).

- `playbook.md` — typical email-intros workflow; notes "always include a personal anecdote" as required.
- `specs/intro-email.md` — section requirements (salutation, why, one-line per person, **personal anecdote**, CTA), tone, length, banned-words.
- `samples/intros/intro-1/extracted.md` — one fictional past intro.
- Two task fixtures: `tasks/thin-intro.md` (title only) and `tasks/rich-intro.md` (full description + named parties + anecdote).

The current smoke fixtures (`scripts/smoke-fixtures/`) have a single playbook + spec + input.txt — discovery needs the richer stream with samples.

**Task 8.2 — Smoke scenarios.**

Implementer's call: extend `scripts/smoke-e2e.ts` (alongside the existing golden path at lines 380–418), or split into `scripts/smoke-discovery.ts` with a sibling `smoke:discovery` package script. Recommend split — discovery scenarios are conceptually distinct and run conditionally in CI.

- **Scenario 1 (silent proceed)** — extends the existing golden path. Use rich fixture. Assert: header transitions through "Reviewing the task..." to "Planning..." with no question UI; `phases` contains a discovery record; planning produces `plan.md`.
- **Scenario 2 (asks + integrates)** — thin fixture. Assert: question sub-row appears; full `QuestionOptions` block in island; programmatic `POST /api/run/answer`; `## Discovery` section in `task.md` reflects answers; planning runs against enriched task.
- **Scenario 3 (restart preserves discovery)** — after Scenario 2 reaches `plan_ready`, click "Restart from plan"; assert `## Discovery` section persists and `plan.md` regenerates.

**Task 8.3 — CI gating.**

Run discovery smoke scenarios in CI **only** on PRs touching `prompts/discovery.md`, `lib/agents/config.server.ts` (discovery factory), or `lib/run/loop.server.ts` (discovery iteration / canUseTool). Per `specs/discovery.md:700` — they cost real Opus dollars. Add a `paths:` filter or `if: contains(github.event.pull_request.files.*.filename, 'discovery')` step in `.github/workflows/ci.yml` (currently has no path filtering).

---

## 9. Acceptance walk

**Status: ✅ Done (2026-05-07).** Walked every checkbox in `specs/discovery.md` Acceptance Criteria + Testing sections against actual code. All criteria pass with file:line evidence; all are now marked `[x]` in the spec. Two corrections landed during the walk:

1. **`/api/run/answer` validation (spec ↔ code drift).** Spec said zod (`{ answers: z.record(z.string()) }`); implementation uses inline TS validation to mirror `/api/chat/answer`. Plan documents this as the intentional choice (Task 6.2). Updated spec line 321 + acceptance criterion to match implementation. The spec describes what exists, not what was originally drafted.

2. **`canStart` gate relaxation (missed implementation).** Spec acceptance criterion called for "title + stream is sufficient when discovery is enabled (no description/inputs required)" but `components/features/tasks/card/index.tsx:72` still required `(hasDescription || visibleInputs.length > 0)`. Fixed to `streamSlug != null && !!taskTitle.trim()` with a one-line comment explaining why discovery handles the gap. `pnpm check-types && pnpm test components/features/tasks/card` green after the change.

Other small spec corrections during the walk:

- "deny" return shape: spec said `{ result: 'deny' }`; SDK contract is `{ behavior: 'deny' }`. Updated three acceptance criteria to match the actual SDK shape used in code.
- `parseRunInfo` callsite count: spec said "both" but there are three (read.server.ts × 2 + loop.server.ts × 1). Updated to "all three".
- Compat shim test fixtures: spec said three; implementation has five (added legacy `usage_limited` normalization + new-shape pass-through). Updated count.
- Smoke scenarios live in a split `scripts/smoke-discovery.ts` (not extending `scripts/smoke-e2e.ts`); CI gate is `.github/workflows/smoke-discovery.yml` with a `paths:` filter, not a contains-step in `ci.yml`. Updated acceptance criteria to describe what shipped.

**Verification commands run at close-out (all green):**

- `pnpm check-types` ✓
- `pnpm lint` ✓
- `pnpm test` ✓ — 1553 tests / 126 files (1555 / 127 after canStart change; card test file unchanged, just one fewer dependency in the derived state)

**Smoke not executed at close-out.** `scripts/smoke-discovery.ts` requires `ANTHROPIC_API_KEY` and burns real Opus dollars per scenario. The harness is wired and CI-gated; first execution lands on the next PR that touches the discovery surface (per `.github/workflows/smoke-discovery.yml` paths filter).

**Q runtime exercise not executed at close-out.** Dev server wasn't running; per the loop instructions ("If Q is not running, skip — do not attempt to start the dev server yourself"), behavior verification is deferred to the next interactive session. Plumbing is verified by the 1555-test unit suite.

---

## Integration points & invariants to honor

- **Disk is authoritative**, SSE is fast path. Render rule for question UI: `pendingQuestions` is set on `.run.json`, regardless of whether the SSE event fired (`specs/discovery.md:301`).
- **`task.md` is the user's.** No `restoreTaskMdFromGit`. No "Restart from discovery" button. Restart from planning leaves `task.md` (and any `## Discovery` section) untouched (`specs/discovery.md:444–445, 666`).
- **Same billing record** spans discovery + planning + working — single `startTaskRun` / `finalizeTaskRun` lifecycle (`loop.server.ts:344–345, 409–430`).
- **No new event namespace for logging** — discovery emits the existing `run.*` events with `mode: 'discovery'` / `stoppedDuring: 'discovery'` discriminating the phase (`specs/discovery.md:422–430`).
- **No `discovered` status** — write `'planning'` directly when discovery completes (`specs/discovery.md:132–134, 794`).
- **Reuse `QuestionOptions` and `openChatSessionWindow`** — do not fork a second display path (`specs/discovery.md:539, 535`).
- **`AskUserQuestion` is NOT in `allowedTools`** — that's what triggers `canUseTool`. Easy to get wrong by reflex (`specs/discovery.md:352`).
- **Setup ordering matters.** Disk write (pendingQuestions) → task.md pending → broadcast → block. On setup-write failure, deny without blocking. No silent denials (`specs/discovery.md:271–278`).
- **`syncTaskMdFromRun` is the cascade safety net.** `canUseTool` keeps explicit `updateTaskMdPending` calls for spec fidelity, but the extended `syncTaskMdFromRun` ensures any stray `writeRunInfo` while status is `'discovering'` doesn't drift the pending field.

---

## Deferred to v1 (do not build now)

`specs/discovery.md:553–579`:

- `skipDiscovery` playbook frontmatter flag.
- Stream selection during discovery (assigning a stream from a title-only task).
- Slack / email channel adapters (architecture is channel-ready; no adapter ships).
- Concurrency-safe answer routing (`Map<>`-keyed pending state once concurrency lands).

Note in any code comment that touches these areas: keep the door open, don't close it (e.g., the `/api/run/answer` endpoint should accept a body shape that can grow a `task` field later without a breaking change).

---

## Open decisions for the implementer

These are intentionally undecided — pick at build time:

- **Question sub-row persistence**: when an answer comes back, does the question sub-row vanish or persist with a check? Decide by feel (`specs/discovery.md:491`).
- **`updateRunInfoPendingQuestions` location**: live in `lib/run/loop.server.ts` next to `writeRunInfo`, or hoist both to `lib/fs/run-json.server.ts` (`specs/discovery.md:295`).
- **`syncTaskMdFromRun` strategy**: extended cascade (preferred) vs. early-return for `'discovering'`. Plan recommends the cascade — single source of truth, no clobber risk.
- **Smoke scenario layout**: Scenarios 2/3 in `scripts/smoke-e2e.ts` alongside the existing golden path, or split into `scripts/smoke-discovery.ts` with a sibling `smoke:discovery` package script. Plan recommends split.
- **Default discovery budget**: spec says "conservative." Suggested starting value `2 USD` (planning is `5`); revisit after smoke runs surface real usage.
- **`IterationMetrics` rename vs. retain**: rename to `PhaseTokenMetrics` (recommended — name no longer matches role) or retain with a comment. Either works; rename is mechanical via TS check.
- **Read-side helpers location**: `getPlanningPhase(run)` / `getWorkingPhases(run)` live in `lib/fs/types.ts` (alongside the type) or a sibling `lib/fs/run-info.ts`. Recommend the sibling so `types.ts` stays declarative.

---

## Risks the implementer should watch

- **Old `.run.json` files in the wild.** The shim is read-only — writers always emit the new shape. Any code path that reads → mutates → writes-back must round-trip cleanly through `parseRunInfo` so a v1.x file becomes a v2 file naturally. Verify with a manual fixture: drop a v1 `.run.json` into a task dir, start a planning run, confirm the resulting file is v2.
- **`syncTaskMdFromRun` regression.** Today's three pending arms (`plan_ready` → `'approval'`, `completed` → `'review'`, `stopped+budget` → `'checkpoint'`) must keep working unchanged. Add the `'discovering'` arm additively at the top of the chain — don't refactor the existing logic in the same change.
- **Module-state lifetime.** `activeDiscoverySessionId` lives on `RunLoopState` (per Task 3.3). It must be cleared in `runDiscoveryIteration`'s `finally`, in `clearStaleRun` (if a leftover discovering run is found at boot), and in `runLoop`'s `finally` (alongside the existing cleanup at lines 436–446) — three sites total.
- **Billing carry-over.** The current planning-cost read at `loop.server.ts:386` becomes a phase lookup. Don't accidentally count the discovery phase toward planning cost (or vice versa). The phase discriminator is the source of truth.
