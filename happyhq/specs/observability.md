# Observability

Debugging and diagnostics for Q.

Q runs locally — all session data lives on the user's machine. When something goes wrong (a chat hangs, Q produces unexpected output, a task stalls), developers have no visibility unless the user can send them the relevant data. This spec defines the tools and patterns that close that gap.

Related: [Playground § Sessions](playground.md#sessions) — sandboxed live-SDK sessions with recorded transcripts and a stable viewer URL. Same observability shape (record once, replay or share later), targeted at dev-loop iteration rather than user-reported bugs.

## 1. Debug Bundle Export

### Problem

When users hit issues, the diagnostic data lives on their machine and there's no way to get it to a developer. A user reporting "it hung" gives the developer nothing to work with. The raw SDK journal contains everything needed to reconstruct what happened — what messages were exchanged, what tools the agent called, what it was thinking — but it's buried in `~/.claude/projects/` in a JSONL file the user doesn't know about.

### Design

One-click export from the chat header. Produces a single JSON file the user can send to a developer.

**Trigger:** Bug icon dropdown item in the chat overflow menu (alongside Delete). Clicking it downloads a JSON file via the browser.

**Bundle contents:**

| Field                     | Source                                         | Purpose                                                                                                                                  |
| ------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `version`                 | `1`                                            | Schema version for future evolution                                                                                                      |
| `exportedAt`              | `new Date().toISOString()`                     | When the bundle was exported                                                                                                             |
| `appVersion`              | `package.json`                                 | Which version of Q                                                                                                                       |
| `streamName`              | `chat.json` `streamSlug` field                 | Which stream the chat is affiliated with (nullable)                                                                                      |
| `chat.sessionId`          | URL param                                      | SDK session identifier                                                                                                                   |
| `chat.name`               | `.chats/{id}/chat.json`                        | Auto-generated display name                                                                                                              |
| `chat.createdAt`          | `.chats/{id}/` dir birthtime                   | When the chat was created                                                                                                                |
| `rawJournal`              | `~/.claude/projects/{encoded-path}/{id}.jsonl` | **Raw** SDK conversation journal — messages, tool calls, tool results, thinking blocks. Not parsed — raw JSONL preserves all SDK detail. |
| `playbook`                | `~/HappyHQ/{stream}/playbook.md`               | Stream context the agent was working with                                                                                                |
| `specs`                   | `~/HappyHQ/{stream}/specs/*.md`                | Spec files (name + content) the agent could see                                                                                          |
| `environment.platform`    | `process.platform`                             | OS                                                                                                                                       |
| `environment.nodeVersion` | `process.version`                              | Node.js version                                                                                                                          |
| `environment.arch`        | `process.arch`                                 | Architecture                                                                                                                             |

Every field that reads from the filesystem is null-safe — a bundle is always produced, even if files are missing. The developer can see which fields are null and diagnose from there.

**Output filename:** `debug-{stream}-{sessionId-first-8-chars}.json`

### Implementation

| File                                                | Action | What                                                                                                              |
| --------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------- |
| `app/lib/chat/debug-bundle.ts`                      | Create | `DebugBundle` TypeScript interface                                                                                |
| `app/lib/chat/assemble-debug-bundle.server.ts`      | Create | `assembleDebugBundle(streamName, sessionId)` — reads all files, returns bundle                                    |
| `app/app/api/chat/debug-bundle/route.ts`            | Create | `GET /api/chat/debug-bundle?stream=&session=` — thin wrapper, returns JSON with `Content-Disposition: attachment` |
| `app/components/features/chat/chat-content.tsx`     | Modify | Add Bug icon dropdown item, fetch + blob download via `useChat.exportDebug()`, toast feedback                     |
| `app/lib/chat/assemble-debug-bundle.server.test.ts` | Create | Tests for assembly function                                                                                       |

**Reuses existing code:**

- `readTextFile()`, `listDirectory()` from `app/lib/fs/read.server.ts`
- `streamPath()` from `app/lib/fs/paths.ts`
- `streamExists()` from `app/lib/fs/read.server.ts`
- `resolveSessionJournal()` from `app/lib/chat/journal-path.server.ts` (encode path, try primary, fall back to scanning all project dirs)
- `Content-Disposition: attachment` pattern from `app/app/api/fs/download/route.ts`
- Toast feedback via `sonner` (used throughout the app)

### Reading a bundle

The bundle is a plain JSON file. A developer can:

1. Open it in any editor / JSON viewer
2. Read the `rawJournal` field line-by-line to trace the conversation
3. Feed it to Claude Code for analysis ("here's a debug bundle from a user who reported X — what happened?")

The `rawJournal` is the key diagnostic artifact. Each line is a JSON object with `type` (user/assistant), `timestamp`, and `message` (containing content blocks — text, tool_use, tool_result, thinking). Tracing the tool calls and their results reveals where the agent got stuck, looped, or produced unexpected output.

## Testing

Debug bundle route (`app/api/chat/debug-bundle/route.test.ts`):

- [x] GET /api/chat/debug-bundle: parameter validation, path traversal prevention, Content-Disposition header, error handling (`app/api/chat/debug-bundle/route.test.ts`)

Debug bundle assembly (`lib/chat/assemble-debug-bundle.server.test.ts`):

- [x] Full bundle population with all fields (`lib/chat/assemble-debug-bundle.server.test.ts`)
- [x] Null-safe — bundle always produced even when files missing (`lib/chat/assemble-debug-bundle.server.test.ts`)
- [x] rawJournal preserved as unparsed string (`lib/chat/assemble-debug-bundle.server.test.ts`)
- [x] Specs filtered to .md-only files (`lib/chat/assemble-debug-bundle.server.test.ts`)
- [x] Malformed chat.json handled gracefully (`lib/chat/assemble-debug-bundle.server.test.ts`)
- [x] Fallback JSONL path scanning through ~/.claude/projects/ (`lib/chat/assemble-debug-bundle.server.test.ts`)
