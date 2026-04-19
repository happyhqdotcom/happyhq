# Discovery

How Q assesses a task before planning.

## Purpose

When tasks were created from learning conversations, Q naturally gathered context and asked questions before calling CreateTask. Tasks created outside of chat (quick-add, task panel, command menu) skip that conversation and jump straight to planning. The result: planning runs that produce a plan saying "I'm missing X, Y, and Z" — wasting a run and frustrating the user.

Discovery formalizes the pre-planning assessment. Q reads the task, evaluates whether it has enough to plan well, asks structured questions if not, and enriches the task description with what it learns. It's the first phase of the run lifecycle — between Start and Planning.

## Related Specs

- Task lifecycle and pending states → [Task List](task-list.md)
- Plan generation and approval → [Planning](planning.md)
- Run lifecycle, `.run.json`, and `PhaseRecord` / `RunInfo` types → [Working](working.md)
- Agent modes and orchestration → [Agent Configuration](agent-config.md)

## Prerequisites

- **RunInfo refactor:** Discovery depends on the `phases: PhaseRecord[]` structure on `RunInfo` (see [Working](working.md)). This replaces the current ad-hoc `planningCostUsd`, `planningSessionId`, `workingSessionIds`, and positional `iterations` array. The refactor is a separate task that should land before discovery.

## Trigger

The user clicks Start on a task. Discovery runs immediately — it is the first phase of every run. Planning always follows discovery.

Current flow: Start → Planning → (approval) → Working → (review) → Done

New flow: Start → Discovery → Planning → (approval) → Working → (review) → Done

Discovery is not a separate user action. The user clicks one button. Internally, the system runs discovery first, then planning. If Q has no questions, the transition is seamless — the user sees "Discovering..." briefly, then "Planning..." begins. If Q has questions, the run pauses and the ball returns to the user.

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

- **Bias toward proceeding.** If Q can plan with what it has, even imperfectly, it should proceed. Don't ask questions just because you could. The worst failure mode isn't "Q planned with incomplete info" (the user catches this at plan review) — it's "Q asks annoying questions on every task."
- **Few, focused questions.** 1–3 questions max per round. High-leverage questions that would materially change the plan. Not a laundry list.
- **Structured answers.** Use AskUserQuestion with multiple-choice options. Easier for the user, more useful for planning, and translates cleanly to future channels (Slack buttons, email reply templates).
- **Fast.** Discovery should complete in seconds, not minutes.

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

- Your job is to assess whether this task has enough context for planning
- Read the task description, inputs, playbook, and specs
- If you have enough, write your synthesis to task.md under `## Discovery` and exit
- If you need clarification, use AskUserQuestion with structured options
- Bias toward proceeding — only ask when the gap would materially change the plan
- 1–3 questions max per round, structured multiple-choice

The reading list is built the same way as planning: `buildReadingList()` from `prompts.server.ts` injects specs, samples, inputs, and playbook paths.

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

**First run:** `restoreTaskMdFromGit` is a graceful no-op when there's no "Discovery complete" commit (same as `restorePlanFromGit` on first planning run). No special-casing needed.

## Task Panel UI

Discovery follows the same pattern as planning: activity header during the phase, duration label after. Questions render in the island (bottom of canvas), not in the task card.

### During Discovery — Q Working

```
 Discovering...                               [Stop]
```

ActivityHeader with the latest step label, same as Planning uses today. The run stream delivers activity step events exactly as it does during planning.

### During Discovery — Questions Waiting

**Island (canvas bottom):** Full AskUserQuestion UI appears in the island, replacing the composer — same structured question blocks the user already knows from learning mode. This is the primary interaction surface. The user selects answers and submits. Same visual treatment, same components, different rendering context (island during a run vs. island during a chat).

**Task card:** A `QuestionRow` shows a hint — e.g., "2 questions from Q" or the first question's header. Clicking it focuses the island. This mirrors how `PlanFileRow` shows the plan and clicking opens it. The full question experience lives in the island, not the task card.

When the user submits answers (`POST /api/run/answer`), the island clears and the activity header resumes ("Discovering...") as Q processes the answers. If Q asks follow-ups, the island shows new questions.

### After Discovery

```
 Discovered                                      18s
```

