# Discovery

The gut check Q does before planning a task.

## Purpose

Discovery is the same gut check a human would do before starting any task: _do I have what I need to do this work well?_ Q sits down with the task, reviews what's there (the description, the inputs, the stream's playbook and specs and samples), and decides whether anything is missing that would force planning to guess or come back asking later.

If everything's in hand, discovery proceeds quietly and planning starts. If something's genuinely missing that would change the plan, Q asks the user a tight set of questions and writes the answers into the task description. Either way, planning starts from a task that's been reviewed, not assumed.

This phase exists because today, every task entry point that isn't a learning conversation jumps straight to planning. The result is the planning run that comes back saying "I'm missing X, Y, and Z" — wasted compute, wasted time, frustrated user. Tasks created inside a learning conversation didn't have that problem because Q naturally gathered context and asked questions before calling CreateTask. Discovery formalizes that gut check as an explicit phase, available to _every_ entry point — quick-add, task panel, command menu, and future Slack/email.

## Discovery vs. learning

Both modes interview the user. They are not the same.

- **Learning mutates the stream.** A learning conversation accrues knowledge into `playbook.md`, `specs/`, and `samples/` — how Q approaches a _class_ of work. Persistent across all future tasks.
- **Discovery enriches one task.** A discovery session writes a `## Discovery` section to _this_ task's `task.md` — does this specific task have what's needed to plan well? The stream is unchanged.

A task created right after a learning conversation still benefits from discovery: the stream got smarter, but this specific task hasn't been triaged. The questions can rhyme ("what's the deadline?"), but the artifact each produces is different.

