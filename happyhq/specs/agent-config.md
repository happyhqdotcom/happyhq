# Agent Configuration

How Q's four modes are configured — models, tools, prompts, and permissions.

## Purpose

Define the configurations that power HappyHQ: Q in learning mode for interactive conversation, Q in discovery mode for pre-planning assessment, and Q in planning/working mode for autonomous work. Q operates in four modes — learning, discovery, planning, and working — with different prompts and orchestration for each. All modes use the same SDK (`@anthropic-ai/claude-agent-sdk`), configured differently for their distinct purposes.

This spec covers **what** each agent is configured to do — models, tools, permissions, prompt references, and how the pieces relate. **How** the working loop is orchestrated is defined in [Working](working.md). **How** data flows from files through the server to the client is defined in [Data Flow](data-flow.md).

## SDK

**Package**: `@anthropic-ai/claude-agent-sdk`

The Claude Agent SDK provides Claude Code's capabilities programmatically:

- Built-in tools for reading/writing files, running commands
- Multi-turn conversation support
- Streaming message delivery
- Structured output support

Configuration is built per-query via factory functions — fresh options each call because MCP server instances, abort controllers, and session IDs change per invocation. Each `query()` call is independent — there is no persistent SDK client.

## Four Mode Configurations

### General Mode

The default for all new chats. Conversational, lightweight, workspace-aware. No stream-specific context loading, no learning interview. See [Chat Modes](chat-modes.md) for the full mode system — how Q transitions between general and learning mode, the composer toggle, and system prompt injection mechanics.

**Purpose**: General-purpose Q interaction — answering questions, thinking through problems, helping manage tasks. When Q detects teaching intent, it suggests entering learning mode.

**Prompt**: `prompts/general.md` — minimal, workspace context injected via `{{WORKSPACE_CONTEXT}}`.

**Tools**: v1 is conversational only. Future versions add read-only workspace tools.

### Learning Mode

Powers the focused teaching experience (entered explicitly from general mode via user toggle or Q suggestion — see [Chat Modes](chat-modes.md)).

**Purpose**: Interactive interview-style conversations for stream setup, plan review, and feedback. Handles task fact-finding and creation — when the user wants a task done, Q checks the playbook and spec to understand what's needed, asks for what's missing, then calls CreateTask with rich textContext as the handoff to planning. Q never produces deliverables in learning mode.

**Characteristics**:

- Conversational and multi-turn
- Asks structured questions with options (rendered as clickable buttons), plus an "Other" option for free-form input. Falls back to open-ended prose for genuinely open-ended questions (e.g., "Describe your ideal SOW").
- Reads and writes stream-level files (playbook, specs)
- Fires subagents in parallel at session start — reading `.q/` playbook/specs, scanning stream `specs/` and `samples/`, and peeking at any files in the current chat's uploads (`.chats/{sessionId}/uploads/` — lightweight classification, not auto-processing; if eager extraction produced a `.raw.txt`, the subagent reads that instead of running pdftotext; see [Learning](learning.md) for file classification behavior). These reads are slow (samples especially); firing them early means Q has context by the time the user answers the first question. Q does not wait for subagent results before engaging the user — it acknowledges what the user shared and asks initial questions while subagents work in the background. Results are integrated as they return.
- Responds to user input in near-real-time
- Runs as a server-side process, streamed to the client. See [Data Flow](data-flow.md) for the `POST /api/chat` route contract and session management.

**Structured Question Format**: Q in learning mode uses the SDK's built-in `AskUserQuestion` tool to ask structured questions. This tool is handled via the SDK's `canUseTool` callback — the same mechanism used for permission requests. When Q calls `AskUserQuestion`, the SDK fires the `canUseTool` callback, which **pauses the query** until the host returns the user's answer. The flow:

1. Q calls `AskUserQuestion` → SDK fires `canUseTool("AskUserQuestion", input)`
2. The assistant message (with the `tool_use` block) has already streamed to the client
3. The `canUseTool` callback blocks, waiting for the user's answer via an in-memory pending-question store
4. Client renders interactive UI — clickable option buttons plus an auto-generated "Other" button for free-form input (see [Chat](chat.md))
5. User selects an option → client calls `POST /api/chat/answer` with `{ sessionId, answers }`
6. Server resolves the pending promise → `canUseTool` returns `{ behavior: 'allow', updatedInput: { questions, answers } }`
7. SDK continues within the **same** `query()` call — more events stream through the existing connection

