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

## Type refactor (ships in this same change)

Discovery's `PhaseRecord` write is the forcing function for the `phases: PhaseRecord[]` structure on `RunInfo` described in [Working](working.md). The two ship together as one PR. Splitting them would mean the refactor lands without a forcing function (and rots) or discovery adds yet another flat field set (`discoveryCostUsd`, `discoverySessionId`, ...) to the structure the refactor is trying to replace. See [Working](working.md) for the new shape and the read-time compat shim that handles existing `.run.json` files.

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

## Interactive Q&A Plumbing

Discovery runs inside the run loop (like planning and working) but adds one new capability: the run stream can emit question events, and the client can submit answers back. This keeps the server in control of transitions and billing while enabling interactivity.

### How Questions Reach the Client

The run stream already broadcasts activity events via `notifyClient` in the run loop. Discovery adds a new event type:

```typescript
// New event type in ChatStreamEvent
| { type: 'question'; sessionId: string; questions: AskUserQuestionInput['questions'] }
```

When the discovery agent calls AskUserQuestion, the `canUseTool` callback:

1. Broadcasts `{ type: 'question', sessionId, questions }` through the existing `notifyClient` callback
2. Sets `pending: clarification` on `task.md`
3. Calls `waitForAnswer(sessionId)` to block until the user answers

The client receives the question event via `GET /api/run/stream` (same SSE connection it's already using for activity steps) and renders the question UI. This uses the same `notifyClient` callback pattern that PostToolUse hooks already use to emit activity step events — it does not go through `filterMessage` (which converts SDK messages into events, a separate path).

### Client Reconnect

If the client disconnects and reconnects while discovery is waiting for answers, it needs to recover the pending questions. The `pendingQuestions` field on `RunInfo` stores the current AskUserQuestion input when discovery is blocking. The task content API (`GET /api/fs/task`) returns this as part of `.run.json`, so on reconnect the client sees `status: 'discovering'` + `pendingQuestions` and re-renders the question UI. This also serves the multi-channel case — a Slack adapter reads `pendingQuestions` from `.run.json` to know what to relay.

The `canUseTool` callback writes `pendingQuestions` to `.run.json` before blocking and clears it after the user answers (same write that sets/clears `pending: clarification`).

### Event vs. disk precedence (rule)

The disk is authoritative; the SSE `question` event is a fast path. Concretely:

- The client's render rule is **"if `pendingQuestions` is set on `.run.json`, show the question UI"** — regardless of whether the SSE event fired.
- The SSE `question` event is fire-and-forget (the run stream uses `writer.write(...).catch(() => {})` — see [Working](working.md) on stream writes). A client mid-reconnect can miss it; the disk write closes that race.
- Multi-channel adapters (future Slack, email) read `pendingQuestions` from `.run.json` directly. They never depend on the SSE event existing.

This means: if discovery has questions but the SSE event was dropped, the client still renders correctly on next read of the task content API. The event is an optimization for in-app liveness, not a correctness mechanism.

### How Answers Get Back

New endpoint: `POST /api/run/answer` — thin wrapper that calls `submitAnswer(sessionId, answers)` on the pending-questions store. The client doesn't need to know the sessionId — the server knows which discovery session is active (module-level state, same as `getActiveRunInfo()`).

```typescript
// POST /api/run/answer
// Body: { answers: Record<string, string> }
// Resolves the pending AskUserQuestion promise, SDK continues
```

When the promise resolves, `canUseTool` clears `pending: clarification` on `task.md` and returns the answers to the SDK. Q continues within the same `query()` call — more activity events stream through the existing connection.

### Why Not a Chat Session

Discovery could use the chat infrastructure (`POST /api/chat`) which already handles AskUserQuestion. But this would mean:

- The client has to orchestrate the transition from discovery chat → planning run (fragile — what if user navigates away?)
- Billing spans two separate systems (chat session cost + run cost)
- `.run.json` status management is split between chat and run code

Keeping discovery in the run loop means the server owns the full lifecycle: `discovering` → planning → `plan_ready` → working → `completed`. One billing record. One state machine. The new plumbing (question event + answer endpoint) is small and contained.

## Agent Configuration

Discovery is a new agent mode alongside learning, planning, and working. The `discoveryAgentOptions()` factory in `config.server.ts` defines it.

### Model and Budget

- **Model:** Sonnet with adaptive thinking. Discovery is read-and-assess, not synthesize-and-create. Configurable via `config.models.discovery` like other modes.
- **Budget:** New `config.limits.discoveryBudgetUsd` (default low — discovery should be cheap and fast).

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

No subagents. No `EnterPlanMode` / `ExitPlanMode`. `persistSession: true` (enables session resume on budget stop, same as planning/working).

### canUseTool Callback

```typescript
canUseTool: async (toolName, input, { signal }) => {
  if (toolName === 'AskUserQuestion') {
    // Broadcast question to client via run stream
    notifyClient({ type: 'question', sessionId, questions: input.questions })
    // Set pending + store questions in .run.json for reconnect/multi-channel
    await updateTaskMdPending(taskPath(taskName), 'clarification')
    await updateRunInfoPendingQuestions(taskName, input.questions)
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
      // Clear pending + questions whether answered or aborted
      await updateTaskMdPending(taskPath(taskName), undefined).catch(() => {})
      await updateRunInfoPendingQuestions(taskName, undefined).catch(() => {})
    }
  }
  return {
    result: 'deny',
    message: `Tool ${toolName} not available in discovery mode`,
  }
}
```

Same structure as the learning agent's `canUseTool`, with additions: (1) broadcasts the question event through the run stream, (2) sets `pending: clarification` + writes `pendingQuestions` to `.run.json` before blocking, (3) clears both after.

### System Prompt

New file: `prompts/discovery.md`. The prompt tells Q:

- Your job is the gut check before planning: does this task have what's needed to plan well?
- **Read first, ask second.** Read the task description, inputs, playbook, specs, and samples _before_ deciding whether to ask anything. Questions are about what those materials don't cover.
- If everything's there, write a brief `## Discovery` synthesis to `task.md` (or nothing if there's nothing useful to add) and exit.
- If something's genuinely missing that would change the plan, use `AskUserQuestion` with structured multiple-choice options.
- Bias toward proceeding. Don't ask just because you can.
- 1–3 focused questions max per round.
- Web research (`WebFetch`, `WebSearch`) is for filling specific gaps when needed — not a default exploration mode.

