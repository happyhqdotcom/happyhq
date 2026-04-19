# Prompts

How Q's system prompts are written — style, structure, and the filter for what belongs in a prompt vs. what the agent handles naturally.

## Purpose

Define the conventions for writing and maintaining Q's three system prompts. The behavioral specs ([Learning](learning.md), [Planning](planning.md), [Working](working.md)) define what Q must do. This spec defines how those behaviors are expressed as prompts — concise instructions for a capable agent, not tutorials or documentation.

This spec owns prompt style, structure, and scoping. It does not own the behavioral contracts themselves — those live in the specs listed above. When a behavioral spec changes, the corresponding prompt is updated to match, following the conventions defined here.

## Prompt Files

```
prompts/
  learning.md       # Q — conversational learning (Opus)
  planning.md       # Q — planning a task (Opus)
  working.md        # Q — working on a task (Opus)
  drafting.md          # Drafting — spec-driven production agent (Opus subagent)
```

Loaded at runtime by the server and passed as the `systemPrompt` option to `query()` (or as `prompt` on an `AgentDefinition` for custom agents like Drafting). Peer to `specs/` in the project structure.

### What Each Prompt Owns

**`learning.md`** — Q's main prompt for learning conversations. Opens with Q's job ("learn the user's work") and what to capture (playbook, specs, samples). Preamble reads fire subagents at session start to scan the stream. Sections cover: file locations, git convention, interview style (propose-and-confirm via AskUserQuestion), subagent delegation, Drafting delegation for writing specs, uploaded file handling, and CreateTask. Weighted 9s enforce delegation and preamble compliance. The rest is left to Opus — no conversation scripting or phase management. See `specs/refs/learning-reference/` for the spike that validated this approach.

**`planning.md`** — Single invocation: read everything, write `plan.md`, exit. Most of what Q needs is already defined by the task inputs and stream knowledge on disk. Covers: 0-step for reading list, plan writing with session guidelines, playbook injection.

**`working.md`** — One iteration of Q's work loop: read inputs, follow the plan, do the work, update plan with progress, commit, exit. Fresh instance each iteration — no memory of previous runs. Plan.md is the living document — updated each iteration with progress and learnings. Covers: 0-step reading list, 2-step work cycle (do, update plan + commit), weighted 9s for critical constraints (one session per iteration, `[done]` completion signal).

**`drafting.md`** — Drafting subagent's system prompt. Spec-driven production: read the spec and samples, write the artifact to the target path using the Write tool, self-verify against acceptance criteria. Drafting is Opus, so it only states what's unique to Drafting's job (read spec first, samples second, brief is truth, verify before writing, write exactly one file).

## Style

Prompts follow the style established in Geoff's operational prompts (`PROMPT_build.md`, `PROMPT_plan.md`). The core principle: **these are instructions for a smart agent, not tutorials.** State what to do, not how to think about it.

### Voice

Q is warm but efficient. Not corporate, not cutesy. A sharp colleague who genuinely wants to understand the user's work and do it well. Q proposes rather than asking open-ended questions. Q is transparent about what it's doing and why.

Voice is defined in the learning prompt's identity section. The planning and working prompts don't need voice — Q doesn't converse with the user in those modes.

### Imperative Over Explanatory

Write commands, not descriptions. The agent executes instructions; it doesn't need rationale for each one.

- **Do:** "Use subagents to read all files in `inputs/`."
- **Don't:** "Use subagents via the Task tool for: reading multiple files, scanning reference material, drafting content."

The first is a command. The second explains what subagents are for — which Claude already knows.

### Trust the Agent

Omit anything Claude would do naturally. Claude knows how to read files, write markdown, have conversations, synthesize information, use git, and handle edge cases with judgment. The prompt should only state what's **unique to Q's job**.

The filter: _Would Claude do this without being told?_ If yes, leave it out.

Examples of things to omit:

- How to have a conversation (Claude knows)
- How to read files (Claude knows)
- Edge case handling for ambiguous situations (Claude handles with judgment, guided by the principles stated)
- App internals (SWR, API routes, `.run.json`) — not the agent's concern
- Tool documentation — Claude knows its own tools
- Design rationale — prompts say what, not why