SectionHeader with duration (from `phases.find(p => p.phase === 'discovery')?.durationMs`). Clicking the label opens the discovery session transcript in a chat window (via the phase record's `sessionId`), same as clicking "Planned" opens the planning session.

### Restart Options

When a task is stopped or finished, the user can restart from any completed phase:

- **Start over** — restarts from discovery (full restart, restores task.md)
- **Restart from plan** — restarts from planning (preserves discovery)
- **Restart from work** — restarts from working (preserves discovery + plan)

These map to `POST /api/run/start` with `mode: 'discovery'`, `'planning'`, or `'working'`.

### Clarification Indicator

The task list item shows a clarification indicator when Q is waiting for answers:

```
  Draft Q4 Proposal              · Needs clarification
```

This uses the existing `pending: clarification` indicator pattern — same visual treatment as other pending states.

## Skip Mechanisms

### Per-Stream Auto-Skip

Playbook frontmatter gains an optional `skipDiscovery` field:

```yaml
---
title: SOW Generation
skipDiscovery: true
---
```

When `skipDiscovery: true`, the Start button sends `mode: 'planning'` instead of `mode: 'discovery'` — discovery is bypassed entirely. No "Discovered" row appears in the panel. The server also enforces this: if `mode: 'discovery'` arrives but the playbook says `skipDiscovery: true`, the server redirects to `mode: 'planning'`.

This lives in the playbook because it's the right granularity — "I trust Q to plan SOWs without asking, but for research tasks it should always check." It's human-editable, requires no new schema, and is already read by the system during prompt construction.

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

**No `discovered` status.** It would exist for ~0ms between discovery completing and planning starting. Nothing would render it. The task panel's "Discovered 18s" comes from the discovery `PhaseRecord` in the `phases` array, not the status field.

**Sonnet, not Opus.** Discovery is read-and-assess, not synthesize-and-create. Sonnet is fast, cheap, and sufficient. The cost delta matters because discovery runs on every task start. Configurable if needed.

**Bias toward proceeding.** The prompt should lean toward moving forward, asking only when the gap would materially change the plan. Specs define what's needed — if something is missing that specs call for, ask. But don't over-interrogate. Over time, specs can say "if X is missing, assume Y" to further reduce unnecessary questions.

**Stop replaces skip.** No dedicated "skip discovery" button during the session. The Stop button already exists and does the right thing — abort the session, then the user chooses where to restart (including "Restart from plan" which skips discovery). This avoids a second button alongside Stop that does nearly the same thing.

**Server-driven transitions.** The run loop handles discovery → planning sequentially, same as how it handles planning → `plan_ready`. No client orchestration needed. The user can close the tab after answering Q's last question and come back to find planning done. If Q had no questions, the transition is instant — the user sees "Discovering..." briefly then "Planning..." with no gap.

## Acceptance Criteria

- [ ] Start button triggers discovery (not planning directly) when `skipDiscovery` is not set
- [ ] Discovery agent reads task inputs, stream playbook, specs, and samples
- [ ] When Q has enough context, discovery auto-transitions to planning without user action
- [ ] When Q has questions, `canUseTool` broadcasts a `question` event through the run stream
- [ ] `canUseTool` sets `pending: clarification` before blocking and clears it after
- [ ] Questions render in the island (full AskUserQuestion UI) with a `QuestionRow` hint in the task card
- [ ] `POST /api/run/answer` accepts answers and resolves the pending AskUserQuestion promise
- [ ] Q can ask follow-up questions within the same session (multiple rounds)
- [ ] Q synthesizes what it learned and appends a `## Discovery` section to task.md
- [ ] Loop commits `[stream/task] Discovery complete` after successful discovery, before planning
- [ ] `skipDiscovery` in playbook frontmatter bypasses discovery entirely
- [ ] Task panel shows "Discovered" section header with duration from discovery `PhaseRecord`
- [ ] Clicking "Discovered" opens the discovery session transcript via phase record's `sessionId`
- [ ] Planning reads the enriched task.md (no changes to planning's reading list needed)
- [ ] Discovery appends a `PhaseRecord` with `phase: 'discovery'` to the `phases` array in `.run.json`
- [ ] `pendingQuestions` written to `.run.json` while blocking, cleared after answer
- [ ] Billing record spans discovery + planning (single `startTaskRun` / `finalizeTaskRun` lifecycle)
- [ ] Restart from discovery restores task.md to pre-discovery state via `restoreTaskMdFromGit`
- [ ] Restart from planning preserves `## Discovery` section, only deletes plan.md
- [ ] Discovery errors write `status: 'stopped'` with `stoppedDuring: 'discovery'`
- [ ] Budget stop during discovery writes `stopReason: 'budget'` with Continue option
- [ ] `clearStaleRun` handles `'discovering'` status
- [ ] `PlaybookFrontmatter` includes optional `skipDiscovery?: boolean`
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
- [ ] POST `/api/run/start` with `mode: 'discovery'` redirects to planning when `skipDiscovery: true`
- [ ] POST `/api/run/answer` resolves the pending AskUserQuestion promise

Client (`components/features/tasks/`):

- [ ] Task card renders `QuestionRow` when a `question` event is received from the run stream
- [ ] Island renders full AskUserQuestion UI during discovery Q&A
- [ ] Submitting answers calls `POST /api/run/answer` and clears the question UI
- [ ] On reconnect, client reads `pendingQuestions` from task content and re-renders question UI
- [ ] "Discovered" section header renders with duration from discovery `PhaseRecord`
- [ ] Clicking "Discovered" opens session transcript via discovery phase record's `sessionId`

Not tested:

- Discovery-to-planning auto-transition as end-to-end flow (requires real SDK session)