Architecturally, discovery is a **heads-up** mode that joins learning. See [Agent Configuration → Mode Orientation](agent-config.md#mode-orientation-heads-up-vs-heads-down) for the heads-up vs. heads-down axis and the infrastructure each orientation inherits. Discovery's only true deltas from learning's heads-up plumbing are the SSE stream it broadcasts on (run vs. chat) and the prompt — everything else is reuse.

## Related Specs

- Task lifecycle and pending states → [Task List](task-list.md)
- Plan generation and approval → [Planning](planning.md)
- Run lifecycle, `.run.json`, and `PhaseRecord` / `RunInfo` types → [Working](working.md)
- Agent modes and orchestration → [Agent Configuration](agent-config.md)

## Trigger

The user clicks Start on a task. Discovery runs immediately — it is the first phase of every run. Planning always follows discovery.

Current flow: Start → Planning → (approval) → Working → (review) → Done

New flow: Start → Discovery → Planning → (approval) → Working → (review) → Done

Discovery is not a separate user action. The user clicks one button. Internally, the system runs discovery first, then planning. If Q has no questions, the transition is seamless — the user sees "Reviewing the task..." briefly, then "Planning..." begins. If Q has questions, the run pauses and the ball returns to the user.

**Naming.** "Discovery" is the architectural name (used in mode names, status values, file paths, and code). The user-facing label is "Reviewing the task..." (active) and "Reviewed Ns" (completed). Keeping the internal term and the user-facing term distinct lets us tighten the user-facing language without churning the codebase.

## What Q Does

Discovery is a single agent session that runs inside the run loop, with interactive Q&A via AskUserQuestion. Q reads the same material it would read during planning:

- Task description (`task.md`)
- Task inputs (`inputs/`)
- Stream playbook
- Stream specs
- Stream samples (for reference)

Q evaluates whether the task description and inputs provide enough context to plan well. The playbook is the key reference — it tells Q what this stream expects, what a good task looks like, what inputs are typically needed. Specs reinforce this — they define what's needed, and if something is missing, it should probably be asked about. Over time, specs may also say "don't worry if X is missing, use default Y" — reducing unnecessary questions.

Q asks itself:

- Does the task description clearly state what needs to be done?
- Are there ambiguities that could lead to wasted planning?
- Are there missing inputs the playbook or specs expect?
- Are there choices the user should make before Q plans?

### Outcomes

**Ready** — Q has enough. If it learned anything useful from reading the stream knowledge (e.g., "the playbook says these proposals always need a pricing section"), it appends a `## Discovery` section to `task.md` with its synthesis. Then the run auto-transitions to planning.

**Questions** — Q needs clarification. Q uses AskUserQuestion to ask structured questions. The user answers via the island UI. Q can ask follow-ups naturally within the same session. When Q has enough, it synthesizes everything and appends a `## Discovery` section to `task.md`. Then the run transitions to planning.

### Enriching task.md

Discovery's primary output is an enriched task description. Q appends below the user's original text, under a `## Discovery` heading. The user's words stay intact at the top. Q's enrichment is clearly delineated.

```markdown
---
title: Draft Q4 Proposal
stream: acme-client
---

Draft a proposal for the Acme client.

## Discovery

Budget: $50k–$150k (confirmed with user).
Deadline: End of Q2.
Focus: Pricing and technical comparison per Acme's stated priorities.
The attached deck is from 2024 — user confirmed it's still the latest version.
```

This means:

- Planning reads `task.md` and has everything. No extra files, no extra reading list.
- The task is self-contained. Anyone (human or agent) reading the task sees the full picture.
- The user can edit or remove anything Q added.
- Git tracks exactly what Q contributed (the `## Discovery` section in the diff).

When Q has no questions and nothing useful to add (e.g., the task already has rich context), it may write nothing to `task.md` at all — just transition to planning.

### Prompt Goals

The discovery prompt should be tuned for speed and judgment, not depth. Q is not researching — it's triaging.

- **Read what's there first; ask only about gaps.** Q reads the materials at hand (task description, inputs, playbook, specs, samples) before deciding whether to ask anything. Questions are about what those materials don't cover — never about things the playbook or specs already answer. Web research (`WebFetch`, `WebSearch`) is for filling specific gaps when needed (e.g., looking up a person or company mentioned in the task), not a default exploration mode.
- **Bias toward proceeding.** If Q can plan with what it has, even imperfectly, it should proceed. Don't ask questions just because you could. The worst failure mode isn't "Q planned with incomplete info" (the user catches this at plan review) — it's "Q asks annoying questions on every task."
- **Few, focused questions.** 1–3 questions max per round. High-leverage questions that would materially change the plan. Not a laundry list.
- **Structured answers.** Use AskUserQuestion with multiple-choice options. Easier for the user, more useful for planning, and translates cleanly to future channels (Slack buttons, email reply templates).
- **Fast.** Discovery should complete in seconds, not minutes.

### Calibration: when to ask vs. proceed

The bias-to-proceed heuristic is the entire UX. Ship the prompt with worked examples baked in. Three patterns that calibrate the line:

**Ask when the playbook lists a required input that's missing AND it would change the plan.**

- Stream playbook lists pricing as a required section. Task: "Draft Q4 proposal." Inputs: a pitch deck, no rate information. The deck doesn't carry pricing. Pricing materially shapes the plan. → **Ask** ("What's the budget range for this engagement?") with structured options spanning realistic ranges.

**Proceed when missing fields have reasonable defaults from the playbook or specs.**

- Stream playbook says "default engagement length is 6 months unless specified." Task: "Draft Q4 proposal" missing duration. Defaults are reliable; the user catches deviations at plan review. → **Proceed.** Optionally append a `## Discovery` note: "Assuming standard 6-month engagement per playbook default."

**Proceed when a thin task description maps cleanly onto a samples-rich stream.**

- Task: "Update onboarding checklist" with no inputs and only a one-line title. Stream has 5 samples of past onboarding checklists and a spec listing the standard sections. The plan can clearly mirror prior work. → **Proceed** without writing to `task.md`. Discovery's job is to triage, not to add ceremony.

The pattern: **ASK** when (a) the playbook or spec lists something as required AND (b) Q can't derive it from inputs/specs/samples AND (c) it would change the plan. **PROCEED** otherwise. Over time, specs may say "if X is missing, assume Y" — that further reduces unnecessary questions and is a separate stream-level investment.

## Lifecycle and Run State

Discovery adds one new status to `.run.json`:

| Status        | Meaning                                                         |
| ------------- | --------------------------------------------------------------- |
| `discovering` | Discovery agent is running (including waiting for user answers) |

No `discovered` status. When discovery completes, the loop writes `status: 'planning'` immediately. The `discovering` → `planning` transition is instantaneous — nothing renders between them.

The full `RunInfo.status` union becomes:

```
'discovering' | 'planning' | 'plan_ready' | 'working' | 'completed' | 'stopped'
```

The `stoppedDuring` union gets `'discovery'` alongside `'planning'` and `'working'`.

### Phase Records and pendingQuestions

Discovery uses the `phases` array on `RunInfo` (see [Working](working.md) for the full `PhaseRecord` and `RunInfo` type definitions). When discovery completes, a `PhaseRecord` with `phase: 'discovery'` is appended — recording `costUsd`, `durationMs`, and `sessionId`. The panel reads `phases.find(p => p.phase === 'discovery')` for duration, cost, and session transcript link.

When discovery is blocking on AskUserQuestion, the `pendingQuestions` field on `RunInfo` stores the current question input. Cleared when the user answers. This enables client reconnect and multi-channel adapters to read the pending questions from the task content API.

**Stale-run cleanup must clear `pendingQuestions`.** When `clearStaleRun()` flips a leftover `'discovering'` status to `'stopped'` (server restart, HMR, etc.), it also clears `pendingQuestions`. Otherwise the client could read a stopped run with `pendingQuestions` still set and incorrectly render the question UI. The render rule is "if `pendingQuestions` is present, show the question UI" — so the disk write must keep status and pendingQuestions consistent.

### Canonical write order between discovery and planning

Order matters for crash recovery:

1. Discovery `query()` resolves successfully. Q has already written any `## Discovery` section to `task.md` and exited.
2. `commitGitState('[stream/task] Discovery complete')` — captures the `## Discovery` diff (no-op if Q wrote nothing, since `commitGitState` is a no-op on a clean tree).
3. Append `PhaseRecord { phase: 'discovery', sessionId, costUsd, durationMs, ... }` to `phases` on `.run.json`.
4. Flip `.run.json.status` to `'planning'` (combine with step 3 in a single atomic write where possible).
5. Run the planning agent.

A crash between step 2 and step 3 leaves a "Discovery complete" commit on disk but no `PhaseRecord` for it. On the next read, `clearStaleRun` flips status to `'stopped'` and the user sees Restart options. The commit remains in history; the next discovery will append a fresh `PhaseRecord`. No data loss; no inconsistency that requires manual recovery.

### Loop dispatch

In `loop.server.ts`, the `runLoop` function dispatches based on mode:

```typescript
if (mode === 'discovery') {
  // Run discovery, then planning sequentially
  const discoveryStatus = await runDiscoveryIteration(...)
  if (discoveryStatus !== 'completed') {
    // 'stopped' (user/error/budget) — don't continue to planning
    finalStatus = discoveryStatus
  } else {
    // Discovery succeeded — commit and continue to planning.
    // commitGitState is a no-op on a clean tree, so this only creates a
    // commit if Q wrote a ## Discovery section to task.md.
    commitGitState(`[${streamName}/${taskName}] Discovery complete`)
    finalStatus = await runPlanningIteration(...)
  }
} else if (mode === 'planning') {
  finalStatus = await runPlanningIteration(...)
} else {
  finalStatus = await runWorkingLoop(...)
}
```

`runDiscoveryIteration` follows the same structure as `runPlanningIteration`: create a session, run `query()`, handle abort/budget/error, return `Promise<RunInfo['status']>`. The key difference: discovery uses `canUseTool` with AskUserQuestion blocking and question broadcasting, while planning uses `createAutomatedCanUseTool()` (fully automated). In practice, discovery returns `'completed'` on success and `'stopped'` for any abort/error/budget case (with `stopReason` and `stoppedDuring` written to `.run.json` before returning). The dispatcher only proceeds to planning on `=== 'completed'`.

### Type changes required

Add `'discovery'` to every `mode` union and `'discovering'` to every `RunInfo.status` union. Concrete sites:

- `app/api/run/start/route.ts` — request body schema (currently `'planning' | 'working'`).
- `lib/run/loop.server.ts` — `startRun()` and `runLoop()` signatures + dispatch.
- `lib/fs/types.ts` — `RunInfo.status` and `RunInfo.stoppedDuring` unions (see [Working](working.md) for the full new shape).
- Client run-actions hook (find via `grep -rn '"planning" | "working"' happyhq/components` — look for the `useRunActions` / `use-run-actions` file).

After updating the unions, run `pnpm check-types` from `happyhq/`. TypeScript will surface every site that switches on `status` or `mode` without a default — add a `'discovering'` arm to each. Don't suppress with `as any`; an unhandled status arm is the kind of bug that goes silent in production.

### Billing

Discovery cost is tracked within the same billing task run record that spans the full run lifecycle. The `runLoop` function starts a billing record at the top (`startTaskRun`) and finalizes at the bottom (`finalizeTaskRun`). When `mode: 'discovery'`, the loop runs discovery then planning sequentially — the billing record naturally spans both.

After discovery completes, a `PhaseRecord` with `phase: 'discovery'` is appended to the `phases` array on `.run.json`, recording cost and duration. The `costUsd` field on RunInfo tracks the cumulative total (discovery + planning + working). `updateUsage` calls happen after each phase.

## Plumbing

### Question event on the run stream

The run stream already broadcasts activity events via `notifyClient` in the run loop. Discovery adds a new event type:

```typescript
// New variant in ChatStreamEvent
| { type: 'question'; sessionId: string; questions: AskUserQuestionInput['questions'] }
```

`notifyClient` in the run loop is `(event) => broadcast(encodeEvent(event))`. Adding the new variant to `ChatStreamEvent` is sufficient — no new transport is needed. This uses the same callback pattern that PostToolUse hooks already use to emit activity step events; it does not go through `filterMessage` (which converts SDK messages into events, a separate path).

### canUseTool callback

```typescript
canUseTool: async (toolName, input, { signal }) => {
  if (toolName === 'AskUserQuestion') {
    // Setup ordering: disk first (most critical for reconnect), then
    // task.md pending, then broadcast, then block.
    try {
      await updateRunInfoPendingQuestions(taskName, input.questions)
      await updateTaskMdPending(taskPath(taskName), 'clarification')
    } catch (err) {
      // Setup-write failure: log, then deny rather than block on
      // input we can't surface.
      log('run.error', {
        stream: streamName,
        task: taskName,
        error: 'Discovery state write failed',
      })
      return { result: 'deny', message: 'Discovery state write failed' }
    }
    notifyClient({ type: 'question', sessionId, questions: input.questions })
    try {
      const answers = await Promise.race([
        waitForAnswer(sessionId),
        new Promise<never>((_, reject) => {
          signal.addEventListener('abort', () => reject(new Error('Aborted')), {
            once: true,
          })
        }),
      ])
      return { result: 'allow', updatedInput: { ...input, answers } }
    } finally {
      // Clear pendingQuestions + pending whether answered or aborted.
      // Fire-and-forget — the loop's next status write reconciles disk state.
      await updateRunInfoPendingQuestions(taskName, undefined).catch(() => {})
      await updateTaskMdPending(taskPath(taskName), undefined).catch(() => {})
    }
  }
  return {
    result: 'deny',
    message: `Tool ${toolName} not available in discovery mode`,
  }
}
```

Same structure as the learning agent's `canUseTool`, with three additions specific to running inside the run loop:

1. Broadcasts a `question` event through the **run** SSE stream via `notifyClient` (learning broadcasts on the chat stream).
2. Writes `pendingQuestions` to `.run.json` before blocking, clears it after.
3. Sets `pending: 'clarification'` on `task.md` before blocking, clears it after.

**Setup ordering before blocking** (disk write first because it's the only correctness mechanism for reconnect; the SSE event is a fast path):

1. `updateRunInfoPendingQuestions(taskName, input.questions)` — disk first.
2. `updateTaskMdPending(taskPath(taskName), 'clarification')` — drives the task-list badge.
3. `notifyClient({ type: 'question', ... })` — fire-and-forget.
4. `Promise.race([waitForAnswer(sessionId), abortPromise])` — block.

If step 1 or 2 throws, the callback logs `run.error`, returns `{ result: 'deny', message: 'Discovery state write failed' }`. Q falls back without blocking; we never block on user input we can't reliably surface. **No silent denials.**

**Cleanup** (in `finally`): clear `pendingQuestions` and `pending` in the same order as setup, both with `.catch(() => {})` since the callback is exiting and the loop's next status write will reconcile disk state.

**Implementation note: `updateRunInfoPendingQuestions` is a new helper.** The existing `writeRunInfo` (private in `lib/run/loop.server.ts`) takes a full `RunInfo`, not a partial. The simplest implementation is a thin read-merge-write wrapper:

```typescript
async function updateRunInfoPendingQuestions(
  taskName: string,
  questions: AskUserQuestionInput['questions'] | undefined,
): Promise<void> {
  const info = await readRunInfo(taskName)
  if (!info) return
  await writeRunInfo(taskName, { ...info, pendingQuestions: questions })
}
```

Live alongside `writeRunInfo` in `lib/run/loop.server.ts`, or hoist both to `lib/fs/run-json.server.ts` if `parseRunInfo` lands there too. The spec doesn't prescribe — implementer's call. `updateTaskMdPending` is the parallel pattern, already in `lib/fs/task-md.server.ts`.

### Event vs. disk precedence (rule)

The disk is authoritative; the SSE `question` event is a fast path. Concretely:

- The client's render rule is **"if `pendingQuestions` is set on `.run.json`, show the question UI"** — regardless of whether the SSE event fired.
- The SSE `question` event is fire-and-forget (the run stream uses `writer.write(...).catch(() => {})` — see [Working](working.md) on stream writes). A client mid-reconnect can miss it; the disk write closes that race.
- Multi-channel adapters (future Slack, email) read `pendingQuestions` from `.run.json` directly. They never depend on the SSE event existing.

If discovery has questions but the SSE event was dropped, the client still renders correctly on next read of the task content API. The event is an optimization for in-app liveness, not a correctness mechanism.

### Client reconnect

If the client disconnects and reconnects while discovery is waiting for answers, the task content API (`GET /api/fs/task`) returns `.run.json` including `pendingQuestions`. The client sees `status: 'discovering'` + `pendingQuestions` and re-renders the question UI. This also serves the multi-channel case — a Slack adapter reads `pendingQuestions` from `.run.json` to know what to relay.

### POST /api/run/answer

```typescript
// POST /api/run/answer
// Body: { answers: Record<string, string> }
// Returns 200 { status: 'answered' } on success
// Returns 400 { error: string } on schema validation failure
// Returns 404 { error: 'No pending question' } when no session is blocked
```

**Validation:** validate the body inline (TS, no zod) — match the existing `app/api/chat/answer` style. Body must be an object with an `answers` field that is a non-array object whose values are all strings. Reject malformed bodies with 400.

**No-pending-question case:** `submitAnswer(sessionId, answers)` returns `false` when there's no resolved promise to consume (no active session, or the session was just aborted). Return 404 in that case — never pretend the answer was accepted, since the SDK doesn't get the answer and Q won't continue.

**Race with Stop:** the user could submit answers while a Stop request is in flight (or vice versa). The Promise.race in `canUseTool` already handles the SDK side — abort wins, the answer is dropped harmlessly. The endpoint side: if `submitAnswer` returns false because the session was just aborted, surface 404 — the client renders the run as stopped on its next state read.

When the promise resolves, `canUseTool` clears `pending: 'clarification'` on `task.md` and returns the answers to the SDK. Q continues within the same `query()` call — more activity events stream through the existing connection.

The client doesn't need to know the sessionId — the server knows which discovery session is active (module-level state, same as `getActiveRunInfo()`).

## Agent and Wiring

Discovery is a new agent mode alongside learning, planning, and working. The `discoveryAgentOptions()` factory in `lib/agents/config.server.ts` defines it.

### Model and Budget

- **Model:** Opus with adaptive thinking — same as learning, planning, and working. Consistency over cost optimization at v0; revisit if discovery's per-Start cost shows up as a real concern in the wild. Resolve via `config.models.discovery` against `MODEL_IDS` (don't hardcode a model string).
- **Budget:** New `config.limits.discoveryBudgetUsd`. Default conservative — discovery should still be cheap and fast even on Opus, since it's read-and-assess, not synthesize-and-create.

### Tools

```typescript
allowedTools: [
  'Read',
  'Glob',
  'Grep',
  'Write', // Update task.md with ## Discovery
  'WebFetch',
  'WebSearch',
  'Bash(git:*)',
  'Bash(ls:*)',
  // AskUserQuestion NOT listed — triggers canUseTool for blocking
]
```

**Explicit non-configuration** (so the implementer doesn't copy from learning by reflex):

- No `mcpServers` — discovery uses no custom MCP tools (no `ProcessSample`, no `CreateTask`, etc.).
- No `agents` — no custom subagents (no Drafting). Built-in subagent types are also unused.
- No `EnterPlanMode` / `ExitPlanMode` (in `disallowedTools`).
- `persistSession: true` (enables session resume on budget stop, same as planning/working).
- `settingSources: []` (SDK isolation mode, same as other modes).

### PostToolUse hook for Write

Discovery's factory needs a `PostToolUse` hook that fires after `Write` to emit `task_content_changed` — same pattern as planning/working at [`happyhq/lib/agents/config.server.ts:507-515`](happyhq/lib/agents/config.server.ts#L507-L515). Without this, the user won't see the `## Discovery` section appear in the panel until they manually refresh.

```typescript
hooks: {
  PostToolUse: [
    {
      hooks: [
        async (input) => {
          if (input.hook_event_name !== 'PostToolUse') return { continue: true }
          if (input.tool_name === 'Write' || input.tool_name === 'Edit') {
            opts?.notifyClient?.({ type: 'task_content_changed' })
          }
          return { continue: true }
        },
      ],
    },
  ],
}
```

Same shape as planning's hook; only the agent factory it's wired to differs.

### Config schema additions

The factory needs `config.models.discovery` and `config.limits.discoveryBudgetUsd` to exist. These fields don't exist today — the schemas at `happyhq/lib/config/types.ts` only list learning/planning/working. Add:

- `AppConfig.models.discovery?: ModelConfig` (optional — user override).
- `AppConfig.limits.discoveryBudgetUsd?: number` (optional — user override).
- `ResolvedConfig.models.discovery: Required<ModelConfig>` (required in resolved form).
- `ResolvedConfig.limits.discoveryBudgetUsd: number` (required in resolved form).

Add corresponding defaults in `happyhq/lib/config/defaults.ts`. Mirror the existing `models.planning` / `limits.planningBudgetUsd` defaults — Opus model with adaptive thinking, conservative budget.

The factory then reads them the same way the other factories do today:

```typescript
// happyhq/lib/agents/config.server.ts — discoveryAgentOptions
model: MODEL_IDS[config.models.discovery.model],
maxBudgetUsd: config.limits.discoveryBudgetUsd,
```

### System prompt

New file: `prompts/discovery.md`. The prompt tells Q:

- Your job is the gut check before planning: does this task have what's needed to plan well?
- **Read first, ask second.** Read the task description, inputs, playbook, specs, and samples _before_ deciding whether to ask anything. Questions are about what those materials don't cover.
- If everything's there, write a brief `## Discovery` synthesis to `task.md` (or nothing if there's nothing useful to add) and exit.
- If something's genuinely missing that would change the plan, use `AskUserQuestion` with structured multiple-choice options.
- Bias toward proceeding. Don't ask just because you can.
- 1–3 focused questions max per round.
- Web research (`WebFetch`, `WebSearch`) is for filling specific gaps when needed — not a default exploration mode.

The reading list is built the same way as planning: `buildReadingList()` from `prompts.server.ts` injects specs, samples, inputs, and playbook paths. Worked calibration examples ship in the prompt itself (see [Calibration: when to ask vs. proceed](#calibration-when-to-ask-vs-proceed)). Without them, the prompt iterates by vibe.

### Logging

Discovery emits the existing `run.*` structured-log events (`lib/log.server.ts`). No new event namespace.

- `run.started` already includes a `mode` field — when `mode: 'discovery'`, that's discovery starting.
- `run.stopped` with `stoppedDuring: 'discovery'` for user/error/budget aborts.
- `run.error` for fatal errors during discovery (including the `canUseTool` setup-write failure described above).
- `run.completed` for the run as a whole (after planning + working finish).

PhaseRecord on `.run.json` captures success metrics (cost, duration, sessionId) — no separate per-phase log event needed. The mode and `stoppedDuring` fields are sufficient to grep discovery activity.

## Restart and Cleanup

Discovery is a heads-up preamble, not a savepoint to "restart from." It just runs whenever a fresh run starts (or resumes from a stopped-during-discovery state — naturally, by sending `mode: 'discovery'`). The user is in control of `task.md` directly: they can edit it freely between runs to remove a stale `## Discovery` section, change the description, or anything else.

### Restart options

The two visible restart paths after a stopped or completed run:

| Restart from | `mode` sent  | What happens                                                                                                  |
| ------------ | ------------ | ------------------------------------------------------------------------------------------------------------- |
| Planning     | `'planning'` | `plan.md` deleted, `working/` and `outputs/` cleared. `task.md` (including any `## Discovery`) is untouched.  |
| Working      | `'working'`  | `working/` and `outputs/` cleared, `plan.md` restored from "Plan accepted" commit. Everything else preserved. |

There is no "Restart from discovery" button. The mode `'discovery'` exists in the API for fresh starts and for resuming a stopped-during-discovery run, but it isn't surfaced as a restart button — completed runs don't offer "redo from discovery." If a user wants Q to look at the task fresh, they edit `task.md` to remove the prior `## Discovery` section (and/or change the description) and click Restart from plan; planning will read whatever's there. For a fully clean slate, duplicate the task.

### startRun cleanup

The `startRun` function's fresh-run cleanup block does **not** gain a discovery case. Discovery has nothing to clean up before running — `task.md` is the user's, and the `## Discovery` section (if any from a prior run) is just text in the file. Q's prompt handles the "task already has a `## Discovery` section" case by deciding whether to update or leave it (judgment in the prompt; not enforced by code).

The existing `mode === 'planning'` cleanup handles deleting `plan.md` and clearing `working/`/`outputs/`. The existing `mode === 'working'` cleanup handles `restorePlanFromGit`. Discovery adds nothing.

### Discovery git commit

When discovery completes successfully and writes anything to `task.md`, the loop commits: `[stream/task] Discovery complete`. This commit is a chronological marker in git history showing what Q contributed. Nothing in v0 reads this commit programmatically — restart paths don't use it as an anchor. Its only role is auditability (git log + diff show what discovery added to `task.md`).

If Q wrote nothing (clean tree), no commit happens. That's fine — the PhaseRecord on `.run.json` still records that discovery ran.

### Stopping during discovery

There is no dedicated "skip discovery" button during the live Q&A. The Stop button (already present during every run phase) serves this purpose. When the user stops during discovery:

- The session is aborted; `status: 'stopped'`, `stoppedDuring: 'discovery'` is written.
- The `canUseTool` `finally` clears `pendingQuestions` and `pending: 'clarification'`. The island clears.
- The task panel shows the standard stopped affordances: **Continue** (resumes discovery — sends `mode: 'discovery'`, picks up where it stopped) and **Restart from plan** (sends `mode: 'planning'`, runs planning against the current `task.md`).

This keeps the UI simple (one Stop button, not Stop + Skip) and gives the user a clear choice between "let Q keep triaging" (Continue) and "I'm done with triage, just plan it" (Restart from plan).

## Task Panel UI

Discovery follows the same shape as planning and working: a phase header in the task card, sub-rows beneath it for items that exist during the phase, and a duration label after.

### The phase header is stable

The header label does **not** swap when questions surface. The header is the phase indicator; what's _happening within_ the phase is shown as sub-rows beneath it.

```
 Reviewing the task...                         [Stop]
```

- **While Q is reviewing (no questions):** "Reviewing the task..." with the activity stream beneath it (same activity-step events that Planning uses today, just on the discovery session).
- **While Q has questions pending:** The header text stays "Reviewing the task..." A question sub-row appears beneath it (see below). The activity stream pauses; the sub-row is what tells the user the ball is in their court.
- **After completion:** The header transitions to the completed-state row "Reviewed Ns" — same shape and weight as "Planned 3m" and "Worked 4m" elsewhere in the panel.

### Sub-rows beneath the header

While discovery is running, sub-rows appear beneath "Reviewing the task..." for items that exist during the phase — same pattern as file rows, attachment rows, or the plan row beneath other phase headers.

The one sub-row discovery uses in v0:

- **Question row** — appears whenever Q has open questions waiting on the user. The row indicates that questions exist and points the user at the island, where the actual answer UI lives. No question count, no first-question-header — keep the row simple. Whether answered question rows persist (with a check) or vanish is intentionally TBD; decide at build time by feel.

### Where the user actually answers

Questions render in the **island** as full `AskUserQuestion` blocks — the same component the learning chat already uses, just rendered in the island during a run instead of in the chat composer. The user selects answers and submits. Same visual treatment, same components, different rendering context.

When the user submits answers (`POST /api/run/answer`), the question block clears from the island, the question sub-row in the task card updates (per the persist/vanish decision above), and the activity stream resumes as Q processes the answers. If Q asks follow-ups, a new question block appears.

**Activity stream behavior while questions are open.** When `pendingQuestions` is set, `query()` is blocked in `canUseTool` — the SDK is not generating events. The activity area beneath the "Reviewing the task..." header has nothing live to render, so the question sub-row is what fills that area. Don't show a generic spinner alongside the question — it would imply Q is doing something when really Q is waiting on the user. The sub-row alone makes the wait state legible.

### Transition to planning

When discovery completes and the loop flips status to `'planning'`, the user sees the header text change from "Reviewing the task..." to "Planning..." and the activity stream restart with planning's events. There's no flicker, no spinner reset, no empty intermediate state — same shape as the existing `planning → plan_ready` transition. The brief gap (write status + append PhaseRecord + start planning's `query()`) is invisible at human timescales. The Stop button persists across the transition.

### Completed-state row

```
 Reviewed                                       2m 10s
```

Clicking the row opens the discovery session in the chat-session viewer — the same component used for clicking "Planned" or for opening any learning chat. The transcript shows what Q read, what it considered, and the inline question/answer rounds (`AskUserQuestion` calls render in the transcript exactly as they would in any chat session — there is no second display path).

**Concretely: reuse `openChatSessionWindow`.** The Planned-row handler today is at `happyhq/components/features/tasks/panel/index.tsx` (search for `planningSessionId`):

```typescript
openChatSessionWindow(
  streamSlug,
  [taskContent.run!.planningSessionId!],
  'Planning Session',
  `chat-${taskSlug}-planning`,
)
```

Discovery's "Reviewed Ns" handler calls the same helper with the discovery phase record's `sessionId` and a discovery-flavored label/key:

```typescript
openChatSessionWindow(
  streamSlug,
  [discoveryPhase.sessionId],
  'Discovery Session',
  `chat-${taskSlug}-discovery`,
)
```

`openChatSessionWindow` lives at `happyhq/components/features/desktop/windows/chat/open-chat-window.ts`. No new viewer to build.

The duration shown is **compute time**, recorded as `durationMs` on the discovery `PhaseRecord`. It does _not_ include time spent waiting for the user to answer questions. A discovery run that took 90 seconds of compute but waited 20 minutes for an answer reads as "Reviewed 1m 30s," not "Reviewed 21m 30s." The row is honest about what Q actually did.

> **Implementation note (transcript display).** Discovery sessions are SDK sessions associated with a run, accessed via `phase.sessionId`. They do not live in `.chats/{sessionId}/` like learning chats. The transcript-display component reads from the SDK journal regardless of which session-creation path produced it — to the user, the experience is identical. Don't fork into a second display component.

### Clarification badge (task list)

Separate from the in-card sub-row, the task list item — anywhere a task title appears in a list (sidebar, home, search results) — shows a clarification badge when Q is waiting for answers:

```
  Draft Q4 Proposal              · Needs clarification
```

This uses the existing `pending: 'clarification'` indicator pattern — same visual treatment as other pending states. Together with the in-card question sub-row, this gives the user two ways to find a discovery session that needs them: the badge wherever they encounter the task in a list, and the sub-row when they're already viewing the task.

## v0 vs. v1 scope

Everything documented in this spec is in v0 _unless_ listed below. The deferred items are not abandoned — they're held for v1 once we see how v0 lands in the wild.

**Deferred from v0 (revisit after v0 ships):**

- **`skipDiscovery` playbook frontmatter flag.** v0 runs discovery on every Start. Bias-to-proceed in the prompt should be enough — if a stream's playbook is rich and a task is well-formed, discovery transitions to planning in seconds without writing anything. Add the flag once we observe ask-rates that warrant a stream-level opt-out. Requires extending `PlaybookFrontmatter` (currently a closed schema) when added. Design held below for reference.
- **Stream selection during discovery.** Tasks created with just a title would let Q suggest which stream to assign. Out of v0 scope; the architecture supports it.
- **Channel adapters (Slack, email).** This spec keeps the architecture channel-ready (`pendingQuestions` on `.run.json`, `pending: 'clarification'` as a notification trigger, `AskUserQuestion` as the abstraction), but no adapter ships in v0. See [Multi-Channel Awareness](#multi-channel-awareness) for the readiness story.
- **Concurrency-safe answer routing.** `POST /api/run/answer` resolves against module-level singleton state (same pattern as `getActiveRunInfo()`). When concurrency lands and the singleton becomes a `Map<>` (see [Working](working.md)), the answer endpoint will need a task identifier in the body. Decoupled from this PR.

**Bundled into v0 (despite the original spec splitting them):**

- **`phases: PhaseRecord[]` migration on `RunInfo`.** Discovery's `PhaseRecord` write is the forcing function for the new shape on `RunInfo` described in [Working](working.md). The two ship together as one PR — splitting them means the refactor lands without a forcing function (and rots) or discovery adds yet another flat field set (`discoveryCostUsd`, `discoverySessionId`, ...) to the structure the refactor is trying to replace. See [Working](working.md) for the new shape and the read-time compat shim that handles existing `.run.json` files.

### v1 design — `skipDiscovery` playbook flag (held for later)

Playbook frontmatter gains an optional `skipDiscovery` field:

```yaml
---
title: SOW Generation
skipDiscovery: true
---
```

When `skipDiscovery: true`, the Start button sends `mode: 'planning'` instead of `mode: 'discovery'` — discovery is bypassed entirely. No "Reviewed" row appears in the panel. The server also enforces this: if `mode: 'discovery'` arrives but the playbook says `skipDiscovery: true`, the server redirects to `mode: 'planning'`.

This lives in the playbook because it's the right granularity — "I trust Q to plan SOWs without asking, but for research tasks it should always check." It's human-editable and is already read by the system during prompt construction. Adding it requires extending `PlaybookFrontmatter` (currently a closed schema) at v1 implementation time.

## Multi-Channel Awareness

This spec covers the in-app experience only. The design is channel-agnostic by construction:

- **Q writes task.md, not the channel.** A Slack adapter's job is I/O: relay the user's message to create the task, relay Q's questions to a Slack thread, relay the user's answers back to Q. Q does all the thinking and writing. The adapter never needs to understand markdown or frontmatter.
- **AskUserQuestion is the abstraction.** In-app, it renders in the island. In Slack, an adapter translates it to message actions. In email, it becomes a reply template. The agent code is identical — it calls AskUserQuestion regardless of channel.
- **`pending: 'clarification'` is the notification trigger.** When the multi-channel layer exists, it watches for `pending` changes on tasks and notifies the appropriate channel (tracked in a future `notify` field on `task.md` — see [Task List](task-list.md) multi-channel section).
- **task.md is the single truth.** After discovery, the task description is complete regardless of which channel the user answered from. Anyone reading the task sees the full picture.

A separate spec will cover the channel routing layer, adapters, and the `source`/`notify` fields. The key architectural insight: channels are dumb pipes, Q is the only writer, and task.md is the canonical object.

**Future: stream selection during discovery.** Today, Start requires a stream assignment. A natural extension: tasks created with just a title could enter discovery without a stream, and Q could suggest which stream to assign based on the task description. This would make quick-add even faster (title → Start → Q figures out the rest). Deferred from v0 (see [v0 vs. v1 scope](#v0-vs-v1-scope)); the architecture supports it.

## End-to-end smoke scenarios

The unit tests in [Testing](#testing) prove the plumbing is wired. The smoke harness (`pnpm smoke:e2e` → `scripts/smoke-e2e.ts`) proves the _experience_ works — real Chromium driving the real dev server against real Claude SDK calls. Discovery extends this in two ways:

1. The existing golden path (plan → work) runs through discovery as its first phase. The fixture task should be rich enough that discovery proceeds silently. This is a free assertion that the silent-case happy path doesn't break the rest of the loop.
2. Add discovery-specific scenarios that exercise the heads-up behaviors — questions appearing, answers programmatically submitted, restart paths preserving state.

**Fixture stream** under `scripts/smoke-fixtures/discovery/email-intros/` — neutral fictional names (no real customer or user data per project convention):

- `playbook.md` — the typical email-intros playbook: research both parties, find common ground, draft, review. Notes "always include a personal anecdote about at least one of them" as a required step.
- `specs/intro-email.md` — the spec: must include salutation, why-introducing, one-line per person, **personal anecdote**, call to action. Tone, length, banned-words list.
- `samples/intros/intro-1/extracted.md` — one fictional past intro the user wrote (warm tone, anecdote in body).
- Two task fixtures: a thin one (`scripts/smoke-fixtures/discovery/tasks/thin-intro.md` — title and frontmatter only, no description) and a rich one (`scripts/smoke-fixtures/discovery/tasks/rich-intro.md` — full description with goal, anecdote, parties named).

**Scenario 1 — Silent proceed (extends the existing golden path).** Use the rich task fixture. Click Start. Assert: header shows "Reviewing the task..." briefly; transitions to "Planning..." without surfacing any question UI; no `## Discovery` section appended (or appended with non-question synthesis only); planning produces `plan.md`; PhaseRecord `{ phase: 'discovery', durationMs > 0, sessionId }` exists in `.run.json`.

**Scenario 2 — Asks questions and integrates answers.** Use the thin task fixture. Click Start. Assert: question sub-row appears beneath the header; full `AskUserQuestion` block renders in the island. Take a screenshot for visual regression. Programmatically submit answers via `POST /api/run/answer` with reasonable values. Assert: question UI clears; activity stream resumes; eventually transitions to "Planning..."; `task.md` now contains a `## Discovery` section reflecting the answers; planning produces a `plan.md` that references what was learned in discovery.

**Scenario 3 — Restart from plan preserves `## Discovery`.** After Scenario 2 reaches `plan_ready`, click "Restart from plan." Assert: `task.md` still contains the `## Discovery` section from Scenario 2; `plan.md` is regenerated; planning runs.

**Where the scenarios live.** Scenario 1 extends `scripts/smoke-e2e.ts` (the golden path). Scenarios 2 and 3 can live in the same script as additional test functions or split into `scripts/smoke-discovery.ts` with a sibling `smoke:discovery` package.json script — implementer's call. The harness pattern (boot a fresh dev server pointed at a per-run `/tmp/happyhq-smoke-<uuid>`, pre-seed the fixture stream, drive Chromium, assert filesystem + DOM state) is established; reuse it.

**Why this is worth the cost.** Smoke runs against real Opus calls, so each run is several dollars. Worth it because: (a) discovery's value is "did Q ask sensible questions or proceed sensibly?" — a judgment-driven UX that unit tests can't verify; (b) the calibration anchor lives in the prompt, and the only way to prove the prompt holds up under real model behavior is to run against the real model; (c) regression baseline for prompt drift on future model upgrades. Run discovery scenarios in CI on PRs that touch `prompts/discovery.md`, `lib/agents/config.server.ts` (discovery factory), or `lib/run/loop.server.ts` (discovery iteration / canUseTool). Don't run them on every unrelated PR.

## Acceptance Criteria

**Run loop and agent:**

- [x] Start button triggers discovery (not planning directly) — v0 always runs discovery on Start
- [x] `discoveryAgentOptions()` factory exists in `lib/agents/config.server.ts`: Opus (resolved via `config.models.discovery` against `MODEL_IDS`), adaptive thinking, no `mcpServers`, no `agents`, `persistSession: true`, `settingSources: []`, `disallowedTools: ['EnterPlanMode', 'ExitPlanMode']`
- [x] Discovery agent reads task inputs, stream playbook, specs, and samples (read-first rule from prompt)
- [x] `runDiscoveryIteration()` exists in `lib/run/loop.server.ts`, mirroring `runPlanningIteration` shape; signature returns `Promise<RunInfo['status']>`. In practice returns `'completed'` on success and `'stopped'` for any abort/error/budget case (with `stoppedDuring: 'discovery'` and any `stopReason` written to `.run.json` before returning)
- [x] Loop dispatcher's `if (mode === 'discovery')` branch only proceeds to `runPlanningIteration` when `runDiscoveryIteration` returns `'completed'`; any other return value is propagated as the final status without running planning
- [x] When Q has enough context, discovery auto-transitions to planning without user action
- [x] Loop commits `[stream/task] Discovery complete` after successful discovery, before planning
- [x] Discovery appends a `PhaseRecord` with `phase: 'discovery'` to `phases` on `.run.json`, then flips status to `'planning'` (single write where possible)
- [x] Planning reads the enriched task.md (no changes to planning's reading list needed)

**`canUseTool` and answers:**

- [x] `canUseTool` setup ordering: write `pendingQuestions` to `.run.json`, set `pending: 'clarification'` on task.md, broadcast `question` event, then block on `Promise.race([waitForAnswer, abort])`
- [x] Setup write failure (steps 1 or 2) logs `run.error` and returns `{ behavior: 'deny', message: ... }` — never blocks on input we can't surface
- [x] Cleanup in `finally` clears both `pendingQuestions` and `pending: 'clarification'`, both with `.catch(() => {})`
- [x] Q can ask follow-up questions within the same session (multiple rounds) — sessionId-keyed `waitForAnswer`/`submitAnswer` reused as-is from the chat infra
- [x] `POST /api/run/answer` validates body inline (TS, no zod — mirrors `/api/chat/answer`): `{ answers: Record<string, string> }`, returns 400 on schema fail, 404 on no-pending-question, 200 `{ status: 'answered' }` on success
- [x] When `submitAnswer()` returns `false` (no active session, race with abort), endpoint returns 404 — never silently swallows

**State and types:**

- [x] `'discovery'` added to `mode` union in: `app/api/run/start/route.ts`, `lib/run/loop.server.ts` (`startRun` + `runLoop`), and the client run-actions hook
- [x] `'discovering'` added to `RunInfo.status` union; `'discovery'` added to `RunInfo.stoppedDuring` union (in `lib/fs/types.ts`)
- [x] `pnpm check-types` passes — every existing exhaustive `switch` on `status` or `mode` has a `'discovering'` / `'discovery'` arm
- [x] `parseRunInfo(raw): RunInfo` introduced in `lib/fs/read.server.ts`; all three legacy `JSON.parse(runJson) as RunInfo` sites switch to `parseRunInfo(JSON.parse(runJson))`; shim handles old shape (see [Working](working.md) migration)
- [x] `clearStaleRun` clears `pendingQuestions` along with flipping `'discovering'` status to `'stopped'`
- [x] Q synthesizes what it learned and appends a `## Discovery` section to task.md (or writes nothing when there's nothing useful to add)

**Config schema:**

- [x] `AppConfig.models.discovery?: ModelConfig` and `ResolvedConfig.models.discovery: Required<ModelConfig>` added to `happyhq/lib/config/types.ts`
- [x] `AppConfig.limits.discoveryBudgetUsd?: number` and `ResolvedConfig.limits.discoveryBudgetUsd: number` added to `happyhq/lib/config/types.ts`
- [x] Defaults added to `happyhq/lib/config/defaults.ts` — Opus + adaptive thinking, conservative budget (mirror the planning defaults pattern)
- [x] `discoveryAgentOptions()` reads `config.models.discovery.model` (mapped via `MODEL_IDS`) and `config.limits.discoveryBudgetUsd` — same pattern as planning/working factories

**Hooks and logging:**

- [x] `discoveryAgentOptions()` configures a `PostToolUse` hook that emits `notifyClient({ type: 'task_content_changed' })` after `Write` / `Edit` calls — mirrors the planning/working hook in `lib/agents/config.server.ts`
- [x] Discovery emits the existing `run.*` log events (`run.started`, `run.stopped`, `run.error`, `run.completed`) with `mode: 'discovery'` and `stoppedDuring: 'discovery'` discriminating the phase — no new event namespace
- [x] `canUseTool` setup-write failure emits `run.error` with an explanatory message before returning `{ behavior: 'deny' }` (no silent failures)

**Restart:**

- [x] Restart from planning preserves `task.md` (including any `## Discovery` section), only deletes plan.md, clears `working/`/`outputs/`
- [x] No "Restart from discovery" button surfaced in v0; the `mode: 'discovery'` API path remains for fresh starts and stopped-during-discovery resume
- [x] No `restoreTaskMdFromGit` helper (`task.md` is the user's; the user controls its content between runs)

**UI (task card / island / list):**

- [x] Header in the task card stays "Reviewing the task..." while discovery is active — does NOT swap text when questions surface
- [x] When questions are pending, a question sub-row appears beneath the "Reviewing the task..." header in the task card
- [x] Questions render in the island as full `AskUserQuestion` blocks (same component as learning chat), with the task-card sub-row pointing to the island
- [x] Submitting answers calls `POST /api/run/answer` and clears the question UI from the island
- [x] On reconnect, client reads `pendingQuestions` from task content and re-renders the question UI (disk authoritative; SSE event is fast path)
- [x] Activity area beneath the header shows the question sub-row when questions are open — no concurrent spinner suggesting Q is "doing something"
- [x] Task panel shows "Reviewed Ns" completed-state row with duration from discovery `PhaseRecord` (compute time, not wall-clock)
- [x] Clicking "Reviewed Ns" calls `openChatSessionWindow(streamSlug, [discoveryPhase.sessionId], 'Discovery Session', chat-${taskSlug}-discovery)` — same helper as the existing Planned-row handler
- [x] Discovery → Planning transition is seamless: header text changes from "Reviewing the task..." to "Planning...", activity stream restarts with planning's events, no spinner reset, Stop button persists
- [x] Task list "Needs clarification" badge appears when a task's `pending` is `'clarification'`

**Errors and budget:**

- [x] Discovery errors write `status: 'stopped'` with `stoppedDuring: 'discovery'`
- [x] Budget stop during discovery writes `stopReason: 'budget'` with Continue option
- [x] Stopped or budget discovery does **not** trigger planning — only `runDiscoveryIteration` returning `'completed'` proceeds to `runPlanningIteration` (verified by absence of `phase: 'planning'` PhaseRecord in `.run.json`)

**Billing and gating:**

- [x] Billing record spans discovery + planning (single `startTaskRun` / `finalizeTaskRun` lifecycle)
- [x] `canStart` gate relaxed: title + stream is sufficient (discovery fills in any gaps before planning) — `components/features/tasks/card/index.tsx`

**Smoke (end-to-end, real Opus, real Chromium):**

- [x] Fixture stream `scripts/smoke-fixtures/discovery/email-intros/` exists with playbook, intro-email spec, and one sample (fictional names — no real user data)
- [x] Two task fixtures: `thin-intro.md` (title only) and `rich-intro.md` (full description with anecdote)
- [x] Scenario 1 (silent proceed) — discovery on the rich task transitions to planning without surfacing question UI
- [x] Scenario 2 (asks questions and integrates answers) — discovery on the thin task surfaces question UI, programmatic answers submit, `## Discovery` section reflects answers, planning runs against enriched task.md
- [x] Scenario 3 (restart from plan preserves `## Discovery`) — Restart from plan keeps `## Discovery` in task.md, regenerates plan.md only
- [x] Discovery smoke scenarios live in `scripts/smoke-discovery.ts` (split from the golden path; `pnpm smoke:discovery`) and run in CI via `.github/workflows/smoke-discovery.yml` on PRs touching `prompts/discovery.md`, `lib/agents/config.server.ts`, `lib/run/loop.server.ts`, `scripts/smoke-discovery.ts`, or `scripts/smoke-fixtures/discovery/**`

## Testing

Run loop — discovery mode (`lib/run/loop.server.test.ts`):

- [x] `startRun` with `mode: 'discovery'` writes `.run.json` with `status: 'discovering'`
- [x] Discovery that completes without questions auto-transitions to planning (status becomes `'planning'`)
- [x] Discovery that uses AskUserQuestion sets `pending: 'clarification'` on task.md via canUseTool
- [x] canUseTool clears `pending` after user answers
- [x] canUseTool broadcasts `question` event through `notifyClient` before blocking
- [x] canUseTool writes `pendingQuestions` to `.run.json` before blocking, clears after answer
- [x] Discovery completion appends `## Discovery` section to task.md (covered by smoke; agent has Write permission scoped to `tasks/{taskName}/task.md`)
- [x] Loop commits `[stream/task] Discovery complete` before starting planning
- [x] Discovery appends `PhaseRecord` with `phase: 'discovery'` to `phases` in `.run.json`
- [x] Discovery failure writes `status: 'stopped'` with `stoppedDuring: 'discovery'`
- [x] User stop during discovery aborts the query and writes `stoppedDuring: 'discovery'`
- [x] `clearStaleRun` handles `'discovering'` status
- [x] Budget stop during discovery writes `stopReason: 'budget'`
- [x] Billing: single `startTaskRun` / `finalizeTaskRun` spans discovery + planning

Restart (`lib/run/loop.server.test.ts`):

- [x] Restart from planning (`mode: 'planning'`) preserves `task.md` (including any `## Discovery` section), deletes plan.md, clears `working/`/`outputs/`
- [x] Restart from working (`mode: 'working'`) — no change from existing behavior

Agent config (`lib/agents/config.server.test.ts`):

- [x] `discoveryAgentOptions` returns Opus model (resolved via `config.models.discovery` + `MODEL_IDS`) with AskUserQuestion blocking via canUseTool
- [x] `discoveryAgentOptions` reads `maxBudgetUsd` from `config.limits.discoveryBudgetUsd`
- [x] `discoveryAgentOptions` does NOT configure `mcpServers` or `agents` (no custom MCP, no custom subagents)
- [x] `discoveryAgentOptions` configures a `PostToolUse` hook for `Write` / `Edit` that calls `notifyClient({ type: 'task_content_changed' })`
- [x] AskUserQuestion triggers the documented setup ordering: `pendingQuestions` write → `pending: 'clarification'` set → `question` event broadcast → block on `Promise.race`
- [x] Setup write failure (mock `updateRunInfoPendingQuestions` to throw) returns `{ behavior: 'deny' }` and emits a `run.error` log event (no silent failure)
- [x] AskUserQuestion triggers `pending: 'clarification'` set/clear cycle
- [x] AskUserQuestion triggers `question` event broadcast via notifyClient

Config defaults (`lib/config/defaults.test.ts`):

- [x] `models.discovery` resolves to a default `Required<ModelConfig>` (Opus + adaptive)
- [x] `limits.discoveryBudgetUsd` resolves to a default number

Compat shim (`lib/fs/read.server.test.ts`):

- [x] `parseRunInfo` synthesizes `phases: PhaseRecord[]` from old shape with `planningCostUsd` + `workingSessionIds` + `iterations`
- [x] `parseRunInfo` returns input unchanged when `phases` is already present (new shape pass-through)
- [x] Five fixtures: planning-only, planning + N working iterations, never-run, legacy `usage_limited` status normalization, new-shape pass-through

API routes:

- [x] POST `/api/run/start` with `mode: 'discovery'` returns `{ status: 'discovering' }`
- [x] POST `/api/run/answer` with valid body resolves the pending AskUserQuestion promise (200 `{ status: 'answered' }`)
- [x] POST `/api/run/answer` with malformed body returns 400
- [x] POST `/api/run/answer` when no session is blocked returns 404 `{ error: 'No pending question' }`

Client (`components/features/tasks/`):

- [x] Header stays "Reviewing the task..." while discovery is active, including when questions are pending (no header swap)
- [x] Question sub-row appears beneath the "Reviewing the task..." header when `pendingQuestions` is set on `.run.json` (regardless of whether the SSE `question` event fired — disk is authoritative)
- [x] Island renders full AskUserQuestion UI during discovery Q&A using the same component as learning chat
- [x] Submitting answers calls `POST /api/run/answer` and clears the question UI from the island
- [x] On reconnect, client reads `pendingQuestions` from task content and re-renders the question UI
- [x] "Reviewed Ns" completed-state row renders with duration from discovery `PhaseRecord` (compute time)
- [x] Clicking "Reviewed Ns" opens the discovery session in the chat-session viewer via discovery phase record's `sessionId`

Not unit-tested (covered by smoke):

- Discovery-to-planning auto-transition as end-to-end flow with a real SDK session — exercised by smoke Scenario 1.
- The actual prompt's ask-vs-proceed judgment under real model behavior — exercised by smoke Scenarios 1 and 2.

## Edge Cases

- **Task has rich description and inputs**: Q says "ready," may not write anything to task.md, and transitions immediately. No "Discovery complete" commit if task.md is unchanged (clean tree = no commit).
- **Task has only a title**: Q almost certainly asks questions. This is the primary use case — quick-added tasks that need fleshing out.
- **User navigates away during discovery Q&A**: The `canUseTool` callback is blocking server-side. The run stream disconnects but the session stays alive. On return, the client reads `pendingQuestions` from `.run.json` (via the task content API) and re-renders the question UI. If the user never returns, the session eventually times out via budget limit.
- **User closes the app after answering last question**: Server-driven transition means planning starts regardless. User returns to find planning done or `plan_ready`.
- **Discovery fails or errors**: Same pattern as planning errors. Write `status: 'stopped'`, `stoppedDuring: 'discovery'`. UI shows the standard stopped affordances (Continue / Restart from plan).
- **Discovery times out (budget)**: Write `status: 'stopped'`, `stopReason: 'budget'`, `stoppedDuring: 'discovery'`. Continue resumes discovery.
- **Server restart during discovery Q&A**: Session is lost. `clearStaleRun` writes `status: 'stopped'`, `stoppedDuring: 'discovery'` and clears `pendingQuestions`. User clicks Continue (resumes from `mode: 'discovery'`) or Restart from plan.
- **Stream has no playbook or specs**: Discovery is especially useful here — Q recognizes it has little context and asks questions the playbook would normally answer. But if the task description is detailed enough, Q should still proceed.
- **User stops mid-conversation**: Session is aborted. Answers from prior rounds are lost (session context is gone). `task.md` may have been updated already by an earlier successful `## Discovery` write — that content is preserved. The user can Continue (resumes discovery; Q may re-ask or update what's there) or Restart from plan (uses task.md as-is).
- **Discovery writes nothing to `task.md`**: Possible when Q has enough context. `commitGitState` is a no-op on clean tree. No "Discovery complete" commit exists; the PhaseRecord on `.run.json` still records that discovery ran.
- **Multiple runs on the same task**: Each run reads whatever `task.md` is at the moment Q starts. If a prior `## Discovery` section is present, Q's prompt judgment decides whether to update it, replace it, or leave it. The user can also delete it manually between runs.

## Design Decisions

The architectural calls that aren't obvious from the body. Decisions that purely follow from the body sections (e.g., "questions render in the island," "header stays stable") aren't repeated here — see the relevant section for the reasoning.

**Discovery runs in the run loop, not as a chat session.** Discovery could use the chat infrastructure (`POST /api/chat`), which already handles AskUserQuestion rendering and answer submission. But splitting the lifecycle means the client orchestrates the transition from discovery chat to planning run (fragile), billing spans two systems (chat session cost + run cost), and `.run.json` status management is divided between chat and run code. Keeping discovery in the run loop means the server owns the full lifecycle — `discovering` → `planning` → `plan_ready` → `working` → `completed`. One billing record. One state machine. The new plumbing (question event in run stream + answer endpoint) is small and contained.

**`task.md` is the user's; no destructive restore.** When a run is restarted, `task.md` is left untouched. The user controls its content between runs — they can keep, edit, or delete a prior `## Discovery` section as they wish. There is no `restoreTaskMdFromGit` helper, no commit-message-grep restore path, and no "Restart from discovery" button. Earlier drafts of this spec proposed those; they were dropped because (a) discovery is a heads-up preamble, not a savepoint to "restore to," and (b) handing the user a button that silently rewrites `task.md` makes the destructive case (overwriting their edits) too easy to hit. If a future "wipe plan/working but keep task.md" affordance is needed, it's a thin extension of the existing planning-mode cleanup — not a new restore mechanism.

**Opus, matching the other modes.** Discovery joins learning, planning, and working at Opus for consistency at v0. Sonnet would be cheaper and likely sufficient for read-and-assess work, but mixing models across modes complicates evaluation and prompt tuning early on. Once discovery is shipped and we have a feel for ask-rates and per-Start cost, we can downshift to Sonnet behind `config.models.discovery` without touching the rest of the system.

**Server-driven transitions.** The run loop handles discovery → planning sequentially, same as how it handles planning → `plan_ready`. No client orchestration needed. The user can close the tab after answering Q's last question and come back to find planning done. If Q had no questions, the transition is instant — the user sees "Reviewing the task..." briefly then "Planning..." with no gap.

**No `discovered` status.** It would exist for ~0ms between discovery completing and planning starting. Nothing would render it. The task panel's "Reviewed 2m 10s" comes from the discovery `PhaseRecord` in the `phases` array, not the status field.
