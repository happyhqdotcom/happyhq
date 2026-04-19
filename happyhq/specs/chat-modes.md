# Chat Modes

How Q adapts its behavior between general conversation and focused learning.

## Purpose

Define Q's two operating modes — general and learning — and how it transitions between them. Previously, every chat was a learning chat: Q always loaded stream context, ran the teaching interview, and classified information. This worked when streams were the primary entry point, but with top-level chats and the task-first redesign, users interact with Q for many reasons that aren't teaching: asking questions, thinking through problems, managing tasks, or just talking.

This spec owns the mode system: what each mode does, how transitions work, how the composer toggle and Q-initiated transitions interact, and how prompt injection works. It does not own the content of each mode's instructions — [Learning](learning.md) owns learning behavior, and the base prompt is defined separately.

**Prompt refactoring note**: The existing `prompts/learning.md` is currently a standalone system prompt that includes Q's identity ("You're Q. Your job is to learn..."). With the mode system, Q's identity moves to the base prompt (`general.md`), and `learning.md` becomes an additive layer — just the learning-specific instructions (classification, interview, artifacts, stream context, tools). The identity preamble is removed from `learning.md` since it's already in the base. The draft additive version lives at `prompts/learning-layer.md` during development — it replaces `learning.md` when the mode system ships.

## Two Modes

### General Mode (default)

Q is a helpful collaborator. Conversational, lightweight, no forced structure. This is the default for every new chat — top-level and desktop.

**System prompt**: `prompts/general.md` is the base system prompt. It defines Q's identity and is always present regardless of mode. No pre-injected workspace summaries — Q has tools and can go look at the filesystem when it needs to. No classification system, no interview structure, no samples-first approach. Q just helps.

**Tools**: All tools are always available regardless of mode. The prompt guides behavior, not tool restrictions. This matches Claude Code, which gives all tools in every mode. Q in general mode won't call ProcessSample unprompted — it doesn't need to be removed.

**When Q is in general mode**, it behaves like a knowledgeable collaborator who knows about the user's streams and tasks at a high level. "How many pages should this be?" — Q answers from the stream summary in its context. "What's on my plate this week?" — Q lists active tasks. "Help me think about whether to split this into two streams" — Q discusses it conversationally.

### Learning Mode

The focused teaching experience. Everything that makes Q's learning great today: interview-driven, samples-first, classification system (playbook / spec / sample / task input), propose-and-confirm, Drafting subagent, quality specs at `.q/`. This is the existing behavior from [Learning](learning.md).

**System prompt**: The base prompt (`general.md`) stays. Learning instructions are injected as an additive layer on each turn while learning mode is active — like Claude Code injects plan mode instructions via system reminders. The learning layer contains the classification system, interview guidelines, artifact rules, stream context, and tool instructions from `prompts/learning.md`. Q's identity doesn't change between modes; learning mode adds focus and capabilities on top of it.

**Tools**: Same tools as general mode — all always available. The learning layer's prompt guides Q to use the learning-specific tools (ProcessSample, CreateTask, AskUserQuestion, Drafting subagent) when appropriate.

**When Q is in learning mode**, it behaves like today's teaching chat. It reads existing artifacts, asks structured questions, classifies information, proposes where things go, delegates to Drafting for playbooks and specs, and commits to git.

## Mode Transitions

Learning mode requires a stream. General mode does not. Transitions always involve identifying or attaching a stream.

### Entering Learning Mode

Two paths — Q-initiated and user-initiated. Both result in the same state: learning prompt in the system prompt, stream context loaded, full tool access.

**Q-initiated:** Q detects teaching intent and enters learning mode directly. No suggestion, no confirmation. Examples:

- "We need to update how we handle different session lengths" — process change, clearly teaching
- "Here's how our team does quarterly reports" + file drop — sharing knowledge
- "The spec is wrong about headers, they should be H2" — correction, needs to update spec

When Q detects this, it identifies the relevant stream (from workspace context or by asking) and enters learning mode. If the stream is obvious (user is on a desktop with stream context, or only one stream exists), Q proceeds directly. If ambiguous, Q asks which stream, then enters learning mode.

**User-initiated:** Hard toggle in the composer, like Claude Code's plan mode toggle. User clicks it → if no stream is attached, they select or create one → learning layer injected on the next message.

### Exiting Learning Mode

**Q-initiated:** Q calls `ExitLearningMode` when the teaching interaction is naturally complete — artifacts are committed, the user's questions are addressed, there's nothing more to classify.