This is the official Agent SDK pattern for interactive tools (see [SDK docs: Handle approvals and user input](https://platform.claude.com/docs/en/agent-sdk/user-input)). `AskUserQuestion` is **not** listed in `allowedTools` — it must trigger `canUseTool` to collect the user's answer. Adding it to `allowedTools` would auto-approve the tool without providing an answer, causing a permission denial.

`AskUserQuestion` input shape:

```typescript
{
  questions: [{
    question: string       // "Which of these best describes your SOW workflow?"
    header: string         // Short label, max 12 chars: "SOW workflow"
    options: [             // 2-4 options
      { label: string, description: string },
      { label: string, description: string },
      // ...
    ]
    multiSelect: boolean   // Allow multiple selections
  }]
}
```

Answer format (returned via `canUseTool`'s `updatedInput`):

```typescript
{
  questions: [...],  // Pass through original questions array
  answers: {
    "Which of these best describes your SOW workflow?": "Template-based"
    // Key = question text, value = selected option label (or free text for "Other")
    // For multiSelect: join multiple labels with ", "
  }
}
```

See [Chat](chat.md) for rendering details and [Data Flow](data-flow.md) for the `POST /api/chat/answer` endpoint.

For genuinely open-ended questions (e.g., "Describe your ideal SOW"), the agent asks in prose and the user types freely — this is a normal conversation turn, not an `AskUserQuestion` call.

**Task-aware learning**: The `learningAgentOptions` factory accepts an optional `taskSlug` parameter. When present, `learningPrompt()` injects a `{{TASK_CONTEXT}}` block into the system prompt — the active task slug and inputs path (`tasks/{task-slug}/inputs/`), plus boundary rules (Q can read/update task inputs and stream specs, but must never write to `plan.md`, `working/`, or `outputs/`). This is used when plan feedback opens a learning chat via the island (see [Planning](planning.md) "Give Q Feedback" flow). Without `taskSlug`, the `{{TASK_CONTEXT}}` placeholder is replaced with an empty string.

**Model**: Opus with adaptive thinking (`thinking: { type: 'adaptive' }`). The original spike (see `specs/refs/learning-reference/`) used Opus with extended thinking and produced excellent results with a minimal prompt. Q in learning mode mirrors this — context over process engineering.

**Tools available**:

- Read files (playbook, specs, samples, task inputs, working artifacts, outputs)
- Write files (playbook, specs — during teaching)
- List directory contents (to understand current state)
- Create directories per the structure defined in [Filesystem Layout](filesystem-layout.md)
- Bash (git commits after teaching/setup — see [Git Layer](git-layer.md))

**`ProcessSample` — custom tool.** Deterministic sample processing. Q calls `ProcessSample` with `{ fileName, type, name }` — the tool handles the full pipeline: validate file in root `.chats/{sessionId}/uploads/`, create `{stream}/samples/{type}/{name}/`, copy as `original.pdf`, read pre-extracted `.raw.txt` if it exists (from eager extraction on upload) or fall back to running `pdftotext -layout`, call Sonnet via SDK `query()` to reformat raw text into structured markdown, write `extracted.md`, clean up artifacts (including `.raw.txt`), and delete the original upload from `.chats/{sessionId}/uploads/` (the file now lives in the stream's `samples/`). Uses Sonnet (not Opus) for the reformatting step — mechanical text restructuring, not creative work. Q keeps responsibility for choosing type/name, writing INDEX.md, and announcing results.

**`CreateTask` — custom tool.** `CreateTask` is a custom tool defined in Q's system prompt, not a built-in SDK tool. Define it with a name, description, and input schema:

```typescript
// CreateTask tool input schema
{
  name: string        // Task name (human-readable, kebab-cased for directory)
  textContext: string  // Agent-synthesized context from the conversation (interim — see note)
  files: string[]     // Filename only, no path (e.g., "report.pdf")
}
```

`files` is an optional array of filenames (not paths) — the app resolves full paths from the current chat's uploads (root `.chats/{sessionId}/uploads/`). These are files the user dropped during chat that Q classified as task inputs (see [Learning](learning.md)). If empty or omitted, the task has text-only inputs. The tool schema must mark `files` as optional (or default to `[]`) so text-only task proposals don't fail MCP input validation.

When Q calls `CreateTask`, the tool call surfaces through the SDK async iterator as part of an `SDKAssistantMessage` — same as any other tool call. The client detects it by matching on the tool name and renders a "Start Task" card inline in the chat. **`CreateTask` is in `allowedTools`** — the SDK auto-approves it and the agent continues the conversation naturally without pausing. Multiple task proposals can appear in one conversation.

The MCP tool executes immediately and returns a tool_result. The client renders each `CreateTask` as an inline `StartTaskCard` with a "Start" button. The user starts tasks at their own pace — clicking "Start" calls `createTask()` + `setupTaskFromChat()` as server actions (creates `tasks/{slug}/task.md`, moves files from `uploads/` to `inputs/`, writes `inputs/context.md`), starts planning, and navigates to the Desktop. Tasks that have been started are tracked in the chat session's `startedTasks: string[]` array in `chat.json`, enabling correct card state rendering across reloads (started → "View Task", not started → "Start").

**Future direction:** `textContext` will be replaced with a transcript-based handoff. Instead of the learning agent summarizing the conversation, `setupTaskFromChat()` will write a clean chat transcript to `inputs/` and `CreateTask` will drop the `textContext` field entirely — just `{ name, files }`. See [Planning](planning.md) for details.

### Discovery Mode

Q assesses a task before planning — reads the task, evaluates whether it has enough context, asks structured questions if not, and enriches `task.md` with what it learns. Runs automatically as the first phase when the user clicks Start.

**Purpose**: Pre-planning assessment and clarification. Ensure Q has enough context to plan well. See [Discovery](discovery.md) for the full spec.

**Characteristics**:

- Single agent session (like learning, unlike the iterative working loop)
- Uses AskUserQuestion for structured Q&A (same blocking mechanism as learning mode)
- Reads the same material as planning: task inputs, playbook, specs, samples
- Writes `## Discovery` section to `task.md` with synthesized context
- Auto-transitions to planning when complete

**Model**: Sonnet with adaptive thinking. Configurable via `config.models.discovery`.

**Budget**: `config.limits.discoveryBudgetUsd` — default low. Discovery should be fast and cheap.

**Tools available**:

- Read files (task inputs, playbook, specs, samples)
- Write (update `task.md` with `## Discovery` section)
- Glob, Grep (explore stream content)
- WebFetch, WebSearch (research context if needed)
- Bash (git, ls only)
- AskUserQuestion (via `canUseTool` — not in `allowedTools`)

**`canUseTool` callback**: Same pattern as learning mode's AskUserQuestion handling, with one addition: sets `pending: clarification` on `task.md` before blocking, clears it after the user answers. This drives the "needs clarification" indicator in the task list.

**Prompt**: `prompts/discovery.md` — tuned for speed and judgment. Bias toward proceeding. 1–3 focused questions max.

### Planning and Working Modes

Q does all the actual work in these modes. Two modes with different prompts and orchestration.

#### Planning Mode

**Purpose**: Read task inputs and stream knowledge, produce a step-by-step `plan.md`.

**Characteristics**:

- Single invocation: reads everything, writes `plan.md`, exits
- Triggered as part of the "Start Task" action — the app creates the task directory, starts planning, and opens the task in one flow (see [Planning](planning.md))
- No conversation with user — pure analysis and output, reads file state cold

**Prompt**: `prompts/planning.md`

**Inputs**:

- Task inputs (files + text context from `inputs/`)
- Stream playbook (`playbook.md`)
- Stream specs (`specs/`)
- Stream samples (`samples/`) — for reference on what "good" looks like

**Output**: `plan.md` at the task root — a working plan for this specific task. Format adapts to the task (see [Planning](planning.md)). Planning completion is detected by the appearance of `plan.md` on disk — not by the ★ marker, which is working-mode only (see [Working](working.md)).

#### Working Mode

**Purpose**: Autonomous step-by-step task execution. Works through an approved plan, one step per iteration.

**Characteristics**:

- Loop: each iteration is a fresh agent (no accumulated context)
- Reads plan, picks next step, does the work, writes output, exits
- Runs server-side, progress streamed to client for the sidebar

**Prompt**: `prompts/working.md`

#### Shared Planning/Working Configuration

**Model**: Opus as orchestrator for both modes. Q spawns **subagents** via the SDK's built-in Task tool for bulk work:

- Reading and scanning files (playbook, specs, samples, inputs, working artifacts)
- Comparing outputs against specs/samples
- Repetitive content generation within a step

Opus handles: task/step selection, synthesis of subagent findings, quality judgment, final decisions, writing key outputs. The SDK provides native subagent types (Explore, Plan, general-purpose) with appropriate model defaults — no custom subagent configuration needed. This follows Geoff's pattern — bulk tokens through cheap subagents, thin Opus reasoning layer on top.

**Tools available** (both modes):

- Read files (plan, inputs, playbook, specs, samples, existing working artifacts)
- Write files (working artifacts, outputs, plan.md)
- Bash (git commits after each step — see [Git Layer](git-layer.md))

### Planning Handoff

**Planning is triggered by "Start Task" — no handoff between modes.** Learning mode and planning/working mode are completely independent invocations:

1. User says "let's do this task" (via the task composer — see [Planning](planning.md))
2. Q in learning mode emits a `CreateTask` tool call. `CreateTask` is in `allowedTools`, so the SDK auto-approves it — the agent continues the conversation naturally without pausing. The client renders the tool call as an inline "Start Task" card. Multiple `CreateTask` calls can appear in one conversation.
3. User clicks the "Start Task" card when ready. The client executes `createTask()` + `setupTaskFromChat()` from `lib/actions.ts` (server actions) to create the task directory and move files (see [Filesystem Layout](filesystem-layout.md)), starts Q in planning mode (`POST /api/run/start` with `mode: 'planning'`), and navigates to the Desktop.
4. Learning mode conversation may still be active — the agent doesn't pause for task creation.
5. Q reads inputs cold, writes `plan.md`, exits
6. `plan.md` auto-opens as a Desktop window (SWR detects it)
7. User reviews the plan. Plan approval prompt replaces the island.
8. User clicks "Approve" to start working. If the user doesn't like the plan, they can give feedback via the sidebar, teach Q, and restart (re-enters planning with updated context).

The filesystem is the handoff mechanism — Q in learning mode writes inputs to disk, Q in planning mode reads them. No orchestration, no shared state, no complexity. The Desktop renders whatever state the filesystem is in (see [Desktop](desktop.md)).

## Prompts

Each mode has its own prompt file. Planning and working each have their own. Prompts live at `prompts/` in the app root — peer to `specs/`, loaded at runtime directly. **Drafting prompts is a separate deliverable** — inspired by the Ralph Wiggum methodology, adapted for Q's specific roles. This spec describes what each prompt must accomplish; the actual prompt content lives in the prompt files, not here.

```
prompts/
  general.md        # Q general mode system prompt (default)
  learning.md       # Q learning mode system prompt
  planning.md       # Q planning mode prompt
  working.md         # Q working mode prompt
  drafting.md           # Drafting agent system prompt
```

**`prompts/general.md`** — Minimal workspace-aware prompt. Q is a helpful collaborator, not in teaching mode. Knows about streams and tasks at a high level. Aware that learning mode exists and when to suggest it. See [Chat Modes](chat-modes.md).

**`prompts/learning.md`** — Q's persona and tone. Interview technique: when to use structured questions vs. open-ended prose. How to delegate playbook/spec writing to Drafting. How to gather task context and create task directories. Cross-references to stream structure and available files.

**`prompts/drafting.md`** — Quality production instructions for the Drafting agent. How to read a spec, use samples as reference, use the brief as source of truth, and validate output against acceptance criteria. No interview instructions — just production. Approximately 18 lines.

**`prompts/planning.md`** — Read a generated reading list (specs, samples, inputs), write plan.md with session breakdown. Plan format adapts to the task. Playbook injected directly. Flags choices for the user.

**`prompts/working.md`** — The Ralph Wiggum methodology: read a generated reading list + plan.md, follow the plan, do one session well, review against specs, update plan.md with findings, commit, exit. Plan.md is the living coordination document — progress and learnings are recorded there, not in a separate file.

## Tool Configuration

Tools are defined per mode. The SDK provides built-in file tools; we configure which directories each mode can access:

- **Learning mode**: Stream-level files (read/write). Cannot write to task working/outputs directories.
- **Planning mode**: Full task directory (read) + stream-level files (read). Writes only `plan.md`.
- **Working mode**: Full task directory (read/write) + stream-level files (read-only). Working observations stay in working artifacts; the user teaches Q to update specs after the run.

## Environment

- `ANTHROPIC_API_KEY` — One way to authenticate with the SDK. The Agent SDK uses the Claude Code CLI under the hood, so a logged-in CLI session works without an explicit API key. Auth is resolved reactively on first agent call via `lib/agents/auth.server.ts` — env var, stored key, or CLI OAuth. Never exposed to the client.
- Model IDs and subagent models configured in code via the SDK's `agents` option (see SDK Configuration)

## SDK Configuration

### Initialization

Each `query()` call is independent — it spawns a new Claude Code subprocess, runs the agent, and returns results via an async generator. There is no persistent SDK client object. Configuration is built per-query via factory functions (`learningAgentOptions`, `planningAgentOptions`, `workingAgentOptions` in `lib/agents/config.server.ts`) — fresh options each call because MCP server instances capture closures (e.g., `streamName`), abort controllers change per call, and session IDs are unique. Key options set per mode:

- `model` — Short name mapped via `MODEL_IDS` constant in `lib/constants.ts` (e.g., `'opus'` for all modes). Full model ID strings resolved at the constant level, updated in one place when new models drop.
- `thinking` — Controls extended thinking behavior. All three modes use `{ type: 'adaptive' }` — Claude decides when and how much to think. Learning mode benefits from adaptive thinking for natural conversation and synthesis. Planning needs it for one-shot plan synthesis from cold file reads. Working needs it for file-state reasoning and step selection.
- `allowedTools` / `disallowedTools` — Tool scoping per mode
- `cwd` — Working directory for file tools, set to `~/HappyHQ/` (workspace root) for all modes. Stream knowledge and task files are both accessible via workspace-relative paths. No symlinks (see [Filesystem Layout](filesystem-layout.md)).
- `permissionMode` — `'acceptEdits'` for all modes. Learning mode write restrictions (cannot write to task working/outputs directories) are enforced via prompt — the prompt scopes work to `playbook.md`, `specs/`, `samples/`
- `allowedTools` — All modes include `'Bash(git:*)'` and `'Bash(ls:*)'` to auto-approve git commands and directory listing alongside `acceptEdits` for file operations. All modes include `'Read'`, `'Glob'`, `'Grep'` for direct file access. Learning and working modes additionally include `'Task'` for subagent delegation — learning mode gained Read/Glob/Grep/Task to simplify prompt context (direct reads over mandatory subagent delegation). Planning mode omits `'Task'` — a single invocation that reads and writes plan.md, delegation not needed. Learning mode additionally includes `mcp__q__ProcessSample`, `mcp__q__CreateTask`, and `'Bash(pdftotext:*)'`. **`AskUserQuestion` is not in `allowedTools`** — it's handled via `canUseTool` to block until the user responds (see Structured Question Format above). **`CreateTask` is in `allowedTools`** — it's auto-approved so the agent can propose tasks without pausing the conversation (see CreateTask above).
- `disallowedTools` — All three modes include `['EnterPlanMode', 'ExitPlanMode']` to prevent agents from switching the SDK's plan mode, which would cause runaway loops in automated contexts.
- `canUseTool` — Learning mode provides a `canUseTool` callback that handles two cases: (1) `AskUserQuestion` — blocks on a pending-question promise and returns the user's answer, and (2) **all other unapproved tools** — sends a `pending_confirmation` event to the client via `notifyClient`, blocks on the pending-confirmations store until the user clicks Allow or Deny in the `AskUserConfirmation` card. Both cases race against the abort signal. See [Data Flow](data-flow.md) for the server-side wiring
- `hooks` — All three modes configure a `PostToolUse` hook that fires after `Write` and `Edit` tool calls complete. **Learning mode** sends a `stream_content_changed` event via `notifyClient` through the chat NDJSON stream — the client's chat store receives it and calls `mutate(streamContentKey)` to revalidate stream content SWR. **Planning and working modes** send a `task_content_changed` event via `notifyClient` through the run activity NDJSON stream (`GET /api/run/stream`) using `broadcast()` — the client's `useRunActivity` hook receives it and triggers `mutateTask()` to revalidate task content SWR. This is the general pattern for server→client cache invalidation: add a `PostToolUse` hook for the relevant tools, send an event via `notifyClient`, handle it in the client's event loop.
- `abortController` — Passed to all `query()` calls (learning, planning, working). The app calls `abortController.abort()` when the user clicks Stop — this terminates the current query immediately. In learning mode, active sessions are tracked via `lib/chat/active-sessions.ts` (module-level `Map<string, AbortController>`) and stopped via `POST /api/chat/stop` with `{ sessionId }`.
- `maxBudgetUsd` — Cost safety net per `query()` call. Set a reasonable cap to prevent runaway costs on stuck iterations.
- `includePartialMessages` — `true` for all three modes. Learning mode uses it for streaming text to the client. Planning and working modes use it to power the dynamic island's live activity tracking — partial JSON from tool calls is parsed for early detail extraction (file paths, patterns, line counts) before tools complete (see [Island](island.md))
- The SDK's built-in subagent types (Explore, Plan, general-purpose) are available natively via the Task tool. The SDK also supports custom agent definitions via the `agents` option — Q uses this for the Drafting agent (see Custom Agents below)
- `settingSources` — `[]` for all modes (SDK isolation mode — prevents user-level `~/.claude/settings.json` from affecting agent behavior)

### Subagents

All modes rely on the SDK's **native subagent types** — no custom subagent configuration needed. The SDK provides:

- **Explore** (Haiku) — fast, read-only file research (Read, Glob, Grep). Ideal for bulk file scanning.
- **Plan** — codebase research during planning.
- **general-purpose** — complex multi-step tasks with all tools.

**Subagents inherit all parent tools by default.** Unless explicitly restricted via the `tools` array on the agent definition, subagents have access to every tool the parent has — including custom MCP tools like `ProcessSample` and `CreateTask`. This means sample processing can run inside a subagent, enabling truly parallel processing alongside other session-start reads. When multiple samples are confirmed by the user, Q fires parallel subagents — each calling ProcessSample independently — to process all samples concurrently rather than sequentially (see experiment S3 in [Q Optimization](q-optimization.md)).

Learning mode fires multiple reads in parallel at session start — this is a performance-critical pattern, not optional delegation. The learning prompt uses a mandatory preamble to ensure Q fires all reads before its first text response: (1) read Q's own playbook and specs from `.q/` directly via Glob + Read (these are small reference files — no subagent needed), (2) peek at any files in the current chat's uploads (`.chats/{sessionId}/uploads/`) via a Sonnet subagent (lightweight classification — list and extract first page, read `.raw.txt` if available from eager extraction, don't call ProcessSample yet; see [Learning](learning.md) for file classification behavior), (3) scan the stream's `specs/` and `samples/` via Sonnet subagents. All preamble tool calls fire in ONE assistant message before any text response. Samples reads are especially slow; firing them before the first user interaction means Q has context by the time it needs it. Q begins engaging the user immediately — it does not wait for all subagents to complete. Outside of session start, subagents are used for any operation that reads 3+ files. Opus stays on the main thread for interviewing, synthesis, writing playbook/specs, and quality judgment.

Planning/working modes use subagents for bulk file reading and content generation. The SDK handles subagent lifecycle, model selection, and handoff natively. The built-in types (Explore, Plan, general-purpose) cover delegation needs. For spec-driven production work that benefits from context isolation, use custom agents via the `agents` option (see Custom Agents below).

### Custom Agents vs MCP Tools

The SDK provides two extension points: **custom agents** (via the `agents` option) and **MCP tools** (via `mcpServers` or `createSdkMcpServer`). They serve different purposes.

**Use an MCP tool when:**

- The work is deterministic — given inputs, you know what to do
- You're bridging to an external system (database, API, file pipeline)
- It's a single operation, not multi-step reasoning
- You want your code to run, not the LLM

Examples: `ProcessSample` (extracts and reformats PDFs), `CreateTask` (creates task directory structure).

**Use a custom agent when:**

- The work requires judgment — reading, synthesizing, writing
- You need context isolation (fresh window, no pollution from parent conversation)
- You want a specialized system prompt that shapes how the agent approaches the work
- You want a different model for cost or capability reasons
- The sub-task is multi-step and open-ended

Rule of thumb: if you're writing the logic, it's a tool. If you want the LLM to figure it out with different constraints, it's an agent.

### Custom Agents

Custom agents are defined via the `agents` option on `query()`. Each agent gets an `AgentDefinition` with: `description` (when to use), `prompt` (system prompt), `tools` (allowed tools — inherits parent if omitted), `disallowedTools`, `model` (sonnet/opus/haiku/inherit), `mcpServers`, and `maxTurns`. The model invokes custom agents via the Task tool's `subagent_type` field (a free-form string), the same way it invokes built-in types like Explore or Plan.

#### Drafting

Spec-driven production agent. Takes a spec, samples, and synthesized inputs; produces a high-quality artifact in a fresh context. Named to sit alongside Explore (understand) and Plan (design) — Drafting (produce to standard).

**Why it exists.** Context isolation. During Learning mode, the interview fills the context window. By the time Opus needs to write playbooks/specs, the quality standards from `.q/specs/playbook.md` and `.q/specs/spec.md` are diluted by turns of back-and-forth. Drafting starts fresh with the quality standards as its primary instruction.

**The pattern.** Spec + samples + inputs → quality output. The spec defines "good." The agent produces to that standard. The inputs change, the spec changes, but the muscle is the same.

**The recursive insight.** Q uses the same spec → Drafting → artifact → validation pattern at two levels: (1) Q's own quality — `.q/specs/playbook.md` and `.q/specs/spec.md` govern how Q writes playbooks and specs for the user's stream, and (2) user deliverables — stream specs govern how Q writes the user's actual work outputs. Q bootstraps its own quality by eating its own cooking. The spec is the product at both levels; Drafting is the generic muscle.

**Agent definition:**

- `prompt` (on the AgentDefinition): Quality production instructions — how to read a spec, how to use samples as reference, how to validate output against acceptance criteria. No interview instructions, no question-asking — just production. Lives at `prompts/drafting.md`.
- `model`: `opus` (quality-critical writing)
- `tools`: Read, Glob, Grep, Write (reads specs/samples, writes the finished artifact directly)
- `maxTurns`: 10 (prevents runaway behavior — expected flow is Glob samples, Read spec, Read each sample, produce output, Write artifact)

**What Drafting receives via the Task tool's `prompt` field:**

- A synthesized brief — the distilled interview findings relevant to this specific output, not a dump of the full conversation
- File paths to the target spec (e.g., `specs/playbook.md`) and samples directory (e.g., `samples/specs/...`) — Drafting reads these itself with its tools, they're not pasted into the prompt

**What Drafting does NOT receive:** raw interview transcripts, full conversation history, or file contents inlined into the prompt. Opus does the judgment work of filtering what's relevant; Drafting reads specs and samples fresh in its own context with full attention.

**Flow:**

1. Opus already has the quality standards in context (injected into the learning prompt) — it knows what inputs and criteria the spec requires without a tool call
2. Opus synthesizes the interview findings through the lens of that spec, pulling only what's relevant to the spec's requirements (spec-aware synthesis, not a generic dump)
3. Opus spawns Drafting with the spec-aware brief + file paths
4. Drafting reads the spec and samples, produces the output, self-verifies against the spec's acceptance criteria
5. Drafting writes the artifact to the target path using the Write tool
6. Opus gut-checks: does the written file capture what the user actually said during the interview?
7. If good, Opus commits. If not, Opus revises the file directly.

**Agent boundary rule of thumb:** if verification needs the same context as production (the spec, the samples), keep it in the same agent. If it needs different context (the interview history), it belongs in the parent. Don't add agents when the work fits naturally in an existing context.

**Where it's used:**

- Learning mode: playbook and spec drafting (replaces inline writing by Opus)
- Working mode: final deliverable production

### Tool Permissions

When Q tries to use a tool that isn't in `allowedTools`, the `canUseTool` callback handles it. The callback surfaces an `AskUserConfirmation` card to the user and blocks until they decide, using the same `canUseTool` mechanism as `AskUserQuestion`:

1. Q calls an unapproved tool → SDK fires `canUseTool(toolName, input)`
2. `canUseTool` callback sends a `pending_confirmation` event (including the SDK's `toolUseID`) to the client via `notifyClient`, then blocks on `waitForConfirmation(toolUseID)` from `lib/chat/pending-confirmations.ts` — raced against the abort signal
3. Client renders an `AskUserConfirmation` card showing what Q wants to do (tool name + action summary + Allow/Deny buttons) — same composer-replacement pattern as `QuestionOptions` (see [Chat](chat.md))
4. User decides → client calls `POST /api/chat/answer` with `{ sessionId, toolUseId, allow: true }` or `{ sessionId, toolUseId, deny: true }`
5. Server resolves the promise via `allowConfirmation(toolUseId)` or `denyConfirmation(toolUseId)` → `canUseTool` returns `{ behavior: 'allow' }` or `{ behavior: 'deny', message: 'User denied tool' }`

The pending-confirmations store (`lib/chat/pending-confirmations.ts`) is separate from pending-questions but uses the same answer endpoint. **Keyed by `toolUseId`** (not `sessionId`) so multiple blocking tools in the same assistant turn each get their own slot — the SDK can fire parallel tool calls within a single message, and keying by `sessionId` would clobber earlier entries. Confirmations always resolve (true/false) — rejection is reserved for abort signals. See [Chat](chat.md) for the `AskUserConfirmation` design.

**Scope:** The interactive `canUseTool` flow (blocking on user confirmation) is learning mode only. Planning and working modes use `automatedCanUseTool` — a deterministic callback that auto-approves safe Bash commands (via `isSafeBashCommand()` from `lib/agents/bash-safety.server.ts`) and immediately denies everything else. No user prompt, no blocking. This ensures automated agents can run git, ls, cat, and other safe commands without interruption while preventing unexpected tool usage.

## Design Decisions

**One agent (Q), three modes.** Follows Geoff's pattern — `PROMPT_plan.md` and `PROMPT_build.md` are different instructions for the same runner. The mode determines the prompt and orchestration pattern (single invocation vs. loop). Learning and working are fundamentally different interaction patterns (conversational vs. autonomous), which justifies different configurations. But planning and working are the same mode family doing different jobs — same tools, same model, different instructions.

**Opus for reasoning, Sonnet subagents for bulk work.** Q uses Opus in all modes for synthesis, quality judgment, and user interaction. All modes use adaptive thinking (`{ type: 'adaptive' }`) — the original spike showed that Opus with extended thinking naturally interviews well in learning mode, and planning/working benefit from adaptive thinking for complex one-shot synthesis and file-state decisions. All modes delegate bulk file reading to Sonnet subagents via the Task tool — same pattern as `PROMPT_build.md` ("up to 500 parallel Sonnet subagents"). This keeps Opus costs down and parallelizes reads. Learning mode also offloads sample extraction reformatting to Sonnet via the `ProcessSample` MCP tool (which subagents can invoke since they inherit parent tools).

**All modes read files on demand via tools, not preloaded into context.** A stream with a detailed playbook, five specs, three samples, and large PDF inputs could blow the context window. Q in learning mode, Q in planning mode, Q in working mode — all read what they need, when they need it. This is especially important for samples and task inputs, which may be large PDFs.

**Planning is triggered by "Start Task", not by Q.** Q in learning mode emits a `CreateTask` tool call — a user-confirmed action using the same `canUseTool` blocking pattern as `AskUserQuestion`. The SDK pauses, the client renders a "Start Task" card with a "Skip" option, and the user decides. Clicking "Start Task" resolves the confirmation, executes the task creation as a server action, kicks off Q in planning mode, and navigates to the Desktop. Clicking "Skip" denies the confirmation and lets Q continue. No coordination between modes, no "Create Plan" button — the user's intent is expressed by clicking "Start Task" in chat.

**Tool permissions scoped per mode.** Q in learning mode should never write to task working directories; Q in planning/working mode should never modify stream-level specs. In planning mode, Q writes only `plan.md`. Principle of least privilege prevents accidents and keeps each mode focused.

**Prompts live in `prompts/`, not in specs or lib.** Prompts are their own concern — they change at a different rate than agent configuration or server wiring. They're loaded at runtime directly, not duplicated. Peer to `specs/` in the project structure.

**Agent SDK native streaming, no Vercel AI SDK.** The Agent SDK's `query()` function returns an `AsyncGenerator<SDKMessage>` that yields typed messages as the agent works — text chunks (via `includePartialMessages`), complete assistant messages, tool progress, status updates, and a final result. This maps directly to a Next.js streaming response: the route handler iterates the generator and pipes relevant events to the client. Vercel's AI SDK (`useChat` + `streamText`) was considered but rejected: it's designed for standard text chat and would fight Q's interaction patterns (structured questions via `AskUserQuestion`, planning handoffs, approval flows). The client-side message state that `useChat` provides is trivial to build with Zustand. The Agent SDK is the complete solution — streaming, tool execution, session management — with no translation layer needed.

## Server Wiring

For server wiring — API routes, streaming, and session management — see [Data Flow](data-flow.md).

## Acceptance Criteria

- [x] Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) is installed and configured
- [x] Q in learning mode handles multi-turn conversation with streaming responses
- [ ] Q in learning mode reads/writes stream-level files (playbook, specs) _(agent behavior — depends on prompt quality, not client code)_
- [x] Q in learning mode handles `AskUserQuestion` via `canUseTool` callback — blocks on pending-question store, returns answer from `POST /api/chat/answer`
- [x] Q in learning mode handles unapproved tools via `canUseTool` — surfaces `AskUserConfirmation` to user, blocks until allow/deny, same pending store and answer endpoint as AskUserQuestion
- [x] Q runs in planning mode: single Opus invocation that writes `plan.md`
- [x] Q runs in working mode: loop of fresh Opus instances executing one step each
- [x] All modes use the SDK's native subagent types (Explore, Plan, general-purpose) for delegation; learning mode additionally uses custom agents (Drafting) via the `agents` option for spec-driven production
- [x] Planning mode is triggered as part of the "Start Task" action (no "Create Plan" button in Desktop)
- [x] Working mode reads plan, inputs, and stream content each iteration via generated reading list
- [x] Working mode writes to working/, updates plan.md with findings
- [x] All four prompt files exist: `prompts/learning.md`, `prompts/planning.md`, `prompts/working.md`, `prompts/drafting.md`
- [x] Tool configuration limits directory access per mode
- [x] Auth resolved reactively on first agent call (env var, stored key, or CLI OAuth via `lib/agents/auth.server.ts`); never exposed to client-side code
- [x] SDK configuration built per-query via factory functions (fresh options each call — required for closures, abort controllers, session IDs)
- [x] Planning/working modes use `abortController` for immediate stop and `maxBudgetUsd` as cost safety net
- [x] All modes include exploration tools (Read, Glob, Grep) and git bash commands (`Bash(git:*)`); learning and working additionally include Task for subagent delegation
- [x] Model IDs centralized in `MODEL_IDS` constant in `lib/constants.ts`
- [x] Q fires parallel subagents at session start — reading `.q/`, scanning stream context, peeking at uploads — before engaging the user _(prompt compliance — depends on learning prompt structure)_
- [ ] Q reads `.q/` playbook and specs every session, applying quality standards to everything it writes _(prompt compliance)_
- [x] Sample processing can run inside a subagent (subagents inherit MCP tools including ProcessSample by default)
- [x] ProcessSample deletes the original upload from `.chats/{sessionId}/uploads/` after successful processing into `samples/`

## Testing

Agent mode factories (`lib/agents/config.server.ts`):

- [x] `learningAgentOptions`: Opus model, adaptive thinking, acceptEdits, MCP server, allowedTools, env override (`lib/agents/config.server.test.ts`)
- [x] `planningAgentOptions`: Opus model, workspace root cwd, budget, exploration tools + git bash, no MCP, env override (`lib/agents/config.server.test.ts`)
- [x] `workingAgentOptions`: Opus model, workspace root cwd, exploration tools + git bash, budget, settings isolation, env override (`lib/agents/config.server.test.ts`)

Custom MCP tools (`lib/agents/tools.server.ts`):

- [x] `createQsMcpServer` creates fresh instance per call (`lib/agents/tools.server.test.ts`)
- [x] `ProcessSample` validates PDF-only, checks file existence, case-insensitive extension (`lib/agents/tools.server.test.ts`)
- [x] `CreateTask` returns result message format (`lib/agents/tools.server.test.ts`)

Auth resolution (`lib/agents/auth.server.ts`):

- [x] `getAuthEnv` resolves env var → stored OAuth → stored key → undefined (`lib/agents/auth.server.test.ts`)
- [x] `storeApiKey`, `clearApiKey` read/write config.json (`lib/agents/auth.server.test.ts`)
- [x] `checkAuthStatus` detects all methods including CLI fallback (`lib/agents/auth.server.test.ts`)
- [x] `isAuthError` matches 401, unauthorized, invalid key patterns (`lib/agents/auth.server.test.ts`)

Bash safety (`lib/agents/bash-safety.server.ts`):

- [x] Whitelist: git, ls, cd, cat, echo, printf, tr, etc. (`lib/agents/bash-safety.server.test.ts`)
- [x] Rejects dangerous commands: npm, rm, chmod (`lib/agents/bash-safety.server.test.ts`)
- [x] Handles chained commands (&&, ||, ;), rejects command substitution (`lib/agents/bash-safety.server.test.ts`)

Stderr buffer (`lib/agents/stderr-buffer.server.ts`):

- [x] Line buffering with max capacity, eviction, partial line handling (`lib/agents/stderr-buffer.server.test.ts`)

- [x] `canUseTool` callback: AskUserQuestion branch blocks on pending-question store and returns answer via updatedInput (`lib/agents/config.server.test.ts`)
- [x] `canUseTool` callback: default branch sends pending_confirmation event and blocks on waitForConfirmation (`lib/agents/config.server.test.ts`)
- [x] `canUseTool` callback: all branches race against abort signal (`lib/agents/config.server.test.ts`)

Not tested:

- Subagent configuration and Drafting agent definition shape (low risk — static config)
- `resume` session option interaction with session IDs (SDK-level behavior)

## Edge Cases

- **No valid credentials**: Auth is resolved on first agent call — if no API key, stored key, or CLI OAuth session is available, show a clear error. The Agent SDK uses the Claude Code CLI under the hood, so a logged-in CLI session works without an explicit API key.
- **Agent produces unexpected output**: Log the response. Show a generic error in the UI. Don't crash.
- **Planning mode fails**: Task sidebar shows error message. The user can give Q more context via the sidebar. Don't silently retry.
- **Large input files (PDFs, long documents)**: All modes read files on demand via tools, not preloaded into context. Prompts instruct Q to extract what it needs rather than loading everything. If a file exceeds tool limits, Q should note what it couldn't read and proceed with what it has.

## Constraints

- **One mode at a time (M1).** When Q is running in planning or working mode, learning mode is unavailable. The chat composer shows "Q is working on [task name]..." — a gentle redirect, not a hard lock-out. The user can stop the current run from the Desktop to free Q for conversation. See [Chat](chat.md) for the busy state. This constraint can be relaxed in a future milestone if users want to teach while tasks run.
- Chat sessions are persistent — the SDK session ID is the chat identity and survives page refresh (see [Filesystem Layout](filesystem-layout.md) for `.chats/` directory structure).
- File access is limited to `~/HappyHQ/` and the stream/task directories (see [Filesystem Layout](filesystem-layout.md)).
