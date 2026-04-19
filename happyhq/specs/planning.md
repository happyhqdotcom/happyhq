# Planning

How Q turns user inputs into a reviewable working plan.

## Purpose

Define how user inputs become a reviewable working plan. The working plan is a key checkpoint for managing the loop — the user sees what Q intends to do and can course-correct before tokens are spent.

## Preconditions

Q doesn't offer "Start Task" until it has created a playbook. This is prompt behavior, not an app-level gate — by the time the "Start Task" card appears in chat, Q has already written the playbook to disk during the teaching conversation. The sequence is natural: user describes work → Q asks questions → Q creates playbook → Q offers "Start Task." No code-level check needed.

## Task Kickoff

Task creation happens inside a chat conversation (see [Chat](chat.md)). The user is talking to Q — providing context, answering questions, dropping files. Q checks the playbook and spec to understand what the task needs, asks questions to make sure it has everything, then calls `CreateTask` once it's ready (see [Learning](learning.md)). CreateTask is the transition from collaborative learning to autonomous planning.

### What Happens

1. Q gathers task context through conversation — text, files, clarifying questions. Files dropped during chat are staged to `.chats/{sessionId}/uploads/` (see [Chat](chat.md)). Q classifies each file with user confirmation (see [Learning](learning.md)) — samples are processed via ProcessSample, task inputs stay in staging for CreateTask.
2. When ready, Q calls `CreateTask` with `{ name, textContext, files }`. The `files` array lists filenames from `uploads/` that are task inputs. `CreateTask` is auto-approved (in `allowedTools`) — the agent continues the conversation naturally without pausing. The client renders the tool call as an inline "Start Task" card. Multiple task proposals can appear in one conversation. **Future direction:** Replace `textContext` with a chat transcript reference — see note below.
3. User clicks "Start Task" on the inline card when ready.
4. The app creates the task directory structure at root (see [Filesystem Layout](filesystem-layout.md)):
   - `tasks/{task-slug}/inputs/` — User-provided files and context (`setupTaskFromChat()` moves files from `.chats/{sessionId}/uploads/` to `inputs/` and writes `textContext` to `inputs/context.md`)
   - `tasks/{task-slug}/task.md` — Frontmatter with title and `stream` field (if the chat has a stream association)
   - `tasks/{task-slug}/plan.md` — Will be generated
   - `tasks/{task-slug}/working/` — Empty, ready for execution
   - `tasks/{task-slug}/outputs/` — Empty, ready for results
5. Q names the task based on the inputs. The slug is kebab-cased with a time-sortable suffix (e.g., `bridgeway-sow-01h8k2w4`). User can adjust the title.
6. The user is navigated to the Desktop.

### CreateTask to Planning Transition

The "Start Task" click triggers a concrete sequence across three boundaries:

1. **Client**: User clicks "Start Task" card in chat
2. **Server actions** (`createTask()` + `setupTaskFromChat()` in `lib/actions.ts`): `createTask()` creates `tasks/{slug}/task.md` with frontmatter (title, stream from chat's `streamSlug`). `setupTaskFromChat()` creates subdirectories (`inputs/`, `working/`, `outputs/`), moves files listed in `CreateTask.files` from `.chats/{sessionId}/uploads/` to `inputs/` via `fs.rename`, and writes `inputs/context.md` with `textContext` as body (see future direction note below).
3. **API route** (`POST /api/run/start` with `{ stream, task, mode: 'planning' }`): Writes `.run.json` with `status: 'planning'`, starts Q in planning mode as a detached async function, returns `{ status: 'planning' }` immediately
4. **Client**: Opens the task (`/{stream}/task/{task}` via pushState — the desktop route, not the storage path)
5. **Q (planning mode)**: Reads inputs cold, writes `plan.md`, exits. Loop writes `status: 'plan_ready'` to `.run.json`. The Desktop detects `plan_ready` and shows the plan approval prompt. On failure, `.run.json` is updated to `status: 'stopped'` with `error` populated.

Steps 2–4 execute as a single user-perceived action. The learning conversation may still be active — `CreateTask` is non-blocking, so the agent continues naturally.

### Automatic Plan Generation

**Planning starts as part of the "Start Task" action.** There is no "Create Plan" button. When the user clicks "Start Task", the app creates the task directory, kicks off Q in planning mode, and opens the task — all in one flow. The Desktop finds planning already in progress (see [Desktop](desktop.md)).

Q's planning mode is a separate invocation, completely independent from the learning conversation. It reads the task directory cold: no connection to the prior conversation, no shared state. The filesystem is the handoff mechanism: inputs are on disk, Q reads them, writes `plan.md`, exits.

**Future direction — transcript-based handoff.** The current `textContext` → `context.md` approach has the learning agent summarize the conversation for its planning-mode self. This is lossy: for short conversations the synthesis adds nothing over the user's actual message, and for long conversations the agent may drop or distort what the user said. The target approach: drop `textContext` from `CreateTask`, have `setupTaskFromChat()` write a clean transcript of the chat session (from the SDK JSONL) to `inputs/` instead. The planning agent reads the real conversation — user messages, Q's responses, decisions made — plus the input files. No intermediary summary, no information loss. This also eliminates the "post-CreateTask context is lost" problem — the transcript captures the full conversation regardless of when CreateTask was called. Until this is implemented, the learning prompt enforces CreateTask-last discipline: Q gathers everything before calling CreateTask, and does not continue task-relevant conversation after calling it.

## Run State During Planning

When planning starts, `.run.json` is written to the task root:

```typescript
{
  status: 'planning',
  iteration: 0,
  startedAt: string,       // ISO timestamp
  lastIterationAt: string,  // ISO timestamp
  error: null
}
```

The Desktop reads `.run.json` via SWR (through the task content API) to determine what to render. When `status` is `'planning'`, the island shows a planning indicator. When the planning agent completes successfully, the loop writes `status: 'plan_ready'` to `.run.json`. The Desktop detects `plan_ready`, auto-opens `plan.md` as a window, and the plan approval prompt replaces the island (see [Island](island.md)). The `plan_ready` status prevents the approval prompt from appearing prematurely while the agent is still writing `plan.md`.

**Planning failure:** If Q fails during planning, `.run.json` is updated to `status: 'stopped'` with `error` populated. The island renders the error with a "Start new run" option. No automatic retry. The `RunInfo` interface is defined in [Working](working.md).

**Planning budget stop:** If billing limits are hit during planning (SDK budget exhausted via `maxBudgetUsd`), `.run.json` is written with `status: 'stopped'`, `stopReason: 'budget'`, and `stoppedDuring: 'planning'`. The UI shows "Planning paused" with a Continue button. Continue is disabled until the user has remaining minutes (upgrade or wait for a new billing period). Resuming continues the planning phase.

## Working Plan Generation

### Flow

1. User clicks "Start Task" in chat → task created → task opens on the Desktop
2. The island shows planning activity ("Planning the {task} task...")
3. Q starts planning (`POST /api/run/start` with `mode: 'planning'`)
4. Client streams SDK messages for liveness via `GET /api/run/stream` (activity steps in the island)
5. Q finishes — loop writes `status: 'plan_ready'` to `.run.json`
6. `plan.md` auto-opens as a desktop window; plan approval prompt replaces the island (see Plan Review below)

### What Q Does in Planning Mode

Plan generation is a single Q invocation in planning mode (see [Agent Configuration](agent-config.md)). Q is a full agent with tools — it reads files, processes inputs, and generates the plan. It's not a loop like working, but it's not a single LLM call either. Q reads:

- The task inputs (everything in `inputs/`)
- The stream's playbook
- The stream's specs
- The stream's samples (for reference)

And generates `plan.md`. Q doesn't converse with the user — it has everything it needs on disk.

### What Makes a Good Working Plan

The working plan should be transparent and show Q's thinking. The spec doesn't mandate a format — Q adapts to the task. An SOW might want sequential work items. A research task might want parallel tracks.

A good working plan:

- Shows the user what Q intends to do and why
- Surfaces assumptions Q is making and choices it's flagging
- Is readable by the user — the plan is for the human, not the execution loop

The plan is written to `plan.md` at the task root and rendered in the Desktop's main area.

### The Working Plan as a Checkpoint

The working plan is one of several ways the user manages Q. Teaching shapes Q's general behavior (see [Learning](learning.md)). The working plan shapes a specific task. Stopping and providing feedback during execution steers a run (see [Working](working.md)).

By reviewing the working plan, the user can:

- Catch misunderstandings early
- Adjust scope
- Confirm Q understood the inputs correctly

## Plan Review and Approval

### Approval via Island

Once the plan is generated and auto-opened as a window, Q surfaces the approval decision. The PlanApproval component replaces the island at the bottom of the canvas.

Five options:

- **Approve** — Closes the plan window, shows a spinner for ~1 second while the working phase starts, then dismisses the approval card. The brief delay provides visual feedback that the action was received.
- **Start Over** — Closes the plan window, stops the current run, and restarts planning from scratch. Same spinner + delay pattern as Approve.
- **Give Q Feedback** — Inline text input (Ctrl+Enter to send); starts a new learning chat in the island with the typed message. PlanApproval hides while the chat is active (gated on `islandMode === 'collapsed'`). Q reads the plan, processes the feedback, and can update playbooks or specs. When the user collapses the chat, PlanApproval reappears — the user clicks "Start Over" to regenerate the plan using the now-updated knowledge. This is indirect by design: feedback teaches Q, re-planning applies what Q learned.
- **Dismiss** — Hide the approval prompt; the island returns. The plan window remains open. The user can still approve from a later interaction.
- **Open Plan** — Focus or open the `plan.md` desktop window.

This is the most important human-in-the-loop moment in the product. The "Start Over" and "Give Feedback" options let the user refine the plan without leaving the Desktop. For deeper changes, the user can open the sidebar and teach Q directly.

No direct editing of `plan.md` in the app — though the user can always edit the file in a text editor.

### After Approval

Approval first commits the current state with `[stream/task] Plan accepted` via `commitGitState()`, then starts Q in working mode, which begins the step-by-step execution loop. See [Working](working.md). The island shifts from plan approval back to showing task activity (status, progress, stop button).

**Pre-run billing block:** If `canStartTask()` returns `{ allowed: false }` after plan approval (user has exhausted their runtime), the route commits "Plan accepted" immediately, writes `status: 'stopped'` with `stoppedDuring: 'working'` and `stopReason: 'budget'` to `.run.json`, and returns 403 with `{ upgrade: true }`. The UI shows a Continue button instead of re-showing plan approval — the plan was already accepted. When the user upgrades and clicks Continue, `POST /api/run/start` with `mode: 'working'` resumes from the stopped state, skipping the file clearing that a fresh start would do.

## Design Decisions

**The plan is called a "working plan."** The word "working" communicates that this is a living document being worked through, not a deliverable or a contract.

**Soft guidance on plan format, not a rigid structure.** The spec describes what a good working plan achieves, not what it looks like. The execution loop reads file state, not the plan.

**Start Task in chat, not a separate button.** The task lifecycle flows naturally from conversation. Q gathers context, reaches readiness, and surfaces the action. The user doesn't context-switch to start a task.

**Quick feedback without leaving the Desktop.** The plan approval prompt offers three options: approve, start over, or give feedback. "Give Q feedback" starts a new learning chat in the island — PlanApproval hides while the chat is active and returns when the user collapses it. Q reads the plan, processes the feedback, and can update playbooks or specs. The user then clicks "Start Over" to re-plan with updated knowledge.

**Planning starts as part of "Start Task", not separately.** No intermediate "Create Plan" button. The user clicked "Start Task" — that's the intent signal. The app creates the task, starts planning, and opens the task in one action. The Desktop renders whatever state the filesystem is in.

**No re-planning after working starts.** If the user doesn't like the output of a run, they teach Q (learning), then restart the task using the Start button. Every restart re-enters planning — the existing `plan.md` is deleted so Q plans from scratch based on the current state of the playbook and specs, without being influenced by its previous plan. The user never needs a separate "Re-plan" action.

## Acceptance Criteria

- [x] "Start Task" appears as a structured card in chat when Q has enough context (`CreateTask` tool call, see `specs/refs/codex-pre-task.png`)
- [x] Clicking "Start Task" creates task directory, persists inputs, writes `.run.json` with `status: 'planning'`, starts Q in planning mode, and opens the task — single atomic action
- [x] Desktop shows planning already in progress (no "Create Plan" button)
- [x] `.run.json` status is `'planning'` while Q is generating the plan
- [x] When planning completes successfully, `.run.json` is updated to `status: 'plan_ready'`
- [x] When planning fails, `.run.json` is updated to `status: 'stopped'` with `error` field populated; chat sidebar renders the error
- [x] `plan.md` appears on disk when Q completes successfully; SWR detects it via refetch
- [x] `plan.md` auto-opens as a desktop window when `plan_ready` is detected
- [x] Plan approval prompt replaces the island when `status === 'plan_ready'` (Approve / Start Over / Give Feedback / Dismiss / Open Plan)
- [x] Approval triggers Q in working mode via `POST /api/run/start` with `mode: 'working'` (see [Working](working.md))
- [ ] Approving the plan triggers a `[stream/task] Plan accepted` git commit before working mode starts
- [ ] Q reads task inputs, stream playbook, specs, and samples during planning — all via tools, not preloaded _(prompt compliance)_
- [x] The learning SDK session ends after the user clicks "Start Task" — planning reads files cold, no shared state with the prior conversation

For the island's plan approval behavior, see [Island](island.md). For plan window auto-open, see [Desktop](desktop.md).

## Testing

Run loop — planning mode (`lib/run/loop.server.test.ts`):

- [x] `startRun` with `mode: 'planning'` writes .run.json with `status: 'planning'` (`lib/run/loop.server.test.ts`)
- [x] Planning executes single query invocation (not iterative loop) (`lib/run/loop.server.test.ts`)
- [x] Planning failure writes `status: 'stopped'` with error to .run.json (`lib/run/loop.server.test.ts`)
- [x] User stop during planning aborts the query (`lib/run/loop.server.test.ts`)

API route:

- [x] POST /api/run/start with `mode: 'planning'` returns `{ status: 'planning' }` (`app/api/run/start/route.test.ts`)

Chat interaction:

- [x] StartTaskCard renders with onStart callback (`components/features/chat/interaction/start-task-card.test.tsx`)

- [x] PlanApproval component: approve, start over, dismiss, feedback input, loading state, plan link (`components/features/chat/interaction/plan-approval.test.tsx`)

Not tested:

- [ ] CreateTask-to-planning transition as end-to-end flow (client click → createTask → run/start → task opens)
- plan.md auto-open when plan content arrives (Desktop/window behavior, see Desktop spec)

## Edge Cases

- **User provides only text, no files**: Q works with what it has. Q may ask for files.
- **User provides only files, no text**: Q examines files and asks clarifying questions.
- **Inputs that don't match the stream type**: Q flags this in the chat conversation.
- **User approves immediately without reviewing**: Fine — their choice.
- **Plan generation fails**: Error shown in the island. User can start a new run or provide feedback.
- **User wants to change direction after approving**: Stop the run via the Stop button, teach Q in chat, click Start to restart (re-enters planning with updated context).

## Constraints

- No direct plan editing in the app.
- Plan approval is required before execution.
- Task slug uniqueness is guaranteed by time-sortable suffixes (see [Filesystem Layout](filesystem-layout.md)).
- Q reads stream-level content (playbook, specs, samples) every time it plans.
- Q's prompt ensures it creates a playbook before offering "Start Task" (prompt behavior, not app enforcement).