Examples of things that MUST be stated:

- The classification system (playbook vs spec vs new spec vs sample) — domain-specific
- The `[done]` completion protocol — entirely Q-specific
- Subagent delegation — counter to default behavior (Opus will do everything itself otherwise)
- Propose-and-confirm over open-ended questions — counter to Claude's default
- Don't write files after every answer — counter to Claude's instinct to be immediately helpful
- One step per iteration — counter to Claude's instinct to be thorough

## Structure

### Planning and Working Prompts

Follow Geoff's numbered-step pattern:

**0-steps** — Orient before acting. A concrete pre-step that says "read these things" via a generated reading list. The agent treats numbered steps as literal instructions to execute, not guidance to consider.

**Numbered steps** — The core work cycle. Planning has one step (write plan.md). Working has three (do, review, commit). Each step does one thing.

**Weighted 9s** — Persistent rules the agent must hold across all steps, weighted by priority. The escalating numbers signal relative importance to the model. The highest-weighted rule should be the most critical behavioral constraint (e.g., `[done]` completion signal in Working).

```
0. Read all of the following. Use parallel reads and relative paths from cwd:

{{READING_LIST}}

1. Follow plan.md. Pick the next uncompleted session. Do the work.

2. Update plan.md after each turn and git add -A && git commit.

**[999]** One session per iteration. Do it well. Commit and exit.
**[9999]** [done] only when ALL deliverables are in outputs/.
```

### Learning Prompt

Uses plain markdown sections — identity, artifact definitions, file paths, git, CreateTask, subagent delegation. A BEFORE block with bullet points enforces parallel subagent firing at session start (scan `.q/`, peek uploads, scan stream specs/samples); weighted 9s enforce delegation discipline and session-start compliance. These were added after testing revealed that Opus skips subagent delegation and session-start reads without explicit constraints. The rest of the prompt stays minimal — Opus handles conversation naturally.

## Scoping

### Template Variables

The Agent Config spec defines `cwd` as `~/HappyHQ/` (workspace root) for all modes. Stream knowledge and task files are both accessible via workspace-relative paths.

All paths in prompts are relative to `cwd`. Template variables are used per mode:

**`{{Q_PATH}}`** (learning prompt only). Q's `.q/` directory is a dot-prefixed sibling at `~/HappyHQ/.q/`. Two things prevent using a relative path:

1. Glob patterns exclude dot-prefixed directories — `.q/**/*.md` returns nothing (same as `.git/`)
2. Glob's `path` parameter requires absolute paths — `../.q` fails with "directory does not exist"

`{{Q_PATH}}` is substituted at runtime with the absolute path by `learningPrompt(qAbsolutePath)` in `lib/agents/prompts.server.ts`. The prompt uses `Glob("**/*.md", path="{{Q_PATH}}")` — clean pattern, absolute path, works correctly.

**`{{TASK_NAME}}`** (planning and working prompts). Since cwd is the workspace root, task paths use a `tasks/{taskSlug}/` prefix. `{{TASK_NAME}}` is substituted at runtime by `planningPrompt(taskName)` and `workingPrompt(taskName)` in `lib/agents/prompts.server.ts`. This gives prompts concrete paths like `tasks/mickey-walt-01h8k2w4/plan.md`.

**`{{STREAM_CONTEXT}}`** (learning prompt). A server-built manifest of what exists in the stream, injected so the agent has situational awareness before making any tool calls. Built by `buildStreamContext()` / `formatStreamContext()` in `lib/agents/prompts.server.ts`, which reads stream content and uploads in parallel at query time. The manifest is a presence summary — not file contents:

```
Playbook: exists
Specs: sow.md, engagement-letter.md
Samples: sows/, engagement-letters/
Uploads: none
Tasks: write-sow (completed, has plan)
```

For a brand-new stream: `"This is a brand new stream. No playbook, specs, samples, or uploads yet."`

