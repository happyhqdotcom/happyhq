# System Reminders

How Q receives situational context that changes between sessions or turns — separate from the system prompt (identity) and the user message (intent).

## Purpose

Define the three-tier prompt model, the catalog of system reminders Q uses, and the boundary between standing instructions (prompt) and situational context (reminders). This spec owns what reminders exist, when they fire, and how they compose. It does not own the content of individual prompts — those live in `prompts/`.

## Three-Tier Model

Q's prompt is composed from three layers, each with a distinct purpose:

**System prompt** (`prompts/general.md`, ~10 lines) — Q's permanent identity. Always present. Never changes between modes. Defines who Q is and how it behaves at rest. Short because most of Q's intelligence comes from the model, not the instructions.

**System reminders** (`<system-reminder>` blocks prepended to user message) — Situational context that changes per-turn or per-session. Conditional: each reminder fires only when its trigger is met. Rebuilt fresh every turn. The model treats these as system-level instructions despite sitting alongside the user message.

**User message** — The user's actual input. Never modified with Q's instructions.

This mirrors Claude Code's architecture: a stable system prompt, ~40 conditional reminders injected per-turn, and the user's message kept clean.

## Reminder Design Principles

System reminders should help Q do a great job _right now_, given where the user is and what they're doing. The craft is in the triggers.

Each reminder must pass a two-pronged test before it earns a place in the catalog:

**1. Would Q get it wrong without this?** (Behavioral) — The reminder prevents Q from doing the wrong thing. Example: without `Viewing Task`, Q searches the filesystem and finds the wrong task.

**2. Would Q waste time figuring it out?** (Latency) — The reminder brings information forward so Q doesn't have to wander. Example: without `StreamManifest`, Q has to list directories and discover what exists before it can start reading — 4-6 tool calls saved.

If a reminder fails both tests — Q would handle it fine and wouldn't lose time — don't write it. State-completeness is not a goal. The catalog should be sparse: only reminders that change behavior or save latency.

### Not everything, not nothing

Reminders are conditional injections tied to specific triggers, not a generic dump of everything Q might need. Each fires only when its trigger is met. Don't list files that don't exist — models follow paths, and pointing at absent files leads to wasteful reads. Presence = listed, absence = silent.

### Describe, don't count

Name inputs and outputs — don't tally them. "3 inputs" makes Q spiral looking for exactly 3 files, and it understates that inputs are more than files (descriptions, context, web sources). Say "context including acme-brief and scope-doc", not "2 inputs." Mention existence ("has a plan"), not content.

### Task-forward when on a task

When the user has a task open, the task is the primary context. Stream is a supporting detail. General Context simplifies to a workspace headline. The Viewing Task reminder carries the detail.

### Contextual triggers

The same data gets different framing depending on mode and location. On a task in general mode → task is primary. Same task but learning mode → stream knowledge becomes more relevant. Reminders compose differently depending on what the user is doing.

### Prompt vs. Reminder

The learning layer (`prompts/learning-layer.md`) is pure standing instructions — classification system, interview methodology, subagent delegation, drafting workflow, git conventions, quality standards. True every turn the mode is active. No situational context.

Situational context lives in reminders — stream manifest, task context, upload awareness. These vary by session, turn, or state and fire only when their trigger is met.

## Reminder Catalog

### 1. General Context

**Trigger**: General mode, every turn.

**Content**:

```
Today is {{DATE}}.
Streams: {{STREAM_LIST}}
Active stream: {{ACTIVE_STREAM}}
{{TASK_HEADLINE}}
```

Examples:

```
Today is March 31, 2026.
Streams: client-reports (Client Reports), sows (SOWs)
Active stream: client-reports
3 tasks across streams. 1 needs attention: draft-q4-report (failed).
```

```
Today is March 31, 2026.
Streams: sows (SOWs)
2 tasks.
```

**Token estimate**: ~60-80.

**Replaces**: The current inline stream list in `route.ts` (lines 136-151). Adds the date (Q has no other way to know it) and a task headline — count plus anything needing attention (failed, awaiting approval, usage-limited). Not a full task listing. If nothing needs attention: just the count. If zero tasks: omit the task line.

**Task scope**: Contextual. All streams when no active stream (top-level chat). Active stream only on a desktop.

**Data**: `readStreams()` (already called) + lightweight task scan across streams.

### 2. Upload Awareness

**Trigger**: User message contains `[Files uploaded: ...]` annotation, **any mode**.

**Content**:

```
The user uploaded files. They're at .chats/{{SESSION_ID}}/uploads/. Each upload is a directory with the original plus an extracted form (PDF→raw.txt, EML→email.json, DOCX→content.md). Read the extracted form first.
Don't auto-process uploads as samples. Read, understand intent, confirm with the user.
```

**Token estimate**: ~70.

