# Task List

Orienting the product experience around a task list as the primary surface. Tasks are the central object. A task is a task — there is no distinction between "human" and "agent" tasks. Work streams provide context when a task is assigned to one, but the user lives in their task list, not inside a stream.

## Purpose

Define the task-list-centric model: how tasks are created, stored, assigned, and handed off between the user and Q. This is a structural shift from the current stream-centric navigation to a task-first experience (think Todoist).

## Related Specs

- Current filesystem layout and task directory structure → Filesystem Layout spec
- Agent modes and orchestration → Agent Configuration spec
- Run lifecycle and iteration loop → Working spec
- Pre-planning assessment and clarification → [Discovery](discovery.md) spec
- Plan generation and approval → Planning spec
- Data fetching and caching patterns → Data Flow spec

## Two User Flows

**Flow 1: Stream management** — Teaching Q. Building the playbook, adding specs, uploading samples. This is setup and knowledge work, separate from task execution. A stream is a body of knowledge Q uses to do work. Unchanged from the current model.

**Flow 2: Task management** — The primary experience. Creating, organizing, and tracking work. A task can be created anywhere — at home or within a stream — and optionally assigned to a stream (or in the future, to a person or team). The task list is the home screen.

## Directory Structure

```
~/HappyHQ/                                  # Workspace root (= agent CWD)
  tasks/                                    # All tasks live here (flat)
    call-dentist-01h8g3r7/                  # Task (no stream)
      task.md
    draft-q4-proposal-01h8k2w4/             # Task (assigned to acme-client stream)
      task.md
      inputs/
        context.md
        acme-deck/
          original.pdf
          raw.txt
      plan.md
      working/
      outputs/
      .run.json
  .chats/                                   # All chats (flat, gitignored)
    {sessionId}/
      chat.json                             # { name, mode, streamSlug, ... }
  acme-client/                              # Work stream (knowledge only)
    playbook.md
    specs/
    samples/
```

### Key changes from current model