**`{{READING_LIST}}`** (planning and working prompts). A server-built list of exact file paths the agent should read, replacing the old `{{CONTEXT}}` presence summary. Built by `buildReadingList()` in `lib/agents/prompts.server.ts`, which walks the stream's specs, samples, and task inputs to produce a bulleted markdown list of concrete paths. For each directory (samples, inputs), `resolveReadable()` picks the agent-readable extracted form of the file — each input type has its own convention:

- **PDF** → `raw.txt` (plain text extraction via pdfium)
- **EML** → `email.json` (structured email metadata: subject, from, to, body, attachments)
- **Fallback** → any `.md`/`.txt`, then first non-hidden file

When a sample type has multiple entries plus an `INDEX.md`, only the INDEX is listed with an instruction to choose relevant samples. Working mode extends the list with `tasks/{taskName}/plan.md`.

**`{{PLAYBOOK}}`** (planning prompt only). The full playbook content injected directly into the planning prompt. The planning agent receives the playbook inline rather than reading it via tools — it's always relevant and avoids an extra tool call.

**`{{STREAM_NAME}}`** (working prompt only). The stream slug, used for git commit message prefixes (e.g., `[stream/task]`).

**`{{TASK_CONTEXT}}`** (learning prompt, optional). Injected when a learning chat is task-aware — specifically when plan feedback opens a learning chat via the island. Contains the active task slug and inputs path, plus boundary rules: Q can read and update task inputs and stream specs, but must never write to `plan.md`, `working/`, or `outputs/`. Only present when `taskSlug` is passed to `learningPrompt()`.

Q derives stream and task names from the directory structure when needed (e.g., git commit message prefixes like `[stream/task]`).

### Path Conventions

Use bare paths (`playbook.md`, `specs/`) not `./` prefixed paths in prompts. The `./` prefix causes issues with the agent's Glob tool.

**All modes** (cwd = workspace root `~/HappyHQ/`):

- Stream knowledge: `{stream-slug}/playbook.md`, `{stream-slug}/specs/`, `{stream-slug}/samples/`
- Task-level (planning/working only): `tasks/{task-slug}/inputs/`, `tasks/{task-slug}/plan.md`, `tasks/{task-slug}/working/`, `tasks/{task-slug}/outputs/`

### Subagent Instructions

The planning and working prompts explicitly instruct Opus to delegate bulk reading to subagents. Without this, Opus reads everything itself at higher cost. The instruction is a command ("Use subagents to read files in parallel") not an explanation of the cost model. The SDK's native subagent types (Explore, Plan, general-purpose) handle model selection automatically.

Q in planning/working mode also needs to know what to keep in Opus: decisions, synthesis, quality judgment, and final output writing. Subagents handle file reading, scanning, and drafting.

## Spec-to-Prompt Mapping

Each behavioral spec defines requirements. The prompt implements them. Not every requirement appears in the prompt — some are natural behavior, some are app-level concerns.

| Spec                            | Prompt        | What the prompt must cover                                                                                                            |
| ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| [Learning](learning.md)         | `learning.md` | Identity, artifact definitions (playbook/specs/samples), file paths, git convention, CreateTask. The rest is left to Opus.            |
| [Samples](samples.md)           | `learning.md` | `pdftotext` in file paths section. Opus handles sample intake naturally when given the artifact definitions and sample storage paths. |
| [Planning](planning.md)         | `planning.md` | Reading list, write plan.md, session guidelines, playbook injection                                                                   |
| [Working](working.md)           | `working.md`  | Reading list + plan.md, follow plan, update plan with progress, `[done]` completion signal, git commit per iteration                  |
| [Agent Config](agent-config.md) | all           | Subagent delegation pattern, tool usage conventions, Drafting delegation in learning.md                                               |

Requirements that are **not** in the prompts (app-level concerns): `.run.json` management, loop orchestration, SWR polling, abort handling, iteration limits, API routes.

## Maintenance

When editing prompts:

1. Trace the change back to a behavioral spec. If the spec hasn't changed, the prompt probably shouldn't either.
2. Apply the "trust the agent" filter. Would Claude do this without being told?
3. Keep the imperative tone. Commands, not explanations.
4. Weight 9s by actual importance. Don't add a 9 for something that's nice-to-have.
5. Read Geoff's prompts (`PROMPT_build.md`, `PROMPT_plan.md`) as a tone check before finalizing.

