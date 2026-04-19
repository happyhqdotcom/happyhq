# Chat

Chat is a surface, not a view. It provides the conversational interface with Q and can appear in different places within the Desktop.

## Purpose

Define how chat works across its two display modes (floating in the island, sidebar panel). The core chat components — messages, composer, question options, confirmations, StartTaskCard — are shared across both modes. This spec owns where chat appears, how it adapts to context, and the container-level behavior of each mode. Component-level rendering details (message anatomy, structured cards, composer values) are documented inline where needed.

From the user's perspective, chat is chat. They don't think "stream chat" vs "task chat" — they open chat, and it shows what's relevant. The same conversation persists when tasks open and close. Task-specific context (status, activity, plan approval) lives in the island, not the sidebar.

## Two Display Modes

Chat appears in two places. Same conversation, same messages, same state — just different containers.

### Floating (in the Island)

Chat renders inside the `DynamicIsland` via the `FloatingChatContent` component (`island/modes/chat.tsx`) when the island is in `chat` mode. Compact, bottom-anchored on the canvas. Good for quick exchanges and lightweight teaching conversations. Only available when no task is open — when a task is open, the island shows task activity instead (see [Island](island.md)). Exception: when a task is completed/stopped and the user activates the island, `FloatingChatContent` renders with a "What could Q do better next time?" placeholder.

The `Composer` in floating mode uses the `compact` prop — a single-row pill layout (`[plus | textarea | send]` inline) rather than the standard stacked card layout.

See [Island](island.md) for the island's mode transitions and when chat is accessible.

### Sidebar

Chat renders in a right-edge panel that slides in over the canvas. More space for conversation. Pure chat regardless of whether a task is open — task context lives in the island.

- Width: `450px`
- Position: `absolute top-1 right-1 bottom-1.5`
- Style: `rounded-t-xl rounded-b-[30px] bg-white/60 shadow-lg ring-1 ring-zinc-950/10 backdrop-blur-lg`
- Transition: `translate-x-0 opacity-100` (open) ↔ `translate-x-4 opacity-0 pointer-events-none` (closed)
- Z-index: 50 (above windows and icons)

### Moving Between Modes

The user can move chat between floating and sidebar:

- **Floating → Sidebar:** "Move to Sidebar" button (`PanelRight` icon) in the island chat header. Collapses the island, opens the sidebar.
- **Sidebar → Floating:** "Move to floating" button (`PanelLeft` icon) in the sidebar header. Closes the sidebar, expands the island to chat mode.

State is preserved — both modes read from the same Zustand store instance via `ChatSessionProvider` context. No prop re-threading needed when moving between modes.

## Chat Sidebar

The sidebar is one surface — pure conversation at all times. Task-specific context (status, activity, plan approval) lives in the island.

### Shared Shell

Every sidebar instance has the same container: header bar, scrollable body, footer with composer or interactive prompt.

**Header:**

- Close button (×)
- Context-specific controls (see below)

**Body:**

- Scrollable area with `ChatMessageList` (`space-y-3` gap, auto-scroll via `useStickToBottom`)
- Empty state when no messages

**Auto-scroll**: The `useStickToBottom` hook (`hooks/use-stick-to-bottom.ts`) uses a `MutationObserver` on the scroll container to detect any DOM change (streaming text, async markdown rendering, component swaps like Composer → QuestionOptions). When the user is near the bottom (within 50px threshold), new content auto-scrolls into view. If the user has scrolled up, auto-scroll is suppressed until they return to the bottom.

**Footer:**

- Default: `Composer` with context-sensitive placeholder. Sticky at the bottom with transparent background — content scrolls behind it.
- When Q asks a question: `QuestionOptions` replaces composer
- When Q needs tool approval: `AskUserConfirmation` replaces composer
- Disabled during streaming

**Working indicator:** A pulsing blob at the bottom of the chat body (at the `ChatContent` level, not per-message). Visible throughout streaming to show Q is active. Hidden when user interaction is needed: pending question, pending confirmation, or pending CreateTask card.

### Without a Task

When no task is active, the sidebar is pure chat.

**Header additions:**

- Chat name (or "New Chat"). Dropdown switcher when multiple chats exist.
- Move to floating button (`PanelLeft` icon)
- Options menu: Bug Report, Delete Chat (shown when messages exist)
- New Chat button (`SquarePen` icon)

**Body:**

- Empty state: "Teach Q about your work" (centered, bottom-aligned)
- Messages and stop feedback ("Chat stopped" when user explicitly stops)

**Footer:**

- Placeholder: "Teach Q about your work..." (default) or "Q is responding..." (streaming)

**Chat management:**

- **Multiple sessions:** A stream can have multiple chat sessions. The header shows a dropdown switcher when more than one exists.
- **Chat operations:** New chat (resets session, returns to composer), switch chat (loads different session), delete chat (removes directory, resets), bug report export.
- **Start Task cards:** When Q emits a `CreateTask` tool call, it renders as an inline `StartTaskCard` with a "Start" button. `CreateTask` is non-blocking — the agent continues the conversation naturally and can propose multiple tasks. The user starts tasks at their own pace. Started tasks are tracked in `chat.json` via `startedTasks: string[]`. See [Planning](planning.md).