**Cross-mode**: Fires in both general and learning mode. The learning layer currently includes upload handling rules (lines 63-74 of `learning-layer.md`) on every turn regardless of whether uploads exist. This reminder replaces that with conditional firing. The upload section should eventually be removed from the learning layer — it's situational context, not standing instructions.

### 3. First-Time / Empty Workspace

**Trigger**: General mode, zero streams exist.

**Content**:

```
This is a new workspace with no streams yet. The user is probably new to Q. Help them understand what Q does: learn how they work, then do the work for them. Streams hold knowledge (playbook + specs + samples). When they're ready, enter learning mode.
```

**Token estimate**: ~60.

**Replaces**: The unhelpful "No streams yet." line that currently fires when the workspace is empty. Provides onboarding context instead.

**Mutually exclusive with**: General Context's stream list (if there are no streams, the General Context reminder fires with just the date and no stream lines, and this reminder adds the onboarding framing).

### 4. Viewing Task

**Trigger**: General mode, `taskSlug` provided in ChatRequest (user has a task open on the desktop).

**Why**: Q needs to know what task it's looking at to orient itself. Without this, Q searches the filesystem and can find the wrong task — real failure: user on a completed SOW task, Q found a different SOW for the same customer.

**Compose behavior**: When this reminder fires, General Context simplifies to a workspace headline (date + stream/task counts). The Viewing Task reminder becomes the primary contextual block.

**Content**: Prose, task-forward. Task name leads (user thinks in names), slug lives in the directory path (Q needs it for tool calls). Describes what exists — everything is "context" (no distinction between description and file inputs). Names inputs and outputs so Q can reference them. No counts, no plan content, no costs.

Examples:

```
## Viewing Task
The user has "Grandma's Dutch Apple Pie Recipe" open, a completed task in the apple-pies stream. The task has context, a plan, and produced outputs (recipe-card.md, ingredient-sourcing-guide.md). The task directory is tasks/grandmas-dutch-apple/.
```

```
## Viewing Task
The user has "Holiday Pie Menu" open in the apple-pies stream, currently running. The task has context including flavor-profiles and crust-options, and a plan. The task directory is tasks/holiday-pie-menu/.
```

```
## Viewing Task
The user has "New Pie Experiment" open. No content yet. The task directory is tasks/new-pie-experiment/.
```

**Token estimate**: ~40-100.

**Data**: `readTaskContent(taskSlug)` including frontmatter (title, stream, completedAt, pending).

### 6. Learning Layer

**Trigger**: Learning mode, every turn. Also injected via PostToolUse hook on the turn Q calls `EnterLearningMode`.

**Content**: `learning-layer.md` — pure standing instructions (~85 lines, ~2000 tokens). Classification system, interview methodology, subagent delegation, drafting workflow, git conventions, quality standards.

The learning layer describes artifact _types_ (playbook, specs, samples) without pointing to specific files. Paths to actual files come from the `NewStream` or `StreamManifest` reminders, which only list files that exist.

Template variables: `{{STREAM_NAME}}`, `{{STREAM_SLUG}}`, `{{Q_PATH}}` (identity/location only — no situational context). The function is sync — no I/O.

Owned by `prompts/learning-layer.md` and `specs/learning.md`.

### 7. NewStream

**Trigger**: Learning mode, stream has no playbook content AND no specs AND no samples.

**Content**:

```
## Stream: {{STREAM_SLUG}}
This is a new stream with no content yet. Your job is to understand
how the user does this work — so you can do it for them, exactly how
they would. Ask thoughtful questions first.
```

**Token estimate**: ~50.

**Why it exists** (behavioral): Without this, Q tries to read files that don't exist (the learning layer mentions artifact types, Q goes looking) and jumps to creating artifacts before understanding the work.

**Mutually exclusive with**: StreamManifest. When the stream is empty, there's nothing to manifest. When it has content, Q doesn't need the discovery nudge.

### 8. StreamManifest

**Trigger**: Learning mode, stream has any content (playbook body, specs, or samples).

**Content** (example):

```
## Stream: email-intros
Playbook: email-intros/playbook.md
Specs: email-intros/specs/intro-email.md, email-intros/specs/follow-up.md
Samples: 3 in email-intros/samples/intros/
```

**Token estimate**: ~30-80 depending on content.

**Why it exists** (latency): Without this, Q has to list directories and discover what exists before it can start reading — 4-6 tool calls of wandering. The manifest lets Q jump straight to the right files.

**Format**: Presence = listed, absence = not mentioned. Paths for things Q should read immediately (playbook, individual specs). Counts for collections (samples). No "none" lines — silence IS the signal.

**Mutually exclusive with**: NewStream.

### 9. Learning Task Context

**Trigger**: Learning mode, `taskSlug` is set.

**Content**:

```
Active task: {{TASK_SLUG}}. Task inputs at tasks/{{TASK_SLUG}}/inputs/.
```

**Token estimate**: ~20.