- **Tasks at root level** — from `{stream}/tasks/` to `tasks/`. One scan location instead of N streams.
- **Chats at root level** — from `{stream}/.chats/` to `.chats/`. Stream affiliation via `streamSlug` in `chat.json`.
- **Streams are pure knowledge** — playbook, specs, samples. No `tasks/` or `.chats/` subdirectory.
- **Stream assignment via frontmatter** — `task.md` has a `stream` field instead of physical nesting.
- **Time-sortable slugs** — every task slug has a 9-char time-sortable suffix (Crockford's Base32). No collision detection.
- **Workspace CWD** — agent CWD is workspace root (`~/HappyHQ/`), not the task directory. No symlinks.
- **Messages directory** — Q↔human clarification exchange stored within the task, not in a separate chat.

## The Task Primitive: `task.md`

Every task is a markdown file with YAML frontmatter. The body is the description. This replaces the current `.meta.json` for task metadata and `inputs/context.md` for task description.

### Why markdown with frontmatter

- Human-readable and human-editable — open in any text editor, Obsidian, VS Code
- The title is free text in frontmatter, not derived from the directory slug. Long descriptions don't become terrible directory names.
- The body IS the description — natural, not crammed into a JSON field
- Structured metadata in YAML frontmatter
- Well-understood pattern (Jekyll, Obsidian, Astro)
- `gray-matter` parses it trivially in Node

### Task (no stream)

```markdown
---
title: Call dentist
createdAt: 2026-03-24T10:00:00Z
---

Schedule cleaning for next month. Ask about insurance coverage.
```

### Task (assigned to work stream)

```markdown
---
title: Draft Q4 Proposal
stream: acme-client
pending: approval
createdAt: 2026-03-24T10:00:00Z
updatedAt: 2026-03-24T14:30:00Z
---

Research all the competitors in the enterprise AI space and create
a comparison spreadsheet. Focus on pricing tiers and feature gaps.
```

### Frontmatter fields

| Field         | Required | Type     | Notes                                                                             |
| ------------- | -------- | -------- | --------------------------------------------------------------------------------- |
| `title`       | yes      | string   | Free text, any length                                                             |
| `createdAt`   | yes      | ISO 8601 | Set on creation                                                                   |
| `stream`      | no       | string   | Work stream slug. Absent for unassigned tasks.                                    |
| `pending`     | no       | string   | Why the task needs the user — `clarification`, `approval`, `checkpoint`, `review` |
| `completedAt` | no       | ISO 8601 | Present = task is done. Absence = active.                                         |
| `updatedAt`   | no       | ISO 8601 | Set on every state change                                                         |

### Relationship to `.run.json`

- `task.md` = the **list item** primitive (what the task is, whether it needs attention, whether it's done)
- `.run.json` = the **execution** primitive (iterations, cost, timing — only for tasks with a stream assignment, during/after runs)

The task list reads only `task.md` files. `.run.json` is read only when viewing a specific task's run details.

## Task Lifecycle

### Creation

User clicks "new task" in the task list. Types a title and optionally a description. App creates:

```
tasks/{auto-slug}/
  task.md
```

The slug is auto-generated from the title: kebab-cased, truncated, with a 9-character time-sortable suffix always appended. The title in frontmatter is the canonical name — the slug is just a directory identifier.

**Slug format:** `{kebab-title}-{9-char-suffix}`. The suffix is 7 characters of Crockford's Base32 timestamp (second precision, good until ~3058) plus 2 characters of random. Always appended — no collision detection needed. Examples: `march-25-01h8g3r7a`, `draft-proposal-01h8k2w4b`.

**Why time-sortable:** The creation timestamp is encoded in the directory name — survives git clone, rsync, cloud sync, and sharing across machines (filesystem `createdAt` metadata does not). Same-title tasks sort chronologically in Finder. This is hard to migrate to later if you start with random suffixes, so we start here.

Quick capture: title only, description can be added later.

### Assignment to a work stream

User assigns the task to a work stream (e.g., "Acme Client"). This is one action that means "Q, handle this using this stream's knowledge." The app:

1. Updates `task.md` frontmatter: `stream: acme-client`
2. Q starts the clarification step immediately

Assignment is metadata — the task stays in `tasks/`, only the `stream` field changes. In the future, tasks may also be assigned to people or teams using the same pattern.

### State machine

Task state is derived from two frontmatter fields: `completedAt` and `pending`. There is no explicit `status` enum.

```
[created]                                         # task.md written, no completedAt, no pending
    │
    ├── user checks off ──────────────────────── [done]  # completedAt set
    │
    └── assigned to stream ── Q clarifying
                                   │
                                   ├── Q has questions ──── pending: clarification
                                   │                             │
                                   │                        user answers → pending cleared
                                   │                             │
                                   │                        back to Q clarifying
                                   │
                                   └── Q has enough ── Q planning
                                                           │
                                                      plan ready ──── pending: approval
                                                           │
                                                      user approves → pending cleared
                                                           │
                                                      Q working
                                                           │
                                                      ┌────┴────┐
                                                      │         │
                                               playbook      work done
                                               checkpoint         │
                                                  │         pending: review
                                           pending: checkpoint    │
                                                  │         user confirms
                                               user confirms      │
                                                  │          [done]  # completedAt set
                                            pending cleared
                                                  │
                                             back to Q working
```

### Four handoff points (ball back to user)

1. **Clarification** — Q reads the task description and needs more info. "Should this focus on pricing or technical comparison?" Q asks via AskUserQuestion, synthesizes answers into `task.md`. See [Discovery](discovery.md).
2. **Plan approval** — Q has a plan, user reviews and approves. Exists today.
3. **Playbook checkpoint** — The stream's playbook defines human sign-off points. "Legal needs to approve this language before I proceed." New, driven by playbook content.
4. **Completion review** — Q finished, user confirms done. Partially exists today.

All four are configurable per stream or globally. Power users could auto-accept plans and skip clarification.

### Pending field

When the task needs human action, the `pending` field describes why:

| `pending` value | Meaning                                |
| --------------- | -------------------------------------- |
| `clarification` | Q has questions before it can plan     |
| `approval`      | Plan ready for review                  |
| `checkpoint`    | Playbook-defined human sign-off needed |
| `review`        | Work complete, confirm done            |

The task list uses this to show "needs attention" indicators. When `pending` is cleared (absent), the ball is in Q's court or the task is a simple todo.

## Agent Workspace Model

The agent's CWD is the workspace root (`~/HappyHQ/`). Both stream knowledge and task files are accessible via workspace-relative paths. No symlinks, no runtime filesystem wiring.

The system prompt tells the agent:

- The task directory: `tasks/{task-slug}/`
- The stream knowledge directory: `{stream-slug}/` (if the task has a stream assignment)

The agent reads `{stream-slug}/playbook.md` when it needs knowledge context. It writes to `tasks/{task-slug}/outputs/`. Everything is relative to the workspace root.

For content too large to embed in the system prompt (large samples, reference docs), the agent reads from `{stream-slug}/` paths on demand. For smaller content (playbook, specs), the system prompt can inject them directly.

This model has zero moving parts — no symlink create/cleanup/crash recovery. If tighter containment is needed later (CWD narrowed to the task directory with a symlink for stream access), that's an easy additive change.

## Future: Multi-Channel Architecture

> **Not yet implemented.** When multi-channel is built, `source` and `notify` fields will be added to `task.md` frontmatter. Until then, these fields are not part of the spec.

### Principle

The task is the canonical entity. Q is channel-agnostic — it reads task files, does work, writes output. Channels are I/O adapters that create tasks and relay handoffs.

### Channels

- **App** — primary UI, always available
- **Slack** — create via slash command, Q&A in threads, approve/reject via reply
- **Email** — create by forwarding, Q replies in thread for clarification

### How it works

Task creation from any channel writes the same `task.md`. The `source` field records where it came from. The `notify` array lists where to send handoff notifications.

When Q sets a `pending` value (needs human action), the app:

1. Updates `task.md` frontmatter
2. For each entry in `notify`, sends a notification via that channel's adapter

When the user responds (in any channel), the adapter:

1. Relays the user's response to Q (via AskUserQuestion answer pipeline)
2. Q processes the response and updates `task.md` (clears `pending`)
3. Q resumes

Channels are dumb I/O pipes — they relay messages between the user and Q. Q is the only writer of `task.md`. The session transcript (via `discoverySessionId` in `.run.json`) records all exchanges regardless of originating channel.

### Slack flow example

1. User: `/q Draft a proposal for Acme Client` → adapter creates `task.md` with `source: slack`, `notify: [{ channel: slack, ref: thread_ts }]`
2. Auto-assigns to `acme-client` work stream → Q starts discovery (see [Discovery](discovery.md))
3. Q has a question → adapter relays to Slack thread: "Should this focus on pricing or features?"
4. User replies in Slack → adapter relays answer back to Q → Q updates `task.md`
5. Plan ready → Slack: "Plan ready — reply 'approve' or view in Q"
6. User replies "approve" → Q works
7. Done → Slack: "Draft is ready. View outputs →"

## Q&A Within Tasks

Task-level clarification happens during the discovery phase (see [Discovery](discovery.md)). Q uses AskUserQuestion for structured Q&A, then synthesizes what it learned into a `## Discovery` section in `task.md`. The session transcript (via `discoverySessionId` in `.run.json`) is the audit trail for the exchange.

The learning chat (Flow 1) still exists for stream-level teaching. Discovery handles task-specific Q&A.

## Performance

### Task list scan

The task list reads `tasks/*/task.md`, parsing frontmatter only (skip body).

| Scale      | Scan time | Notes      |
| ---------- | --------- | ---------- |
| 100 tasks  | ~15ms     | Instant    |
| 500 tasks  | ~60ms     | Fast       |
| 2000 tasks | ~250ms    | Acceptable |

### Strategies (in order of when needed)

1. **Now: Just read them.** Scan on page load, cache in Zustand store. SWR refresh on navigation, task creation, or run state change.
2. **Later: Filesystem watcher.** `chokidar` / `fs.watch` on `tasks/*/task.md`. Push-based updates — only re-read files that changed.
3. **Much later: Index file.** `tasks/.index.json` — denormalized list rebuilt incrementally. Single read for the full list.

### State management

- New `taskListStore` (or extension of existing store) for the flattened task list
- New SWR cache key for task list data
- Per-task detail fetches remain separate

## Finder Browsability

Tasks live in a flat `tasks/` directory. Finder doesn't show tasks grouped by stream — the app handles grouping natively via the `stream` frontmatter field. This is deliberate: task identity is independent of stream assignment, and assignment is metadata that can change without moving files.

## Open Questions

- **Task ordering** — default to `updatedAt` desc? Manual ordering later via `position` field?
- **Task deletion** — soft delete (set `completedAt` and hide) or hard delete?
- **Subtasks** — needed, or is `plan.md` sufficient for breaking down work?
- **Tags/labels** — beyond stream grouping, cross-cutting organization?
- **Message format** — structured markdown with frontmatter. See [Discovery](discovery.md).
- **Clarification agent mode** — discovery phase runs before planning. See [Discovery](discovery.md).
- **Migration** — incremental path from current stream-nested tasks. See migration section.

## Migration Path

1. Move stream-nested tasks (`{stream}/tasks/`) to root `tasks/` — set `stream` field in `task.md` frontmatter
2. Move stream-nested chats (`{stream}/.chats/`) to root `.chats/` — set `streamSlug` in `chat.json`
3. Remove empty `tasks/` and `.chats/` from stream directories
4. Update `createStream` to only create `specs/` and `samples/` (no `tasks/`)
5. Update all code paths that read/write chats from stream directories to use root `.chats/`
6. Add clarification agent mode
7. Add channel adapters (Slack, email)

Steps 1-3 are manual data reorganization. Steps 4-5 are code changes. Steps 6-7 are new features.