### With a Task Open

When a task is active, the sidebar remains pure chat — same header, same body, same footer as without a task. The same chat session persists across task open/close. Task-specific context (status, activity, plan approval) lives exclusively in the island (see [Island](island.md)).

## State Model

One chat store per Desktop, created via `createChatStore()`. The store provides: `messages`, `isStreaming`, `pendingQuestion`, `pendingConfirmation`, `stoppedByUser`, `chatName`, `draftText`, `draftFiles`, `sendMessage()`, `loadHistory()`, `reset()`.

The store is created once per Desktop mount by `ChatSessionProvider` and shared between floating and sidebar modes via a React context that holds the store reference (not state values). Components access it via `useChatSessionStore()` and subscribe to specific slices via Zustand selectors — granular re-renders, no prop drilling. Both modes always show the same messages.

**Draft persistence**: `draftText` and `draftFiles` are store-backed fields (not component-local state). This means the user's typed text and staged files persist when toggling between floating and sidebar modes. `ChatContent` reads these from the store and passes them as controlled props to the Composer.

A `useChatActions()` hook wires chat store actions to desktop context — it reads `streamSlug` from `desktopStore`, connects to `navigateToTask`, `mutateStreamContent`, etc. Components call `useChatActions()` for send, stop, newChat, switchChat, deleteChat, and other operations that need cross-store coordination.

### File Upload — Deferred Staging Pattern

Files are **staged locally** on drop, not uploaded immediately. The Composer holds client-side `StagedFile[]` objects (containing the `File` reference, display name, and status). Actual upload to the server happens at send-time — when the user sends a message, staged files are uploaded first, then the message is sent with the file annotation.

This deferred pattern has two benefits:

- **Home screen uploads**: Files can be staged before any chat session exists (the session is created at send-time via `ensureSession()`)
- **No orphaned uploads**: Files that are dropped but never sent are never uploaded to the server

`StagedFile` objects are stored in `chatStore.draftFiles` for persistence across floating/sidebar toggle (see Draft Persistence above). The Composer renders staged files as `FileCard` components with hover-reveal remove buttons.

### File Upload Annotation

When the user drops files into chat, the store composes a text annotation `[Files uploaded: file1.pdf, file2.csv]` appended to the API message so the agent knows which files to read from `uploads/` via filesystem tools. The UI stores filenames separately on `ChatMessage.files` and renders them as visual pills — never as raw text.

When loading historical sessions from SDK JSONL, `parse-history.server.ts` reverses this: `extractFilesFromContent()` strips the `[Files uploaded: ...]` marker and restores the structured `files` array, so reloaded conversations display files the same way as live ones.

## Message Rendering

Chat messages use the shared `ChatMessageList` component. Message anatomy, structured cards, and rendering details are inherited from the original chat component architecture:

**Assistant messages** render composite content: thinking (collapsible), text (markdown), tool progress (steps with labels/details). Streamed text uses animated character-by-character reveal (`useAnimatedText` hook with framer-motion) — messages appear progressively rather than as a block.

**User messages** render right-aligned with subtle background, plain text with `whitespace-pre-wrap`.

**Structured cards** render inline: `StartTaskCard` (non-blocking task proposals — see [Agent Configuration](agent-config.md)), `QuestionOptions` (multi-question tabbed interface), `AskUserConfirmation` (tool approval with Allow/Deny). Questions render instantly — `input_json_delta` chunks are parsed during streaming so the form appears as soon as the content block completes, with no skeleton loading state.

**TodoWrite** renders as enriched progress rows with auto-expanded visual checklists.

**WritingPreview** shows live output from the Drafting subagent as it produces content. When Q in learning mode delegates to Drafting (see [Agent Configuration](agent-config.md)), partial text from the subagent streams into a `WritingPreview` card attached to the current assistant message. The card is a compact preview area (`max-h-[6.5rem]`, auto-scrolling) with monospace text that updates as Drafting writes. Tracked via `parentToolUseId` — the Task tool_use block that spawned the subagent. Hidden when no text has been produced yet. Component: `components/features/chat/messages/writing-preview.tsx`.

**Copy button** appears on hover for assistant messages.

Component-level rendering details (concrete values, spacing, structured card anatomy, TodoWrite rendering, tool labels) live in the code.

## Session Lifecycle

Chat sessions are stored at root level in `~/.chats/{id}/chat.json`. Stream affiliation is metadata (`streamSlug` in `chat.json`), not directory nesting. The desktop filters chats by `streamSlug` to show stream-related conversations. Multiple chats can reference the same stream.

1. Desktop mounts → loads chats filtered by `streamSlug === currentStream` → sets `sessionIdRef` to most recent → calls `loadHistory()`.
2. User sends first message in a new chat → `ensureSession()` lazily creates the session (generates UUID → `createChatSession(sessionId, streamSlug)` → sets ref) → `sendMessage()`
3. Subsequent messages use the same session ref with `resume: true`