**Why it exists** (latency + behavioral): Q needs to know about task inputs and where they live without scanning the filesystem.

## What's Deliberately Excluded

**Context window warnings** — Q's conversations are shorter than Claude Code's. The SDK manages context internally. Adding our own tracking would require hooking into SDK internals we don't have access to at the route level.

**Usage / billing** — Billing awareness belongs in the UI layer (sidebar usage indicator, LimitReachedOverlay, LowBalanceWarning), not in Q's conversational context. Q doesn't control task execution budgets — the run loop does.

**User identity / name** — Minimal payoff. Would require plumbing InstantDB user data through the API. Q can learn the user's name naturally in conversation.

**Session state (new vs. resumed)** — The SDK handles resume transparency. On resume, Q sees the full conversation history. A "you're resuming" reminder is redundant.

**Tone / conciseness nudges** — Trust the agent. Tone is defined in the system prompt. Per-turn nudges contradict the "imperative over explanatory" principle.

**Tool availability** — Q's tools are always the same regardless of mode. No need to list them.

**Git status** — Q's git usage is fire-and-forget. Status isn't useful context the way it is for Claude Code.

**Mode transition nudge** — Already in the system prompt ("call EnterLearningMode immediately — before reading files or exploring. Don't ask."). If Q isn't entering learning mode reliably, fix the prompt. Don't add a redundant per-turn reminder.

## Architecture

### Builder Pattern

A `buildReminders()` function takes request context and returns reminder strings. The route composes them into a single `<system-reminder>` block.

```typescript
// lib/agents/reminders.server.ts

interface ReminderContext {
  mode: 'general' | 'learning'
  streamSlug: string | null
  sessionId: string
  taskSlug?: string
  message: string // for upload detection
}

async function buildReminders(ctx: ReminderContext): Promise<string[]>
```

### Composition

Each reminder is wrapped in its own `<system-reminder>` block, matching Claude Code's pattern. The model treats each as a distinct piece of context.

```typescript
// app/api/chat/route.ts
const reminders = await buildReminders({
  mode,
  streamSlug,
  sessionId,
  taskSlug,
  message,
})
const reminderBlock =
  reminders.length > 0
    ? reminders
        .map((r) => `<system-reminder>\n${r}\n</system-reminder>`)
        .join('\n') + '\n'
    : ''
const prompt = reminderBlock + message
```

`stripSystemReminders()` uses a non-greedy regex with the global flag (`/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g`) — handles multiple blocks correctly.

### Ordering

Reminders fire in order, most stable context first, most situational last:

**General mode (no task active):**

1. General Context — date + streams + task headline
2. Upload awareness (files present)

**General mode (task active):**

1. Workspace Context — date + lightweight overview (simplified General Context)
2. Viewing Task — the primary contextual block
3. Upload awareness (files present)

**Learning mode:**

1. Learning layer (standing instructions)
2. NewStream OR StreamManifest (mutually exclusive)
3. Learning task context (task open)
4. Upload awareness (files present)

## Implementation Notes

### Key files

- `app/lib/agents/reminders.server.ts` — builder functions for all reminders, `buildReminders()` for general mode, `buildLearningReminders()` for learning mode. Each function has a catalog-style JSDoc (name, trigger, why, examples) that serves as the living spec.
- `app/lib/agents/prompts.server.ts` — `learningLayerPrompt()` (sync, instructions only), `formatStreamContext()`, `streamManifest()`
- `app/lib/agents/config.server.ts` — PostToolUse hook uses `buildLearningReminders()`
- `app/api/chat/route.ts` — composes reminders into individual `<system-reminder>` blocks

### Data sources (all existing, no new filesystem code)

- `readStreams()` — stream list
- `readStreamContent()` — stream manifest (playbook/spec/sample presence and paths)
- `readTaskContent()` — task frontmatter, plan, description, inputs, outputs (for Viewing Task)
- `listAllTaskItems()` — lightweight scan for counts and attention-needing statuses
- Upload detection — regex on user message for `[Files uploaded: ...]`

### Future: File Type Reminders

The Upload Awareness reminder (#2) currently includes all extraction formats (PDF→raw.txt, EML→email.json, DOCX→content.md) on every upload. A more targeted approach: individual file-type reminders that fire per type present in the uploads.

- `HandlingEmails` — fires when `.eml` files are present. Email-specific extraction and conventions.
- `HandlingPDFs` — fires when `.pdf` files are present. PDF extraction conventions.
- `HandlingDocx` — fires when `.docx` files are present. DOCX extraction conventions.

Each passes the behavioral test: without it, Q reads the raw binary instead of the extracted form. These would replace the generic extraction format listing in Upload Awareness.

## Cross-References

- [Chat Modes](chat-modes.md) — Mode system, transitions, additive layer architecture
- [Prompts](prompts.md) — Prompt style, structure, and scoping conventions
- [Learning](learning.md) — Learning behavior, classification, teaching flow