**User-initiated:** Toggle in the composer switches back to general. Immediate — learning layer stops being injected on the next message.

### Mechanism: Base Prompt + Additive Layer

The system prompt is Q's identity. It doesn't change between modes. Mode-specific instructions are injected as an additive layer on top of the base prompt, the same way Claude Code injects plan mode instructions via system reminders rather than swapping the system prompt.

**Why additive, not swap.** Claude Code uses the same Agent SDK and could change the system prompt between `query()` calls. It chooses not to. Reasons:

- The system prompt is identity, not mode. Q is Q regardless of mode.
- Additive layers compose. Multiple concerns can coexist (learning instructions + stream context + task context) without duplicating the base prompt in every mode's prompt file.
- Swapping means the learning prompt would need to duplicate everything from the general prompt. Additive means it only carries learning-specific instructions.

**Three layers of reinforcement:**

1. **Tool result** — when Q calls `EnterLearningMode`, the tool result returns a confirmation plus a summary of what's now available (stream name, artifact state). This gives Q immediate context for the rest of the current turn.
2. **Additive injection on every turn** — while learning mode is active, the server injects the learning instructions + stream context alongside each `query()` call. Refreshed every turn so they never fade. This is the persistence layer.
3. **Base system prompt** — Q's identity in `general.md`. Always present. Never changes.

**On exit**, the additive layer is removed. Next turn gets only the base prompt. Clean transition back to general mode.

**Implementation**: The chat session stores a `mode` flag (`'general' | 'learning'`) and an optional `streamSlug` in `chat.json`. The API route reads these when composing the `query()` call:

- `options.systemPrompt` is always the base prompt (`general.md`). Never changes between modes.
- When learning mode is active, the learning instructions + stream context are prepended to the user message as a `<system-reminder>` block — the same mechanism Claude Code uses for plan mode instructions. The model treats these as system-level instructions.

```typescript
// Chat API route — prompt composition
const learningLayer =
  mode === 'learning'
    ? `<system-reminder>\n${learningInstructions}\n</system-reminder>\n`
    : ''

const sdkQuery = query({
  prompt: learningLayer + userMessage,
  options, // systemPrompt is always general.md
})
```

On every turn while learning mode is active, the learning layer is prepended. When mode exits, it stops. The base system prompt never changes.

**Persistence**: The SDK journal persists the full prompt including `<system-reminder>` tags. Two consequences:

- **History display**: `parse-history.server.ts` strips `<system-reminder>` blocks from user messages before rendering — same pattern as `[Files uploaded: ...]` annotation stripping.
- **Mode exit**: Old learning reminders from earlier turns remain in the journal. On resume after mode exit, the model sees historical reminders but no current-turn reminder. The absence of the reminder plus the `ExitLearningMode` tool result signals the mode is no longer active. This is how Claude Code's plan mode works.

**Client is authoritative for mode**: The client sends `mode` and `modeStreamSlug` in the chat request body. The API route reads these directly rather than maintaining independent server-side session state. Mode is persisted to `chat.json` for reload resilience and returned by the history API so the client can restore it.

`EnterLearningMode` and `ExitLearningMode` are custom MCP tools modeled on Claude Code's `EnterPlanMode` / `ExitPlanMode`.

### EnterLearningMode

Custom MCP tool. Q calls this when it detects teaching intent or when the user toggles learning mode.

```typescript
// Input
{
  streamSlug: string
} // Which stream to learn in. Required.
```

**Tool result**: Confirmation plus stream context summary — the same lightweight manifest from `formatStreamContext()`. Gives Q immediate orientation for the rest of the current turn.

```
Entered learning mode for client-reports.
Playbook: exists
Specs: reports.md, tone.md
Samples: 5 across reports
Uploads: none
```

**Side effects**: The server sets the session's mode to `'learning'` with the given `streamSlug`. Mode state lives in memory (like `active-sessions`), optionally persisted to `chat.json` for server restart resilience. On the next message, the server prepends the learning layer as a `<system-reminder>` block to the user's prompt.

### ExitLearningMode

Custom MCP tool. Q calls this when the teaching interaction is complete.

```typescript
// Input
{
} // No parameters.
```

**Tool result**: Confirmation. "Exited learning mode."

**Side effects**: The server clears the session's learning mode. On the next message, no `<system-reminder>` block is prepended. Base prompt only.