The reading list is built the same way as planning: `buildReadingList()` from `prompts.server.ts` injects specs, samples, inputs, and playbook paths.

Worked calibration examples ship in the prompt itself (see [Calibration: when to ask vs. proceed](#calibration-when-to-ask-vs-proceed) above). Without them, the prompt iterates by vibe.

## Run State

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

### Phase Records

Discovery uses the `phases` array on `RunInfo` (see [Working](working.md) for the full `PhaseRecord` and `RunInfo` type definitions). When discovery completes, a `PhaseRecord` with `phase: 'discovery'` is appended — recording `costUsd`, `durationMs`, and `sessionId`. The panel reads `phases.find(p => p.phase === 'discovery')` for duration, cost, and session transcript link.

When discovery is blocking on AskUserQuestion, the `pendingQuestions` field on `RunInfo` stores the current question input. Cleared when the user answers. This enables client reconnect and multi-channel adapters to read the pending questions from the task content API.

### Lifecycle

```
startRun(stream, task, 'discovery')
  │
  ├── writes .run.json { status: 'discovering' }
  │
  ├── runs discovery agent (single session via query())
  │     │
  │     ├── Q reads task, inputs, playbook, specs
  │     ├── Q evaluates sufficiency
  │     │
  │     ├── has questions → AskUserQuestion
  │     │     ├── canUseTool broadcasts question event to run stream
  │     │     ├── canUseTool sets pending: clarification
  │     │     ├── user answers via POST /api/run/answer → canUseTool clears pending → Q continues
  │     │     └── user stops run → abort signal → session ends
  │     │
  │     ├── Q synthesizes → appends ## Discovery to task.md
  │     └── session ends
  │
  ├── commits: [stream/task] Discovery complete
  │
  └── transitions to planning (server-driven, no client round-trip)
      ├── appends PhaseRecord { phase: 'discovery' } to phases array
      ├── writes .run.json { status: 'planning' }
      └── runs planning agent (same as today)
```

The auto-transition from discovery to planning happens inside the server process. There is no conditional — planning always follows discovery. The only branching is if discovery errors or is stopped, in which case planning doesn't run. The user can close the tab after answering Q's last question and come back to find planning done (or `plan_ready`).

### Loop Implementation

In `loop.server.ts`, the `runLoop` function dispatches based on mode:

```typescript
if (mode === 'discovery') {
  // Run discovery, then planning sequentially
  const discoveryStatus = await runDiscoveryIteration(...)
  if (discoveryStatus === 'stopped') {
    finalStatus = 'stopped'
  } else {
    // Discovery succeeded — commit and continue to planning
    commitGitState(`[${streamName}/${taskName}] Discovery complete`)
    finalStatus = await runPlanningIteration(...)
  }
} else if (mode === 'planning') {
  finalStatus = await runPlanningIteration(...)
} else {
  finalStatus = await runWorkingLoop(...)
}
```

`runDiscoveryIteration` follows the same structure as `runPlanningIteration`: create a session, run `query()`, handle abort/budget/error, return status. The key difference: discovery uses `canUseTool` with AskUserQuestion blocking and question broadcasting, while planning uses `createAutomatedCanUseTool()` (fully automated).

**Type changes required:** The `mode` parameter in `startRun()` signature, the `POST /api/run/start` route body validation, and `use-run-actions.ts` on the client all need `'discovery'` added to the mode union. See [Working](working.md) for the updated API contract.

### Billing

Discovery cost is tracked within the same billing task run record that spans the full run lifecycle. The `runLoop` function starts a billing record at the top (`startTaskRun`) and finalizes at the bottom (`finalizeTaskRun`). When `mode: 'discovery'`, the loop runs discovery then planning sequentially — the billing record naturally spans both.

After discovery completes, a `PhaseRecord` with `phase: 'discovery'` is appended to the `phases` array on `.run.json`, recording cost and duration. The `costUsd` field on RunInfo tracks the cumulative total (discovery + planning + working). `updateUsage` calls happen after each phase.

## Git Commits and Restart

### Discovery Commits

When discovery completes successfully (with or without questions), the loop commits: `[stream/task] Discovery complete`. This commit captures the `## Discovery` section added to `task.md`. The commit happens before planning begins.

### Restart From Any Phase

The user controls where they restart from. The three restart points are:

| Restart from | `mode` sent   | What happens                                                                                                           |
| ------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Discovery    | `'discovery'` | `task.md` restored to pre-discovery state via git, `plan.md` deleted, `working/` and `outputs/` cleared. Full restart. |
| Planning     | `'planning'`  | `plan.md` deleted, `working/` and `outputs/` cleared. `## Discovery` section in `task.md` preserved.                   |
| Working      | `'working'`   | `working/` and `outputs/` cleared, `plan.md` restored from "Plan accepted" commit. Everything else preserved.          |

### Restoring task.md via Git

Same pattern as `restorePlanFromGit`. A new `restoreTaskMdFromGit` helper:

```typescript
function restoreTaskMdFromGit(taskName: string): void {
  const taskRelPath = `tasks/${taskName}/task.md`
  // Find the "Discovery complete" commit and restore task.md from its parent
  const hash = execSync(
    `git log --format='%H' --grep='Discovery complete' -1 -- ${taskRelPath}`,
    { cwd: HAPPYHQ_ROOT, encoding: 'utf8', stdio: 'pipe' },
  ).trim()
  if (!hash) return
  execSync(`git restore --source=${hash}~1 -- ${taskRelPath}`, {
    cwd: HAPPYHQ_ROOT,
    stdio: 'pipe',
  })
}
```

This restores `task.md` to the version _before_ discovery enriched it — the user's original text. Uses `{hash}~1` (parent of the discovery commit) as the restore source.

### startRun Cleanup Updates

The `startRun` function's fresh-run cleanup block gains a discovery case:

```typescript
if (mode === 'discovery') {
  // Full restart — restore task.md to pre-discovery state
  restoreTaskMdFromGit(taskName)
  clearDirectory(path.join(taskDir, 'working'))
  clearDirectory(path.join(taskDir, 'outputs'))
  fs.rm(path.join(taskDir, 'plan.md'), { force: true })
  commitGitState(`[${streamName}/${taskName}] Task restarted from scratch`)
}
```

The existing `mode === 'planning'` cleanup handles deleting `plan.md` and clearing directories. The existing `mode === 'working'` cleanup handles `restorePlanFromGit`. Discovery adds the `restoreTaskMdFromGit` call.

**Single commit for cleanup.** All restart-from-discovery operations — `restoreTaskMdFromGit`, deleting `plan.md`, clearing `working/` and `outputs/` — must land in the _same_ `commitGitState('Task restarted from scratch')` commit. If they land as multiple commits, the next discovery's `git log --grep='Discovery complete' -1 -- task.md` lookup can hit a stale or unrelated commit (the restart sequence interleaves with prior history). Mirror the ordering in the existing `mode === 'working'` block, which already follows this pattern for `restorePlanFromGit`.

**First run:** `restoreTaskMdFromGit` is a graceful no-op when there's no "Discovery complete" commit (same as `restorePlanFromGit` on first planning run). No special-casing needed.

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

### Completed-state row: clicking opens the session

```
 Reviewed                                       2m 10s
```

Clicking the row opens the discovery session in the chat-session viewer — the same component used for clicking "Planned" or for opening any learning chat. The transcript shows what Q read, what it considered, and the inline question/answer rounds (`AskUserQuestion` calls render in the transcript exactly as they would in any chat session — there is no second display path).

The duration shown is **compute time**, recorded as `durationMs` on the discovery `PhaseRecord`. It does _not_ include time spent waiting for the user to answer questions. A discovery run that took 90 seconds of compute but waited 20 minutes for an answer reads as "Reviewed 1m 30s," not "Reviewed 21m 30s." The row is honest about what Q actually did.

> **Implementation note (transcript display).** Discovery sessions are SDK sessions associated with a run, accessed via `phase.sessionId`. They do not live in `.chats/{sessionId}/` like learning chats. The transcript-display component reads from the SDK journal regardless of which session-creation path produced it — to the user, the experience is identical. Don't fork into a second display component.

### Restart Options

When a task is stopped or finished, the user can restart from any completed phase:

- **Start over** — restarts from discovery (full restart, restores task.md)
- **Restart from plan** — restarts from planning (preserves discovery)
- **Restart from work** — restarts from working (preserves discovery + plan)

These map to `POST /api/run/start` with `mode: 'discovery'`, `'planning'`, or `'working'`.

### Clarification Indicator (task list)

Separate from the in-card sub-row above, the task list item — anywhere a task title appears in a list (sidebar, home, search results) — shows a clarification badge when Q is waiting for answers:

```
  Draft Q4 Proposal              · Needs clarification
```

This uses the existing `pending: 'clarification'` indicator pattern — same visual treatment as other pending states. Together with the in-card question sub-row, this gives the user two ways to find a discovery session that needs them: the badge wherever they encounter the task in a list, and the sub-row when they're already viewing the task.

## Skip Mechanisms

### Per-Stream Auto-Skip (deferred to v1 — design held for later)

This subsection documents the design held for v1; it is **not in v0 scope** (see [v0 vs. v1 scope](#v0-vs-v1-scope)). v0 runs discovery on every Start.

Playbook frontmatter gains an optional `skipDiscovery` field:

```yaml
---
title: SOW Generation
skipDiscovery: true
---
```

When `skipDiscovery: true`, the Start button sends `mode: 'planning'` instead of `mode: 'discovery'` — discovery is bypassed entirely. No "Reviewed" row appears in the panel. The server also enforces this: if `mode: 'discovery'` arrives but the playbook says `skipDiscovery: true`, the server redirects to `mode: 'planning'`.

This lives in the playbook because it's the right granularity — "I trust Q to plan SOWs without asking, but for research tasks it should always check." It's human-editable and is already read by the system during prompt construction. Adding it requires extending `PlaybookFrontmatter` (currently a closed schema) at v1 implementation time.

### Stopping During Discovery

There is no dedicated "skip discovery" button during the live Q&A. The Stop button (already present during every run phase) serves this purpose. When the user stops during discovery:

- The session is aborted, `status: 'stopped'`, `stoppedDuring: 'discovery'` is written
- The island clears (questions dismissed)
- The task panel shows restart options including "Restart from plan" which skips discovery and goes straight to planning with the current task.md

This keeps the UI simple (one Stop button, not Stop + Skip) and gives the user clear choices after stopping.

## Multi-Channel Awareness

This spec covers the in-app experience only. The design is channel-agnostic by construction:

- **Q writes task.md, not the channel.** A Slack adapter's job is I/O: relay the user's message to create the task, relay Q's questions to a Slack thread, relay the user's answers back to Q. Q does all the thinking and writing. The adapter never needs to understand markdown or frontmatter.
- **AskUserQuestion is the abstraction.** In-app, it renders in the island. In Slack, an adapter translates it to message actions. In email, it becomes a reply template. The agent code is identical — it calls AskUserQuestion regardless of channel.
- **`pending: clarification` is the notification trigger.** When the multi-channel layer exists, it watches for `pending` changes on tasks and notifies the appropriate channel (tracked in a future `notify` field on `task.md` — see [Task List](task-list.md) multi-channel section).
- **task.md is the single truth.** After discovery, the task description is complete regardless of which channel the user answered from. Anyone reading the task sees the full picture.

A separate spec will cover the channel routing layer, adapters, and the `source`/`notify` fields. The key architectural insight: channels are dumb pipes, Q is the only writer, and task.md is the canonical object.

### Future: Stream Selection During Discovery

Today, Start requires a stream assignment. A natural extension: tasks created with just a title could enter discovery without a stream, and Q could suggest which stream to assign based on the task description — "This looks like an Acme Client task — should I assign it there?" This would make quick-add even faster (title → Start → Q figures out the rest). Not v1 scope, but the architecture supports it.

## Design Decisions

**Discovery runs in the run loop, not as a chat session.** Discovery could use the chat infrastructure (`POST /api/chat`), which already handles AskUserQuestion rendering and answer submission. But this splits the lifecycle: the client would have to orchestrate the transition from discovery chat to planning run, billing would span two systems, and `.run.json` management would be divided between chat and run code. Keeping discovery in the run loop means the server owns the full lifecycle — `discovering` → `planning` → `plan_ready` → working → `completed`. One billing record. One state machine. The new plumbing (question event in run stream + answer endpoint) is small and contained.

**Questions render in the island, not inline in the task card.** The island is the established surface for structured interactions during task work (plan approval uses it today). The task card shows a hint (`QuestionRow`) that points to the island. This avoids bloating the task card with interactive UI and keeps the question experience focused — same large, clear question blocks the user knows from learning mode.

**Discovery enriches task.md, not a separate directory.** The task is the canonical object. After discovery, the task description should be self-contained. A separate `discovery/` directory would add surface area for limited benefit — the session log (via `discoverySessionId`) is the audit trail, and `task.md` is what planning reads. Git-based restore handles restart cleanly.

**Git-based restore, not string-stripping.** On restart from discovery, `task.md` is restored from git (parent of the "Discovery complete" commit) rather than parsing and stripping the `## Discovery` section. This follows the `restorePlanFromGit` pattern already used for `plan.md` during working restarts. Reliable, no markdown parsing, and handles any content Q might have written.

**No `discovered` status.** It would exist for ~0ms between discovery completing and planning starting. Nothing would render it. The task panel's "Reviewed 2m 10s" comes from the discovery `PhaseRecord` in the `phases` array, not the status field.

**Sonnet, not Opus.** Discovery is read-and-assess, not synthesize-and-create. Sonnet is fast, cheap, and sufficient. The cost delta matters because discovery runs on every task start. Configurable if needed.

**Bias toward proceeding.** The prompt should lean toward moving forward, asking only when the gap would materially change the plan. Specs define what's needed — if something is missing that specs call for, ask. But don't over-interrogate. Over time, specs can say "if X is missing, assume Y" to further reduce unnecessary questions.

**Stop replaces skip.** No dedicated "skip discovery" button during the session. The Stop button already exists and does the right thing — abort the session, then the user chooses where to restart (including "Restart from plan" which skips discovery). This avoids a second button alongside Stop that does nearly the same thing.

**Server-driven transitions.** The run loop handles discovery → planning sequentially, same as how it handles planning → `plan_ready`. No client orchestration needed. The user can close the tab after answering Q's last question and come back to find planning done. If Q had no questions, the transition is instant — the user sees "Reviewing the task..." briefly then "Planning..." with no gap.

**Header stays stable across question state.** When questions surface, the header text doesn't change to something like "Q has questions for you" — the header is the _phase_ indicator, not the _state_ indicator. State (questions pending, files attached, plan ready) lives in sub-rows beneath the header. Swapping the header text would be jarring and would conflict with the sub-row pattern other phases already use. One header per phase, sub-rows for what's happening inside it.

## v0 vs. v1 scope

Everything documented in this spec is in v0 _unless_ listed below. The deferred items are not abandoned — they're held for v1 once we see how v0 lands in the wild.

**Deferred from v0 (revisit after v0 ships):**

- **`skipDiscovery` playbook frontmatter flag.** v0 runs discovery on every Start. Bias-to-proceed in the prompt should be enough — if a stream's playbook is rich and a task is well-formed, discovery transitions to planning in seconds without writing anything. Add the flag once we observe ask-rates that warrant a stream-level opt-out. Requires extending `PlaybookFrontmatter` (currently a closed schema) when added.
- **Stream selection during discovery.** Tasks created with just a title would let Q suggest which stream to assign. Out of v0 scope; the architecture supports it.
- **Channel adapters (Slack, email).** This spec keeps the architecture channel-ready (`pendingQuestions` on `.run.json`, `pending: 'clarification'` as a notification trigger, `AskUserQuestion` as the abstraction), but no adapter ships in v0. See [Multi-Channel Awareness](#multi-channel-awareness) for the readiness story.
- **Concurrency-safe answer routing.** `POST /api/run/answer` resolves against module-level singleton state (same pattern as `getActiveRunInfo()`). When concurrency lands and the singleton becomes a `Map<>` (see [Working](working.md)), the answer endpoint will need a task identifier in the body. Decoupled from this PR.

**Bundled into v0 (despite the spec originally splitting them):**

- **`phases: PhaseRecord[]` migration on `RunInfo`.** Originally listed as a prerequisite; ships together with discovery. See [Type refactor](#type-refactor-ships-in-this-same-change) above and the new shape in [Working](working.md).

## Acceptance Criteria

- [ ] Start button triggers discovery (not planning directly) when `skipDiscovery` is not set
- [ ] Discovery agent reads task inputs, stream playbook, specs, and samples
- [ ] When Q has enough context, discovery auto-transitions to planning without user action
- [ ] When Q has questions, `canUseTool` broadcasts a `question` event through the run stream
- [ ] `canUseTool` sets `pending: clarification` before blocking and clears it after
- [ ] Header in the task card stays "Reviewing the task..." while discovery is active — does NOT swap text when questions surface
- [ ] When questions are pending, a question sub-row appears beneath the "Reviewing the task..." header in the task card
- [ ] Questions render in the island as full AskUserQuestion blocks (same component as learning chat), with the task-card sub-row pointing to the island
- [ ] `POST /api/run/answer` accepts answers and resolves the pending AskUserQuestion promise
- [ ] Q can ask follow-up questions within the same session (multiple rounds)
- [ ] Q synthesizes what it learned and appends a `## Discovery` section to task.md
- [ ] Loop commits `[stream/task] Discovery complete` after successful discovery, before planning
- [ ] Task panel shows "Reviewed Ns" completed-state row with duration from discovery `PhaseRecord` (compute time, not wall-clock)
- [ ] Clicking "Reviewed Ns" opens the discovery session in the chat-session viewer via phase record's `sessionId` (same display component as Planned and learning chats)
- [ ] Planning reads the enriched task.md (no changes to planning's reading list needed)
- [ ] Discovery appends a `PhaseRecord` with `phase: 'discovery'` to the `phases` array in `.run.json`
- [ ] `pendingQuestions` written to `.run.json` while blocking, cleared after answer
- [ ] Billing record spans discovery + planning (single `startTaskRun` / `finalizeTaskRun` lifecycle)
- [ ] Restart from discovery restores task.md to pre-discovery state via `restoreTaskMdFromGit`
- [ ] Restart from planning preserves `## Discovery` section, only deletes plan.md
- [ ] Discovery errors write `status: 'stopped'` with `stoppedDuring: 'discovery'`
- [ ] Budget stop during discovery writes `stopReason: 'budget'` with Continue option
- [ ] `clearStaleRun` handles `'discovering'` status
- [ ] `canStart` gate relaxed: title + stream is sufficient when discovery is enabled (no description/inputs required)

## Edge Cases

- **Task has rich description and inputs**: Q says "ready," may not write anything to task.md, and transitions immediately. No "Discovery complete" commit if task.md is unchanged (clean tree = no commit).
- **Task has only a title**: Q almost certainly asks questions. This is the primary use case — quick-added tasks that need fleshing out.
- **User navigates away during discovery Q&A**: The `canUseTool` callback is blocking server-side. The run stream disconnects but the session stays alive. On return, the client reads `pendingQuestions` from `.run.json` (via the task content API) and re-renders the question UI. If the user never returns, the session eventually times out via budget limit.
- **User closes the app after answering last question**: Server-driven transition means planning starts regardless. User returns to find planning done or `plan_ready`.
- **Discovery fails or errors**: Same pattern as planning errors. Write `status: 'stopped'`, `stoppedDuring: 'discovery'`. UI shows restart options. User can restart from discovery or skip to planning.
- **Discovery times out (budget)**: Write `status: 'stopped'`, `stopReason: 'budget'`, `stoppedDuring: 'discovery'`. Continue button resumes discovery.
- **Server restart during discovery Q&A**: Session is lost. `clearStaleRun` writes `status: 'stopped'`, `stoppedDuring: 'discovery'`. User restarts. The `## Discovery` section is only written when Q completes successfully, so a partial run leaves task.md unchanged.
- **Stream has no playbook or specs**: Discovery is especially useful here — Q recognizes it has little context and asks questions the playbook would normally answer. But if the task description is detailed enough, Q should still proceed.
- **User stops mid-conversation**: Session is aborted. Answers from prior rounds are lost (session context is gone). task.md is unchanged (Q hadn't written yet). User can restart from discovery (try again) or from planning (skip).
- **Restart with no discovery commit**: `restoreTaskMdFromGit` is a graceful no-op when there's no "Discovery complete" commit in history. No special-casing needed.
- **Discovery writes nothing to task.md**: Possible when Q has enough context. `commitGitState` is a no-op on clean tree. No "Discovery complete" commit exists, so future `restoreTaskMdFromGit` is a no-op. Clean.
- **Multiple runs on the same task**: Each restart from discovery restores task.md to before the _latest_ "Discovery complete" commit. Since restart clears previous state before re-running, this always finds the right commit.

## Testing

Run loop — discovery mode (`lib/run/loop.server.test.ts`):

- [ ] `startRun` with `mode: 'discovery'` writes `.run.json` with `status: 'discovering'`
- [ ] Discovery that completes without questions auto-transitions to planning (status becomes `'planning'`)
- [ ] Discovery that uses AskUserQuestion sets `pending: clarification` on task.md via canUseTool
- [ ] canUseTool clears `pending` after user answers
- [ ] canUseTool broadcasts `question` event through `notifyClient` before blocking
- [ ] canUseTool writes `pendingQuestions` to `.run.json` before blocking, clears after answer
- [ ] Discovery completion appends `## Discovery` section to task.md
- [ ] Loop commits `[stream/task] Discovery complete` before starting planning
- [ ] Discovery appends `PhaseRecord` with `phase: 'discovery'` to `phases` in `.run.json`
- [ ] Discovery failure writes `status: 'stopped'` with `stoppedDuring: 'discovery'`
- [ ] User stop during discovery aborts the query and writes `stoppedDuring: 'discovery'`
- [ ] `clearStaleRun` handles `'discovering'` status
- [ ] Budget stop during discovery writes `stopReason: 'budget'`
- [ ] Billing: single `startTaskRun` / `finalizeTaskRun` spans discovery + planning

Restart (`lib/run/loop.server.test.ts`):

- [ ] Restart from discovery (`mode: 'discovery'`) calls `restoreTaskMdFromGit`, deletes plan.md, clears working/ and outputs/
- [ ] Restart from planning (`mode: 'planning'`) preserves task.md (including `## Discovery`), deletes plan.md
- [ ] `restoreTaskMdFromGit` is no-op when no "Discovery complete" commit exists

Agent config (`lib/agents/config.server.test.ts`):

- [ ] `discoveryAgentOptions` returns Sonnet model with AskUserQuestion blocking via canUseTool
- [ ] AskUserQuestion triggers `pending: clarification` set/clear cycle
- [ ] AskUserQuestion triggers `question` event broadcast via notifyClient

API routes:

- [ ] POST `/api/run/start` with `mode: 'discovery'` returns `{ status: 'discovering' }`
- [ ] POST `/api/run/answer` resolves the pending AskUserQuestion promise

Client (`components/features/tasks/`):

- [ ] Header stays "Reviewing the task..." while discovery is active, including when questions are pending (no header swap)
- [ ] Question sub-row appears beneath the "Reviewing the task..." header when `pendingQuestions` is set on `.run.json` (regardless of whether the SSE `question` event fired — disk is authoritative)
- [ ] Island renders full AskUserQuestion UI during discovery Q&A using the same component as learning chat
- [ ] Submitting answers calls `POST /api/run/answer` and clears the question UI from the island
- [ ] On reconnect, client reads `pendingQuestions` from task content and re-renders the question UI
- [ ] "Reviewed Ns" completed-state row renders with duration from discovery `PhaseRecord` (compute time)
- [ ] Clicking "Reviewed Ns" opens the discovery session in the chat-session viewer via discovery phase record's `sessionId`

Not tested:

- Discovery-to-planning auto-transition as end-to-end flow (requires real SDK session)