**`ensureSession()`** (in `useChatActions`): Lazy session creation — if a session already exists, returns immediately. Uses a promise lock (`sessionPromiseRef`) to prevent concurrent creation. This is critical for multi-file drop: several `onChange` callbacks fire simultaneously, each potentially calling `ensureSession()`. Without the lock, multiple sessions would be created. The promise lock ensures only the first call creates the session; concurrent calls await the same promise. 4. New Chat → stops any active stream → `reset()` → clears ref → returns to composer 5. Switch Chat → stops active stream → `reset()` → sets new ref → `loadHistory()` → shows chat

The same session persists when tasks open and close. When the user opens a task, the conversation they were having continues. When they close the task, the conversation is still there.

## Testing

Chat store — the core chat state machine (`stores/chatStore.test.ts`):

- [x] Message handling: addUserMessage, reset, loadHistory (API fetch, empty, error) (`stores/chatStore.test.ts`)
- [x] Streaming: partial assembly, final text, multi-turn message separation (`stores/chatStore.test.ts`)
- [x] Tool calls: AskUserQuestion detection, CreateTask storage, tool progress, MCP prefix stripping (`stores/chatStore.test.ts`)
- [x] Error handling: HTTP, stream, network errors; stoppedByUser cleanup (`stores/chatStore.test.ts`)
- [x] Pending confirmations lifecycle, auto-naming, file annotation composition, resume flag (`stores/chatStore.test.ts`)

Server-side stores:

- [x] Active sessions: register, abort, clear with globalThis persistence (`lib/chat/active-sessions.test.ts`)
- [x] Pending questions: waitForAnswer/submitAnswer, stale cleanup, session isolation (`lib/chat/pending-questions.test.ts`)
- [x] Pending confirmations: wait/allow/deny with toolUseId-based isolation (`lib/chat/pending-confirmations.test.ts`)

History parsing (`lib/chat/parse-history.server.test.ts`):

- [x] User/assistant message extraction from JSONL journals (`lib/chat/parse-history.server.test.ts`)
- [x] Tool call extraction, MCP prefix stripping, thinking blocks (`lib/chat/parse-history.server.test.ts`)
- [x] AskUserQuestion answer attachment, CreateTask taskStarted detection (`lib/chat/parse-history.server.test.ts`)
- [x] File upload extraction from `[Files uploaded: ...]` markers (`lib/chat/parse-history.server.test.ts`)

Display utilities:

- [x] `getToolLabel` and `getToolDetail` for all known tool types (`lib/chat/tool-labels.test.ts`)

Components:

- [x] Composer: submit, Enter/Shift+Enter, file upload lifecycle, drag-and-drop, busy state (`components/features/chat/composer.test.tsx`)
- [x] AskUserConfirmation: tool summaries, Allow/Deny callbacks (`components/features/chat/interaction/ask-user-confirmation.test.tsx`)
- [x] QuestionOptions: option rendering, Other input, multi-question auto-advance (`components/features/chat/interaction/question-options.test.tsx`)
- [x] StartTaskCard: onStart callback, started state (`components/features/chat/interaction/start-task-card.test.tsx`)
- [x] ChatMessage: user vs assistant, markdown, streaming, thinking, file pills, truncation (`components/features/chat/messages/chat-message.test.tsx`)
- [x] TodoWriteDisplay: status text, scroll cap (`components/features/chat/messages/todo-write-display.test.tsx`)
- [x] ToolProgressIndicator: polymorphic rendering, auto-expand TodoWrite (`components/features/chat/messages/tool-progress-indicator.test.tsx`)

Not tested:

- [ ] Sidebar container (450px panel, slide-in transition, z-index 50)
- [ ] Floating ↔ sidebar mode transition
- [ ] Chat dropdown switcher (multiple sessions)
- [ ] ChatMessageList auto-scroll behavior

## Design Decisions

**Chat is a surface, not a view.** Chat used to be a full-page route. Now it's a panel that can appear in different places within the Desktop. This keeps the user in their spatial context while conversing with Q.

**One chat, one conversation.** There's no "stream chat" vs "task chat." The user has one conversation with Q. The same session persists across task open/close — feedback on a plan is a message in the same conversation that led to the task.

**Move between modes.** The ability to move chat from floating to sidebar (and back) gives the user control over how much screen real estate they want for conversation. Quick exchange? Stay floating. Deep teaching session? Move to the sidebar.

**Chat is sidebar-only during a task.** During a task, the island shows activity (what Q is doing). This is intentional — the island provides ambient awareness without requiring interaction. Chat (deeper engagement) lives in the sidebar, which the user opens deliberately.

## Cross-References

- [Chat Modes](chat-modes.md) — General vs learning mode, transitions, composer toggle, system prompt injection
- [Island](island.md) — The floating mode where chat appears
- [Desktop](desktop.md) — The canvas where chat renders
- [Planning](planning.md) — Start Task handoff from chat, plan approval flow
- [Data Flow](data-flow.md) — Chat API routes, server actions
- [Agent Configuration](agent-config.md) — SDK session management, streaming