## Chat Storage

All chats live at root: `~/HappyHQ/.chats/{sessionId}/`. Stream affiliation is tracked via `streamSlug` in `chat.json` (nullable). Chats are interactions, not knowledge — the system extracts and codifies valuable information into stream artifacts. The conversation itself is ephemeral history.

Deleting a stream should cascade-delete chats where `streamSlug` matches. No orphans.

When Q enters learning mode and attaches a stream to a previously stream-less chat, only the `streamSlug` field in `chat.json` changes. No file moves.

## Stream-Less Chats

Top-level chats can exist without a stream. The HomeComposer no longer forces stream creation — the user types a message and starts chatting.

Stream attachment happens when needed:

- Q enters learning mode → identifies or asks which stream → `streamSlug` set in `chat.json`
- User toggles learning mode → stream selector appears → `streamSlug` set
- User creates a task in a specific stream → stream is referenced in the task, not necessarily in the chat

## Routing

New chats from the chat home route to `/chat/{sessionId}`. This applies whether or not a stream is selected. The chat home is for starting conversations; the chat view is for having them.

Desktop chats (sidebar, floating island) stay on the desktop. They don't route anywhere — they're a surface within the desktop, not a page.

## Desktop Chats

Desktop chats start in general mode, but with stream context available in the workspace summary. Q can enter learning mode instantly since the stream is already known — no "which stream?" question needed.

This means opening a chat on the desktop doesn't immediately fire subagents to read playbooks, specs, and samples. Those reads only happen when learning mode is entered. Quick questions get quick answers without the overhead.

## Agent SDK

All chat modes use the Agent SDK. General mode and learning mode are the same runtime — same `query()` call, same streaming, same session management. The prompt and available tools determine behavior, not the call method. This matches Claude Code, which handles casual questions and complex multi-file implementations through the same SDK.

**cwd is set once at session creation.** The SDK's cwd can't change mid-conversation. It's determined by what's known when the session starts:

CWD is always `~/HappyHQ/` (workspace root) for all modes. The system prompt tells the agent which stream to use for knowledge context (e.g., `{streamSlug}/playbook.md`). All paths are workspace-relative.

## Composer Toggle

A toggle in the composer for explicit user control over mode. Present in both the home composer and the desktop composer.

**Visual**: A clear indicator of current mode. When toggled to learning, a visual change confirms the mode (e.g., different accent color, label, or icon). When in general mode, the toggle is subtle — available but not dominant.

**Stream selection**: When the user toggles to learning and no stream is attached, a stream selector appears inline. The user picks an existing stream or creates a new one. The toggle doesn't activate until a stream is selected.

**State**: Mode state is stored in `chatStore` and persisted in `chat.json`. Survives page reload. The toggle reflects the current mode state.

## Base Prompt

The base prompt (`prompts/general.md`) is Q's identity. Always present, never changes between modes. It tells Q:

- Who it is and what it does ("You know how the user does their work. You do it for them.")
- How to behave in general mode (conversational, natural, helpful)
- When to enter learning mode (teaching patterns detected — switch, don't ask)

The base prompt is deliberately short. It's the foundation that learning instructions layer on top of. It does not pre-inject workspace context — Q has tools and can go look when it needs to. The prompt tells Q where things live (`~/HappyHQ/`) and what the filesystem structure looks like.

## Design Decisions

**Learning is a mode, not a behavior that emerges.** Early exploration considered making Q's behavior purely adaptive — one broad prompt that naturally shifts between general and learning based on context. This was rejected because: (1) the learning prompt's quality comes from its focus, and a broad prompt dilutes that, (2) learning requires upfront actions (reading artifacts, firing subagents) that are wasteful for general questions, and (3) explicit modes let the system prompt change cleanly rather than relying on conditional instructions ("read these files UNLESS it's a general question").

**Additive layer over system prompt swap.** Claude Code uses the Agent SDK and could change the system prompt between calls. It doesn't — it injects plan mode as a reminder layer on top of the unchanged base prompt. We follow the same pattern: base prompt is identity (always present), learning is an additive layer (injected when active, removed when not). This avoids duplicating the base prompt in every mode's prompt file and keeps mode-specific instructions composable.

**Additive injection over tool result injection.** Learning instructions delivered via tool result (like calling a tool that returns the learning guidelines) would fade in influence as the conversation grows. Injecting them as an additive layer on every turn, like Claude Code's plan mode reminders, keeps instructions fresh. This is critical for long teaching sessions.

**General mode as default everywhere.** Desktop chats could default to learning mode since they have stream context. But "learning is hard to drop down to general, whereas general doesn't get in the way." Starting general means quick questions get quick answers. The user or Q can escalate to learning when the conversation calls for it.

**Hard toggle over soft suggestion.** The composer toggle is a hard mode switch (like Claude Code's plan mode), not a hint to Q. When the user toggles learning mode, the learning layer is injected on the next message. This gives users explicit control alongside Q's judgment. Both paths lead to the same state.

**Stream-less chats are first-class.** Previously every chat required a stream. But "what's on my plate?" and "help me think about X" don't belong in a stream. Decoupling chat from stream is necessary for the task-first product where the primary entry point is a task list, not a stream.

**All chats at root.** All chats live at `~/HappyHQ/.chats/` with stream affiliation tracked via `streamSlug` in `chat.json`. One scan location, consistent model. Deleting a stream cascade-deletes chats where `streamSlug` matches.

**One SDK, all modes.** General mode and learning mode both use the Agent SDK. No separate code path for "simple" conversations. The prompt and tools determine behavior, not the runtime. This matches Claude Code and keeps the door open for adding tools to general mode without a rewrite.

**Desktop is not coupled to chat mode.** The desktop is presentation — spatial layout, windows, canvas. Chat mode is behavior — how Q responds. A learning conversation on the desktop is the same as a learning conversation from the top-level chat home. The mode travels with the chat session, not the UI container.

## Edge Cases

- **User toggles learning with no streams**: Show stream creation flow inline. The user names the new stream, it's created, and learning mode activates.
- **User teaches something in general mode without toggling**: Q enters learning mode. Q makes the call, not the user. The user has the composer toggle if they want manual control.
- **Mode switch mid-conversation**: Conversation history is preserved. The learning layer is added/removed via `<system-reminder>` injection on the next message. No messages are lost or replayed.
- **Multiple mode switches in one conversation**: Supported. User can toggle back and forth. Each switch updates the system prompt for subsequent turns.
- **Learning mode without a stream (shouldn't happen)**: If somehow triggered, Q asks which stream. Mode doesn't activate until a stream is attached.
- **Stream deleted while in learning mode**: Q exits learning mode, notifies the user.

## Acceptance Criteria

- [x] New chats start in general mode by default (both top-level and desktop)
- [x] Base prompt (`general.md`) is always present regardless of mode
- [x] Learning instructions are injected as an additive layer when learning mode is active
- [x] Q detects teaching intent and enters learning mode directly (no suggestion, no confirmation)
- [x] User can toggle learning mode via composer control
- [x] Toggling to learning requires a stream — stream selector shown if none attached
- [x] Mode transitions add/remove the `<system-reminder>` learning layer on the next message (base system prompt unchanged)
- [x] Conversation history is preserved across mode transitions
- [x] Mode state persists in chat session (survives reload)
- [x] Top-level chats can exist without a stream
- [x] Desktop chats start general with stream context available for instant learning mode entry
- [x] Learning quality in learning mode matches today's experience

## Testing

Mode state management:

- [x] Chat session stores and retrieves mode flag (`general` | `learning`)
- [x] Mode transitions update the flag and persist to `chat.json`
- [x] Prompt composition includes base prompt always, adds learning layer when mode is `learning`
- [x] Stream-less sessions have `streamSlug: null`
- [x] Attaching a stream updates the session's `streamSlug`

Composer toggle:

- [x] Toggle renders in both home and desktop composers
- [x] Toggling to learning without a stream shows stream selector
- [x] Toggling to general from learning removes learning layer, base prompt unchanged
- [x] Toggle reflects persisted mode state on reload

API:

- [x] Chat API reads mode from session and composes prompt (base + optional learning layer)
- [x] EnterLearningMode tool updates session mode and returns confirmation
- [x] ExitLearningMode tool clears session mode and returns confirmation

Not tested (prompt compliance):

- Q detects teaching intent accurately in general mode
- Q enters learning mode at appropriate moments
- Learning quality is preserved when entered via mode transition

## Cross-References

- [Learning](learning.md) — Learning behavior, classification, teaching flow
- [Chat](chat.md) — Chat surfaces, session lifecycle, composer
- [Agent Configuration](agent-config.md) — Model, tools, prompt configuration per mode
- [Prompts](prompts.md) — Prompt philosophy and construction