## Testing

Prompt loading (`lib/agents/prompts.server.ts`):

- [x] Prompts loaded from filesystem and cached (`lib/agents/prompts.server.test.ts`)
- [x] `{{Q_PATH}}` substituted with absolute path in learning prompt (`lib/agents/prompts.server.test.ts`)
- [x] `{{TASK_NAME}}` substituted in planning/working prompts (`lib/agents/prompts.server.test.ts`)
- [x] `{{STREAM_CONTEXT}}` substituted with server-built manifest in learning prompt (`lib/agents/prompts.server.test.ts`)
- [x] `{{READING_LIST}}` substituted with resolved file paths in planning/working prompts (`lib/agents/prompts.server.test.ts`)
- [x] `{{PLAYBOOK}}` substituted with playbook content in planning prompt (`lib/agents/prompts.server.test.ts`)
- [x] `{{STREAM_NAME}}` substituted with stream slug in working prompt (`lib/agents/prompts.server.test.ts`)
- [x] `{{TASK_CONTEXT}}` substituted when taskSlug provided, empty otherwise (`lib/agents/prompts.server.test.ts`)
- [x] `formatStreamContext` produces presence summary from stream content (`lib/agents/prompts.server.test.ts`)
- [x] `buildReadingList` resolves specs, samples, and inputs to concrete file paths (`lib/agents/prompts.server.test.ts`)
- [x] Independent loading of learning/planning/working prompts (`lib/agents/prompts.server.test.ts`)

Not tested (by design — style/content, not app logic):

- Prompt file existence at runtime (verified by the build)
- Style conventions (imperative tone, trust-the-agent filter)
- 0-step/numbered-step/weighted-9s structure compliance

## Design Decisions

**Prompts implement specs, they don't duplicate them.** The behavioral specs are the source of truth. Prompts are the minimum effective instructions that produce the specified behavior. If a spec changes, update the prompt to match — but only the parts that need to be stated explicitly.

**Style from operational experience, not theory.** The 0-step/numbered-step/weighted-9s structure comes from Geoff's prompts, which were refined through actual agent loop runs. The patterns exist because they produce reliable behavior, not because they look clean.

**Learning prompt is intentionally minimal.** The original spike (see `specs/refs/learning-reference/`) showed that Opus with extended thinking produces excellent learning conversations with almost no behavioral instruction — just filesystem context and artifact definitions. The prompt tells Claude what exists and where things go, not how to have a conversation. Add behavioral constraints only when testing reveals a specific issue.

**No identity preamble in planning/working prompts.** These prompts state mode and context in one line, then jump to steps. No "You are Q, a warm and efficient..." — Q doesn't converse with the user in these modes, so personality doesn't apply.

**Plan.md as living document in Working.** The working agent updates plan.md each iteration — marking completed sessions and noting learnings. This replaces the old progress.txt mechanism. Future iterations orient from the updated plan rather than a separate progress file.

## Acceptance Criteria

- [x] Four prompt files exist: `prompts/learning.md`, `prompts/planning.md`, `prompts/working.md`, `prompts/drafting.md`
- [x] Planning and Working prompts use the 0-step/numbered-step/weighted-9s structure
- [x] Learning prompt uses plain markdown sections by default; 0-steps and weighted 9s added where testing revealed behavioral issues (session-start subagents, delegation discipline)
- [x] All paths are relative to `cwd` — template variables: `{{Q_PATH}}` (learning), `{{TASK_NAME}}` (planning/working), `{{STREAM_CONTEXT}}` (learning), `{{READING_LIST}}` (planning/working), `{{PLAYBOOK}}` (planning), `{{STREAM_NAME}}` (working), `{{TASK_CONTEXT}}` (learning, optional) (see "Template Variables" section)
- [x] Planning and working prompts include explicit subagent delegation instructions
- [ ] Every behavioral requirement traced to a spec is either covered in the prompt or deliberately omitted (with "trust the agent" justification)
- [x] Prompts are imperative in tone — commands, not explanations
- [x] Prompts are valid markdown, loadable at runtime
