# Data Flow

How state moves from `~/HappyHQ/` files through the server to the client UI.

## Purpose

Define the data flow architecture for Q. SWR fetches file data from API routes and caches it. A small Zustand store handles UI-only state. This spec defines how reads, writes, and live updates flow through the system.

## Architecture Overview

```
Reads:   lib/fs/ helpers → Server Component → store (initial seed)
         lib/fs/ helpers → API routes → SWR → Zustand stores → components
Writes:  Agent → SDK file tools → filesystem (server-side, no route needed)
         User  → server actions → lib/fs/ helpers → filesystem
State:   Zustand streamsStore → components (stream listing for sidebar and launch)
         Zustand desktopStore → components (stream/task content, navigation, run state, UI)
         Zustand chatStore → components (messages, streaming, pending questions)
         Zustand windowStore → components (open windows, z-order, position)
```

The filesystem at `~/HappyHQ/` is the source of truth. The page Server Component pre-loads stream and task content and seeds the Zustand store, so the UI renders in the correct state on first frame. SWR then takes over for ongoing revalidation — caching reads and refetching when told to. Zustand stores distribute data to components via fine-grained selectors — eliminating prop drilling. Headless provider components bridge SWR into stores.

**Q is a local application.** The server and filesystem are colocated — same machine, whether that's the user's laptop or a private VM. Reads are local disk reads (microseconds), not network calls. The API route layer exists because the browser can't access the filesystem directly, not because of network concerns. This means reads are effectively free, caching is for deduplication and lifecycle management (not latency), and there's no need for distributed-system sync infrastructure.

## Pattern Assignment

Every client-facing data flow uses one of two patterns. This table is the canonical reference — if it's not here, it's not a pattern.

| Data                                                                | Pattern                 | Endpoint                       | Notes                                                                                                       |
| ------------------------------------------------------------------- | ----------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Chat messages (text, tool calls)                                    | SDK streaming           | `POST /api/chat`               | Token-level via `includePartialMessages`                                                                    |
| AskUserQuestion answers                                             | API route               | `POST /api/chat/answer`        | Resolves pending `canUseTool` callback; SDK continues on same stream                                        |
| Stop chat streaming                                                 | API route               | `POST /api/chat/stop`          | Aborts active learning-mode `query()` via `lib/chat/active-sessions.ts` (`Map<sessionId, AbortController>`) |
| Start planning/working                                              | API route               | `POST /api/run/start`          | Kicks off Q with `mode: 'planning' \| 'working'`, returns immediately                                       |
| Plan generation liveness                                            | Optional: SDK streaming | `GET /api/run/stream`          | Optional real-time "Reading specs..." updates. Can also just show spinner.                                  |
| Working loop liveness                                               | SDK streaming           | `GET /api/run/stream`          | `SDKResultMessage` marks each iteration boundary                                                            |
| Stop run                                                            | API route               | `POST /api/run/stop`           | Immediate stop: `abortController.abort()` terminates current iteration                                      |
| Task content (plan, progress, files, outputs)                       | Filesystem + SWR        | `GET /api/fs/task`             | Refetch triggered by stream signals or button states                                                        |
| Stream content (playbook, specs, samples)                           | Filesystem + SWR        | `GET /api/fs/stream`           | Refetch on window focus + after mutations                                                                   |
| Single file content                                                 | Filesystem + SWR        | `GET /api/fs/file`             | For the Work Viewer                                                                                         |
| Stream listing                                                      | Filesystem + SWR        | `GET /api/fs/streams`          | SWR → `streamsStore` via `StreamsDataProvider`; powers sidebar stream list and launch routing               |
| Run status                                                          | Filesystem + SWR        | via task content (`.run.json`) | Written by loop, read via SWR                                                                               |
| Active run status                                                   | API route               | `GET /api/run/active`          | Returns `{ stream, task } \| null`; powers chat busy state (see [Chat](chat.md))                            |
| Chat history (prior messages)                                       | Filesystem + fetch      | `GET /api/chat/history`        | Reads SDK JSONL from `~/.claude/projects/`, one-time load on mount                                          |
| Chat sessions for a stream                                          | Filesystem + SWR        | `GET /api/fs/chats`            | Separated from stream content for latency; fetched by `DesktopDataProvider` after mount                     |
| File download                                                       | API route               | `GET /api/fs/download`         | Binary download with `Content-Disposition: attachment`. Used by window file actions menu.                   |
| Reveal file in Finder                                               | API route               | `POST /api/fs/reveal`          | macOS `open -R` to show file location. Used by window file actions menu.                                    |
| Active tasks across streams                                         | API route               | `GET /api/fs/active-tasks`     | Returns runs in active state across all streams. Powers sidebar run status badges.                          |
| User mutations (create, rename, delete streams/tasks; upload files) | Server actions          | `lib/actions.ts`               | All mutations against `~/HappyHQ/`. Caller calls `mutate(key)` after.                                       |

**SDK streaming** is for liveness — real-time signals that something is happening. The client connects to a streaming response and receives SDK messages as the agent works.

**Filesystem + SWR** is for state — the actual data the UI renders. The client fetches structured data from API routes, SWR caches it, and `mutate(key)` triggers refetches when the streaming signal says something changed.

These two patterns work together during active runs: the stream tells the client _when_ to look, SWR tells the client _what_ to see.

## Client–Server Boundary

The browser does not access `~/HappyHQ/` directly. All filesystem reads go through API routes. Files dropped into chat are staged to `.chats/{sessionId}/uploads/` via the `uploadFile()` server action. The agent classifies them during conversation — samples are moved to `{stream}/samples/` by the agent, task inputs are moved to `tasks/{task}/inputs/` by `setupTaskFromChat()` when the user clicks "Start Task".

## Server-Side Filesystem Access

### `lib/fs/` — Shared Helpers

A small set of server-only functions for reading and writing `~/HappyHQ/`. These helpers own filesystem domain knowledge — they know what files make up a stream or task, assemble structured data from multiple reads, and handle edge cases. API routes are thin wrappers over these helpers.

```
lib/fs/
  paths.ts              # Path resolution and constants
  read.server.ts        # Read operations (files, directories)
  write.server.ts       # Write operations (files, directories)
  types.ts              # Shared types (contract between server and client)
```

### Shared Types

`lib/fs/types.ts` defines the structured types that flow between server and client. Define once, use on both sides.

- **`FileEntry`**: name, path, type (`'file'` | `'directory'`), modifiedAt
- **`StreamEntry`**: name, createdAt — returned by `readStreams()`, used by the sidebar stream list and home page
- **`TaskContent`**: plan (`string | null`), progress (`string | null`), run (`RunInfo | null` — from `.run.json`), inputs (`FileEntry[]`), files (`FileEntry[]` — working/ contents), outputs (`FileEntry[]`)
- **`StreamContent`**: playbook (`string | null`), specs (`FileEntry[]`), samples (`FileEntry[]`). Note: tasks and chats are no longer part of `StreamContent` — tasks are root-level (fetched via `GET /api/fs/task-items`), chats are root-level with `streamSlug` metadata (fetched via `GET /api/fs/chats`)
- **`ChatEntry`**: sessionId, name (`string | null`), createdAt
- **`TaskItem`**: slug, frontmatter (`TaskFrontmatter`), run (`RunInfo | null`), description (`string | null`)

### Path Resolution

`HAPPYHQ_ROOT` is defined in `lib/constants.server.ts` (foundation layer). `paths.ts` imports it internally — consumers who need the raw root import from `@/lib/constants.server` directly.

```typescript
// lib/fs/paths.ts
import path from 'path'
import { HAPPYHQ_ROOT } from '@/lib/constants.server'

export function streamPath(streamName: string): string {
  return path.join(HAPPYHQ_ROOT, streamName)
}

export function taskPath(taskSlug: string): string {
  return path.join(HAPPYHQ_ROOT, 'tasks', taskSlug)
}

// Validate that a path is within ~/HappyHQ/ (prevent path traversal)
// Called internally by read and write helpers — callers don't need to validate.
// Throws on invalid path — callers cannot accidentally ignore the result.
export function validatePath(targetPath: string): void {
  const resolved = path.resolve(targetPath)
  const root = path.resolve(HAPPYHQ_ROOT)
  // Segment-aware check: resolved must equal root OR start with root + separator.
  // A bare startsWith would accept sibling paths like /HappyHQ_backup/.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path ${targetPath} is outside ~/HappyHQ/`)
  }
}
```

### Path Safety

`validatePath()` uses segment-aware comparison — not bare `startsWith()` — to prevent sibling directory bypass (e.g., `~/HappyHQ_backup/` must not pass validation when root is `~/HappyHQ`). User-supplied path segments (session IDs, stream names, task names) that are interpolated into filesystem paths must be validated at the API boundary before use. Reject values containing path separators (`/`, `\`) or traversal sequences (`..`). This applies to all API routes and server actions that accept user-provided identifiers as path components.

### Read Operations

All read helpers call `validatePath()` internally before accessing the filesystem. Callers (API routes, server actions) pass names or paths and get safe access automatically.

```typescript
// lib/fs/read.server.ts
import { readFile, readdir, stat } from 'node:fs/promises'

export async function readTextFile(filePath: string): Promise<string | null> {
  // Validates path is within ~/HappyHQ/ before reading
  try {
    return await readFile(filePath, 'utf-8')
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function listDirectory(dirPath: string): Promise<FileEntry[]> {
  // Returns file names, types, and modification times
  // Used by Work Viewer file tree
}

export async function readStreamContent(
  streamName: string,
): Promise<StreamContent> {
  // Reads playbook.md, lists specs/, lists samples/
  // Returns structured data for the Desktop
}

export async function readTaskContent(
  taskSlug: string,
): Promise<TaskContent | null> {
  // Reads plan.md, .run.json, lists inputs/, working/, outputs/
  // Returns null if the task directory does not exist (route maps to 404)
  // Returns structured data for the Desktop (when a task is open)
}

export async function streamExists(streamName: string): Promise<boolean> {
  // Validates path, then stat() check. Returns false for ENOENT.
  // Used by the stream API route to return 404 for nonexistent streams.
}

export async function readStreams(): Promise<StreamEntry[]> {
  // Lists top-level stream directories under ~/HappyHQ/
  // Excludes dot-prefixed directories, sorted newest-first by birthtime
  // Returns empty array if ~/HappyHQ/ doesn't exist
}
```

`lib/fs/` functions return structured data. API routes call them, check for errors, and return `Response.json()`. Routes should not do their own `readFile` calls when a helper exists — that leaks filesystem domain knowledge into the HTTP layer.

### Write Operations

Write helpers also call `validatePath()` internally before any filesystem mutation.

```typescript
// lib/fs/write.server.ts
export async function ensureDirectory(dirPath: string): Promise<void> {
  // Validates path, then mkdir -p. Used when creating streams, tasks.
}

export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  // Validates path, then writes. Used by server actions for user uploads.
}
```

All functions in `lib/fs/` use the `.server.ts` suffix — they cannot be imported from client components.

## Read Path: Filesystem + SWR

### API Routes

API routes expose filesystem data to the client. Located in `app/api/fs/`:

```
app/api/fs/
  stream/route.ts       # GET: Read stream content (playbook, specs, samples)
  task/route.ts         # GET: Read task content (plan, progress, files, inputs, outputs)
  file/route.ts         # GET: Read a single file's content (for the viewer)
  streams/route.ts      # GET: List all streams sorted by birthtime
  chats/route.ts        # GET: List chat sessions (all root-level, filterable by streamSlug)
  active-tasks/route.ts # GET: Active runs across all tasks (powers sidebar run status badges)
  download/route.ts     # GET: Download a file as binary (Content-Disposition: attachment)
  reveal/route.ts       # POST: Reveal a file in Finder (macOS `open -R`)
```

**Why chats are separate:** Including `listChats()` in the server-side `readStreamContent()` call added latency to every page load. Since chat history is not needed for the initial render frame (desktop icons, windows, and task state render without it), chats are deferred to a client-side SWR fetch via the dedicated `GET /api/fs/chats?name={stream}` route. `DesktopDataProvider` fetches chats in parallel with stream content after mount.

Each route is a thin wrapper: parse params, call `lib/fs/` helper, return JSON. A route should be 5-10 lines of logic. Routes do not validate paths or import from `fs` — that's handled inside `lib/fs/` helpers.

```typescript
// app/api/fs/task/route.ts
import { readTaskContent } from '@/lib/fs/read.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const task = searchParams.get('task')

  if (!task) {
    return Response.json({ error: 'Missing task parameter' }, { status: 400 })
  }

  try {
    const content = await readTaskContent(task)
    if (!content) {
      return Response.json({ error: 'Task not found' }, { status: 404 })
    }
    return Response.json(content)
  } catch (error) {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```

**One data-fetching pattern:** Filesystem + SWR for all file-backed data. Server components render the layout shell but do not fetch file data. One pattern, no decision points.

**Error responses:** API routes return `{ error: string }` with standard HTTP status codes. 404 means the resource doesn't exist yet — components render empty state, not error UI. 400 for bad params. 500 for unexpected failures. SWR treats any non-2xx as an error via the fetcher.

### SWR for File-Backed Data

Components declare what data they need via `useSWR`. SWR handles fetching, caching, deduplication, and revalidation.

```typescript
// lib/swr.ts — shared fetcher with status-aware errors
export class FetchError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new FetchError(res.statusText, res.status)
    return res.json()
  })
```

Components check `error.status` to distinguish "doesn't exist yet" (404 → render empty state) from "something broke" (500 → render error UI):

```typescript
if (error?.status === 404) return <EmptyState />
if (error) return <ErrorState />
```

```typescript
// components/features/desktop/desktop-data-provider.tsx (SWR → store bridge)
'use client'

import useSWR from 'swr'
import { fetcher } from '@/lib/swr'

// DesktopDataProvider runs SWR fetches and pushes results into desktopStore.
// Components never call useSWR directly — they read from store selectors.

// Read server-seeded data once for SWR fallback (prevents overwriting
// seeded store data with undefined while SWR's first fetch is in-flight).
const [initialData] = useState(() => store.getState())

const taskApiKey = isTaskMode
  ? `/api/fs/task?stream=${encodeURIComponent(streamSlug)}&task=${encodeURIComponent(activeTaskSlug!)}`
  : null
const {
  data: taskContent,
  error: taskError,
  isLoading: taskLoading,
  mutate: mutateTask,
} = useSWR<TaskContent>(taskApiKey, fetcher, {
  revalidateOnFocus: true,
  fallbackData: initialData.taskContent, // use server-seeded data until SWR resolves
})

// Push into store — components subscribe via useTaskContent(), useTaskError(), etc.
useEffect(() => {
  store.getState().setTaskData({
    content: taskContent,
    error: taskError,
    loading: taskLoading,
    mutate: () => mutateTask(),
  })
}, [store, taskContent, taskError, taskLoading, mutateTask])
```

**Key behaviors:**

- Pass `null` as the key to skip fetching (conditional fetching).
- SWR revalidates on window focus by default — good for picking up file changes made outside the app.

### SWR Key Conventions

```typescript
// Stream content
;`/api/fs/stream?name=${streamName}`
// Task content (plan, progress, files)
`/api/fs/task?task=${taskSlug}`
// Single file content (for the viewer)
`/api/fs/file?path=${filePath}`
// Find newest stream (by birthtime)
`/api/fs/streams`
```

## Data Path Summary

Three distinct data paths, each with a clear reason:

| Path               | Mechanism                    | Examples                                                                                                                                                     |
| ------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Reads**          | API routes → SWR             | Stream content, task content, file viewer                                                                                                                    |
| **Agent writes**   | SDK file tools (server-side) | Playbook, specs, plan.md, working/ artifacts, outputs                                                                                                        |
| **User mutations** | Server actions               | `createStream()`, `renameStream()`, `deleteStream()`, `createTask()`, `setupTaskFromChat()`, `deleteTaskByLocation()`, `uploadFile()`, `checkStreamExists()` |

**Agent writes** go directly through the SDK's built-in file tools. The agent runs server-side and writes to disk as part of its execution — no API route needed. The app doesn't mediate these writes. Tool permissions are scoped per agent mode (see [Agent Configuration](agent-config.md)).

**User mutations** use server actions because they're mutations with no caching semantics. The browser has the file (upload) or the intent (create stream), and the server writes to `~/HappyHQ/`. All server actions live in `lib/actions.ts`:

- `createStream(slug)` — creates a stream directory with the given slug (e.g., `client-proposals/`) and the standard subdirectories (`specs/`, `samples/`). Streams are pure knowledge containers. Called from HomeComposer when the user submits a message to create a new stream.
- `renameStream(fromSlug, toSlug)` — renames a stream directory via atomic `fs.rename`. Both paths validated before rename. Called server-side by the chat route during stream naming (see [Home](home.md)) and by the sidebar rename dialog for user-initiated renames (see [Sidebar](sidebar.md)).
- `uploadFile(sessionId, formData)` — stages a file to `.chats/{sessionId}/uploads/{slug}/original.{ext}` at the workspace root, returns the sanitized filename. Sanitizes filenames by replacing non-alphanumeric characters (except `.`, `-`, `_`) with underscores. Uses `Buffer.from(file.arrayBuffer())` for binary-safe writes. Every file enters through chat — the destination is always the chat session's upload staging directory. The agent classifies the file during conversation (see [Learning](learning.md)): samples are moved to `{stream}/samples/` by the agent via file tools, task inputs stay in `uploads/` until `setupTaskFromChat()` moves them to `tasks/{task}/inputs/`.
- `createTask(slug, title, stream?, description?)` — creates task directory at root `tasks/{slug}/` with `task.md` containing YAML frontmatter (`title`, `createdAt`, optional `stream`) and the optional `description` as the body. Does not create subdirectories — that's handled by `setupTaskFromChat()`.
- `setupTaskFromChat(slug, sessionId, files)` — creates subdirectories (`inputs/`, `working/`, `outputs/`) and moves files listed in `files` from `.chats/{sessionId}/uploads/` to `tasks/{slug}/inputs/` via `fs.rename` (atomic move on same filesystem). Filenames in the `files` array are defensively stripped of any `uploads/` prefix before constructing paths. Called after `createTask()` (which already wrote the description into `task.md`) as part of the "Start Task" flow.
- `deleteChat(sessionId)` — deletes the `.chats/{sessionId}/` directory via `rm(dir, { recursive: true, force: true })`. Hard delete, no confirmation, no undo. SDK session data in `~/.claude/` is left intact (SDK's domain). Caller calls `mutate(key)` after, or navigates away.
- `deleteTaskByLocation(slug)` — deletes the `tasks/{slug}/` directory via `rm(dir, { recursive: true, force: true })`. Hard delete, no confirmation, no undo.
- `checkStreamExists(slug)` — wraps `streamExists()` from `lib/fs/read.server.ts` as a server action. Used by the sidebar create/rename dialogs for collision checking.

Server actions return `void` (or `boolean` for checks) and throw on failure. After a successful action, the calling component calls `mutate(key)` on the affected SWR cache to trigger a refetch. Since the server reads local disk, the refetch returns instantly.

```typescript
// lib/actions.ts
'use server'

import { rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { streamPath, validatePath } from '@/lib/fs/paths'
import { ensureDirectory, writeTextFile } from '@/lib/fs/write.server'

export async function createStream(slug: string): Promise<void> {
  const root = streamPath(slug)
  validatePath(root)
  await Promise.all([
    ensureDirectory(root),
    ensureDirectory(path.join(root, 'specs')),
    ensureDirectory(path.join(root, 'samples')),
  ])
}
```

```typescript
// In HomeComposer — temp slug + server-side naming
import { createStream, createChatSession } from '@/lib/actions'
import { useStreamsStore } from '@/stores/streamsStore'

async function handleSubmit(message: string) {
  const sessionId = crypto.randomUUID()
  const tempSlug = sessionId // reuse UUID as temp slug

  await Promise.all([
    createStream(tempSlug),
    createChatSession(sessionId, tempSlug),
  ])

  // Optimistic sidebar update
  const store = useStreamsStore.getState()
  store.setStreamsData({
    streams: [
      { id: tempSlug, name: tempSlug, createdAt: new Date().toISOString() },
      ...store.streams,
    ],
    isLoading: false,
  })

  // Bridge to stream page — ChatSessionProvider picks up the message.
  sessionStorage.setItem(
    'q-home-message',
    JSON.stringify({ slug: tempSlug, sessionId, message }),
  )
  router.push('/' + tempSlug)
}
```

**Default revalidation pattern:** `mutate(key)` after server actions. No `revalidatePath()`. The component that triggered the mutation knows what data changed, so it refetches the affected key. Simple, explicit, traceable. For transitions where instant feedback matters (e.g., task creation updating the sidebar and desktop), optimistic cache seeding is used — `mutate(key, optimisticData, false)` pre-populates SWR with the expected data so the UI updates before the refetch completes.

The complete mutation shape includes error handling with toast:

```typescript
// Canonical mutation pattern
async function handleDelete() {
  try {
    await deleteChat(sessionId) // server action — throws on failure
    mutateChats() // refresh affected SWR key
  } catch {
    toast.error('Failed to delete chat') // sonner toast for mutation errors
  }
}
```

Server actions throw, `mutate()` refreshes, `toast.error()` surfaces failures. No try/catch around `mutate()` — SWR fetches local disk, it won't fail.

## Zustand Stores

Four stores distribute state to components. No persist middleware — state resets on refresh. Components read from stores via fine-grained selector hooks, never via prop drilling.

### `desktopStore` — Main Distribution Store

The central store for the Desktop. Global singleton via module-level `create()` with a `reset()` action — same pattern as `windowStore` and `streamsStore`. No React context needed. Components import `useDesktopStore` directly. The store holds only client-only state — stream/task identity comes from URL params (via `useParams()`), and server data lives in SWR. Stream/task switches call `reset()` to clear stale client state.

Each page Server Component pre-loads all desktop data (stream content, task content, chats) in parallel and wraps panel content in `SWRConfig` with a `fallback` — making data available on the very first render, including SSR. No `useLayoutEffect`, no timing gaps.

Holds client-only state that child components need:

- **Stream override:** `selectedStream` — for chat contexts outside the `(desktop)` route group where `useParams()` has no stream param
- **Run activity:** `activitySteps`, `statusLine` (from NDJSON stream)
- **Run actions:** loading/stopping state, action functions
- **UI state:** `filesPanelOpen`, `approvalDismissed`, task setup fields

```typescript
// Identity comes from URL params, not the store:
const streamSlug = useStreamSlug() // useParams().stream ?? selectedStream
const taskSlug = useParams().task // directly from URL

// Server data comes from SWR:
const taskContent = useTaskContent()
const status = useTaskStatus()
const chats = useChatsList()

// Client-only state comes from the store:
const isRunActive = useIsRunActive()
const [filesOpen, setFilesOpen] = useFilesPanelOpen()
```

### `chatStore` — Chat State (Factory Pattern)

Manages chat messages, streaming state, and pending questions/confirmations. Uses `createChatStore()` factory for per-session isolation. The store instance is shared between floating and sidebar chat modes via `ChatSessionProvider` — a narrow React context that holds the store reference (not state values). Components subscribe via Zustand selectors for granular re-renders.

```typescript
const chatStore = useChatSessionStore() // from context — the store reference
const messages = chatStore((s) => s.messages)
const isStreaming = chatStore((s) => s.isStreaming)
```

### `streamsStore` — Stream Listing

Global stream list for the sidebar and launch routing. Singleton store via `create()` — the streams list is truly global, not scoped to a stream. Populated by `StreamsDataProvider` (headless, mounted in root layout).

```typescript
// Selector hooks — primitive/single-reference selectors, no useShallow needed
const streams = useStreams() // StreamEntry[]
const isLoading = useStreamsLoading() // boolean
const mutate = useStreamsMutate() // (() => void) | null
```

Stable `EMPTY` array constant avoids new references on every render (React 19 + `useSyncExternalStore` gotcha). The `mutate` ref is stored so any component (e.g., HomeComposer) can trigger a refresh after creating a stream.

### `windowStore` — Desktop Windows

Manages floating desktop windows (open, close, focus, move, resize). Singleton store, no factory.

```typescript
const windows = useWindowStore((s) => s.windows)
const openWindow = useWindowStore((s) => s.openWindow)
```

Key lifecycle methods:

- `clearAll()` — removes all windows (called on stream switch via `DesktopDataProvider` mount)
- `closeTaskWindows(streamSlug, taskSlug)` — removes task-specific windows (plan, inputs, debug panels, and file windows under the task directory). Called reactively via a `desktopStore.subscribe()` whenever `activeTaskSlug` changes away from a value — fires regardless of navigation path

### Server-Side Seeding + SWR Hydration

Data flows into Zustand stores in two phases: **server-side seeding** for instant first paint, then **SWR hydration** for ongoing freshness.

**Phase 1 — SWRConfig fallback (first frame, including SSR):** Each page Server Component pre-loads desktop data (stream content, task content, chats) via `readStreamContent()`, `readTaskContent()`, and `listChats()` in parallel. The page wraps its panel view in `SWRConfig` with a `fallback` prop. `useSWR` hooks inside the panel view read fallback data synchronously on the first render — no effect timing, no loading state, no layout shift. The SSR HTML includes fully-rendered panel content.

**Phase 2 — SWR revalidates:** `DesktopInitializer` (in the persistent layout) makes a single SWR fetch to `GET /api/fs/desktop?stream={slug}&task={taskSlug}` which returns all desktop data in one response. The SWR key is derived from URL params, so it changes automatically on navigation. This revalidates the fallback data and keeps the cache fresh.

**Why SWR fetch is still needed:** SWRConfig fallback provides initial data, but SWR still revalidates in the background (stale-while-revalidate). On client-side navigation, the new page route provides fresh fallback data via its own SWRConfig. SWR also handles revalidation after mutations (file writes, run start/stop, renames).

**Provider components:**

- **`StreamsDataProvider`** — headless (renders `null`). Mounted in `app/layout.tsx` (root layout, outside any stream boundary). Runs SWR fetch for `/api/fs/streams`, pushes results into `streamsStore` via `setStreamsData`. Always active — the stream list is available app-wide.
- **`DesktopInitializer`** — headless (renders `null`). Reads stream/task identity from URL params via `useParams()`. Resets client-only state on navigation, manages window persistence, makes a single SWR fetch for all desktop data, and handles run activity streaming.
- **`ChatSessionProvider`** — creates a `chatStore` instance, manages session lifecycle (load history, create session), and provides the store reference via React context.

SWR handles _when to fetch_ (key-based revalidation on navigation, event-driven revalidation during runs). Zustand handles _how to distribute_ (client-only state via selector hooks, fine-grained re-renders).

### Selector Hooks

Each store exports focused selector hooks. For `desktopStore`, selectors call `useDesktopStore` directly — it's a global singleton, no context lookup needed:

```typescript
// stores/desktopStore.ts — client-only state from Zustand
export function useStreamSlug(): string {
  const params = useParams<{ stream?: string }>()
  const selected = useDesktopStore((s) => s.selectedStream)
  return selected ?? params.stream ?? ''
}
export const useIsRunActive = () => useDesktopStore((s) => s.isRunActive)

// hooks/use-desktop-data.ts — server data from SWR
export function useTaskStatus(): RunStatus {
  /* reads from useDesktopData() */
}
export function useChatsList(): ChatItem[] {
  /* reads from useDesktopData() */
}
```

Identity hooks (`useStreamSlug`, `useParams().task`) read URL params directly — no store detour, so values are correct on the first frame. Server data hooks read from SWR. Client-only state hooks read from Zustand. Components call selectors directly — no prop drilling.

## Chat Route and Session Management

### Chat Route

**`POST /api/chat`** — Streaming chat endpoint for Q in learning mode.

Request: `{ message: string, sessionId: string, streamSlug: string }`
Response: Streaming `Response`

When the agent calls `AskUserQuestion`, the SDK fires the `canUseTool` callback (see [Agent Configuration](agent-config.md)). The assistant message with the `tool_use` block has already streamed to the client, which renders the question UI as a floating popover above the composer (see [Chat](chat.md)). The `canUseTool` callback blocks on an in-memory pending-question promise. The user selects an option and the client calls `POST /api/chat/answer` with `{ sessionId, answers }`. The server resolves the promise, `canUseTool` returns the answer, and the SDK continues within the **same** `query()` call — the NDJSON stream stays open and new events flow through the existing connection. No `resume`, no second `POST /api/chat` call.

**`POST /api/chat/answer`** — Resolves a pending `AskUserQuestion` or tool confirmation callback.

Request: `{ sessionId: string, toolUseId?: string, answers?: Record<string, string>, allow?: boolean, deny?: boolean }`
Response: `{ ok: true }` or `{ error: string }`

The answer endpoint handles three cases:

- **`answers`** — resolves the promise in the pending-question store (`lib/chat/pending-questions.ts`), keyed by `sessionId`.
- **`allow`** — resolves the promise in the pending-confirmation store (`lib/chat/pending-confirmations.ts`), keyed by `toolUseId`. Requires `toolUseId`.
- **`deny`** — tries pending-question first (keyed by `sessionId`), falls through to pending-confirmation (keyed by `toolUseId`) if no question is pending.

**Pending question store** (`lib/chat/pending-questions.ts`): Server-only in-memory store, keyed by `sessionId`. Two functions:

- `waitForAnswer(sessionId)` — creates a Promise, stores its `resolve` function in the Map, returns the Promise (called by `canUseTool`)
- `submitAnswer(sessionId, answers)` — looks up the entry, calls `resolve(answers)`, deletes the entry (called by the answer route)

**Pending confirmation store** (`lib/chat/pending-confirmations.ts`): Server-only in-memory store, **keyed by `toolUseId`** (not `sessionId`) so multiple blocking tools in the same assistant turn each get their own slot. Two functions:

- `waitForConfirmation(toolUseId)` — creates a Promise, stores its `resolve` function in the Map, returns the Promise (called by `canUseTool`)
- `allowConfirmation(toolUseId)` / `denyConfirmation(toolUseId)` — looks up the entry, calls `resolve(true/false)`, deletes the entry (called by the answer route)

**`POST /api/chat/stop`** — Aborts an active learning-mode chat session.

Request: `{ sessionId: string }`
Response: `{ status: 'stopping' }` or `{ error: string }`

Active sessions are tracked in `lib/chat/active-sessions.ts` — a process-level `Map<string, AbortController>` (stored on `globalThis` to survive Next.js dev-mode bundle isolation). Three functions:

- `registerSession(sessionId)` — creates an `AbortController`, stores it, and aborts any stale session with the same ID. Called by the chat route before `query()`.
- `abortSession(sessionId)` — calls `abort()` on the controller and removes it. Called by the stop route.
- `clearSession(sessionId)` — removes the entry without aborting. Called in the chat route's `finally` block for normal completion cleanup.

#### SDK Message Types

The chat route filters `SDKMessage` events to what the client needs:

| SDK Message Type             | What it carries                                                 | Client use                                                                                                                              |
| ---------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `SDKPartialAssistantMessage` | Token-level stream events (with `includePartialMessages: true`) | Real-time text rendering                                                                                                                |
| `SDKAssistantMessage`        | Complete assistant turn (text + tool calls)                     | Final message state, `AskUserQuestion` tool call interception                                                                           |
| `SDKToolProgressMessage`     | Tool execution progress                                         | Rendered as `ToolProgressIndicator` steps (label + detail + elapsed time); also created from `content_block_start` with `tool_use` type |
| `SDKResultMessage`           | Final result with usage stats, cost, errors, permission denials | End of response, error + permission denial surfacing                                                                                    |

Other types (`SDKSystemMessage`, `SDKStatusMessage`, `SDKHookResponseMessage`, etc.) are consumed server-side for logging and diagnostics — not forwarded to the client.

#### Multi-Turn Display

A single `query()` call can produce multiple `SDKAssistantMessage` events — one per agentic turn (e.g., read files → analyze → call CreateTask → summarize). Each turn's `assistant` event carries only that turn's content blocks.

The client creates a **new assistant message for each turn** — simple, like Claude Code. Each tool call, each response, just visible. No grouping, replacing, or transforming.

- **Turn detection:** The `message_start` stream event signals a new turn. When the current assistant message already has content or tool calls, mark it `isStreaming: false` and create a new message.
- **Text content:** Partial (streaming) events build up text via append on the current message. The `assistant` event text is a fallback only — `m.content || text`, never `text || m.content`.
- **Tool calls:** Only arrive in `assistant` events. Attached to the current active message.
- **Tool progress sources:** Two sources feed tool progress. (1) `content_block_start` with `tool_use` type creates a progress step immediately when the model starts calling a tool — this gives instant feedback before the SDK's `tool_progress` events arrive. (2) `tool_progress` events update elapsed time on existing steps or add new ones. The chatStore deduplicates by `toolUseId`. Client-side MCP prefix stripping (`mcp__q__Task` → `Task`) happens in the chatStore at `content_block_start` handling, ensuring progress labels are human-readable immediately.
- **Tool progress for completed turns:** Completed turns show checkmarks on all their progress steps. Historical messages (loaded from JSONL) generate tool progress from `toolCalls` with `elapsedSeconds: 0`.

**MCP tool name normalization.** The SDK prefixes MCP tool names with `mcp__{server}__` (e.g., `mcp__q__CreateTask`). The chat route strips this prefix from `tool_use` content blocks in `assistant` events before forwarding. The chatStore also strips MCP prefixes during `content_block_start` processing for tool progress — this ensures labels are human-readable even before the `assistant` event arrives with server-stripped names.

**Tool error surfacing.** The SDK does not emit per-tool error messages. Instead, tool-level errors are carried on `SDKResultMessage`:

- **Execution errors** (`errors: string[]` on `SDKResultError`) — forwarded as `ChatResultEvent.errors`. The client joins them into a single error string.
- **Permission denials** (`permission_denials: SDKPermissionDenial[]` on both success and error results) — forwarded as `ChatResultEvent.permissionDenials` with MCP prefixes stripped. The client surfaces them as "Tool permission denied: {names}" so the user knows tools were blocked, even if the model worked around the denial.

#### Session Management

**Q in learning mode (chats):** The session ID is the chat's identity. On first message, the app generates a session ID (UUID), creates the `.chats/{session-id}/` directory with a `chat.json` metadata file (see [Filesystem Layout](filesystem-layout.md)), and passes the session ID to `query()`. Subsequent messages resume the session via `query({ options: { resume: sessionId } })`. The SDK persists session state to disk natively — the app passes session IDs and the SDK handles conversation continuity and pending tool calls. The client does not send message history and the server does not maintain in-memory state between requests.

On page refresh or navigation back to an existing chat, the app reads the session ID from the route parameter (which matches the `.chats/` directory name) and resumes the SDK session.

**Q in planning/working mode:** Each iteration generates a fresh session ID — no state carries over between iterations (see [Working](working.md)).

#### Planning Trigger

When Q determines it's time to create a task, it emits a `CreateTask` tool call — an auto-approved action (in `allowedTools`, non-blocking). The client renders the tool call as a "Start Task" card with a "Skip" option. When the user clicks "Start Task", the client executes `createTask()` + `setupTaskFromChat()` from `lib/actions.ts` to create the task directory structure and move files, starts Q in planning mode via `POST /api/run/start` with `mode: 'planning'`, and opens the task on the Desktop. If the user clicks "Skip", the task creation is skipped and the SDK continues.

Planning is a completely separate `query()` call from the chat session — no shared state, no stream held open. The filesystem is the handoff: inputs are on disk, Q reads them cold. See [Planning](planning.md).

## Plan Generation

The planning flow — from "Start Task" through Q invocation to `plan.md` appearing on the Desktop — is defined in [Planning](planning.md). Data Flow's role is the Pattern Assignment table entries above (`POST /api/run/start`, plan generation liveness, task content via SWR).

**Event-driven revalidation during active runs:** During active runs, task content SWR is revalidated by three deterministic signals — no polling. (1) **File writes:** A `PostToolUse` hook on the planning/working agent fires after `Write`/`Edit` tool calls and sends a `task_content_changed` event through the run activity NDJSON stream (`GET /api/run/stream`) via `broadcast()`. The client's `useRunActivity` hook receives the event and triggers `mutateTask()`. (2) **Iteration boundaries:** The `SDKResultMessage` at each iteration boundary triggers an immediate `mutate()` call for the task content key via `lastResultAt`. (3) **Stream close:** When the run ends and the activity stream closes, one final `mutateTask()` ensures terminal `.run.json` state is reflected. Outside active runs, SWR uses default behavior (revalidate on window focus only).

**Event-driven revalidation during learning:** The learning agent (chat mode) has no active run or SSE stream — it communicates via `/api/chat` NDJSON, not `/api/run/stream`. When the agent writes files (playbook, specs) via the SDK's `Write` or `Edit` tools, a `PostToolUse` hook fires server-side and sends a `stream_content_changed` event through the chat NDJSON stream via `notifyClient`. The chat store receives this event and calls `mutate(streamContentKey(streamSlug))` to revalidate stream content immediately. This is how desktop icons transition from disabled (40% opacity) to active after the agent drafts a playbook or spec — without page refresh or polling. See [Agent Config](agent-config.md) for hook configuration.

## Live Updates During Runs

The iteration loop, SDK streaming mechanics, and iteration-boundary signals are defined in [Working](working.md). Data Flow's role is the Pattern Assignment table entries above (`GET /api/run/stream`, task content via SWR) and the SWR refetch strategy described in Plan Generation above.

## Testing

SWR fetcher:

- [x] `FetchError` preserves HTTP status codes (`lib/swr.test.ts`)
- [x] `fetcher` parses JSON, throws FetchError on non-2xx (`lib/swr.test.ts`)

NDJSON streaming:

- [x] `readNDJSON` handles partial line buffering, multi-byte UTF-8, trailing data (`lib/ndjson.test.ts`)

Server actions:

- [x] All server actions validate paths and propagate errors (`lib/actions.test.ts`)

Filesystem helpers:

- [x] Read layer: tests across readTextFile, listDirectory, listChats, listAllTaskItems, readStreamContent, readTaskContent, streamExists, readStreams (`lib/fs/read.server.test.ts`)
- [x] Write layer: ensureDirectory, writeTextFile, clearDirectory with path validation (`lib/fs/write.server.test.ts`)
- [x] Path construction and traversal prevention (`lib/fs/paths.test.ts`)

API routes — filesystem:

- [x] GET /api/fs/stream returns StreamContent or 404 (`app/api/fs/stream/route.test.ts`)
- [x] GET /api/fs/streams returns StreamEntry[] (`app/api/fs/streams/route.test.ts`)
- [x] GET /api/fs/task returns TaskContent or 404 (`app/api/fs/task/route.test.ts`)
- [x] GET /api/fs/file returns file content or 404 (`app/api/fs/file/route.test.ts`)
- [x] GET /api/fs/download serves binary with Content-Disposition, rejects traversal (`app/api/fs/download/route.test.ts`)
- [x] POST /api/fs/reveal validates platform and path (`app/api/fs/reveal/route.test.ts`)
- [x] GET /api/fs/chats returns chat sessions for a stream (`app/api/fs/chats/route.test.ts`)
- [x] GET /api/fs/active-tasks returns active runs across all streams (`app/api/fs/active-tasks/route.test.ts`)

API routes — chat:

- [x] POST /api/chat streams NDJSON, filters SDK messages, handles errors (`app/api/chat/route.test.ts`)
- [x] POST /api/chat/answer resolves questions, confirmations, and denials with priority (`app/api/chat/answer/route.test.ts`)
- [x] GET /api/chat/history reads JSONL with fallback scanning (`app/api/chat/history/route.test.ts`)
- [x] POST /api/chat/stop aborts active session (`app/api/chat/stop/route.test.ts`)

API routes — run:

- [x] POST /api/run/start validates mode, checks task existence, returns 409 if active (`app/api/run/start/route.test.ts`)
- [x] POST /api/run/stop handles race conditions (`app/api/run/stop/route.test.ts`)
- [x] GET /api/run/stream returns NDJSON with correct headers (`app/api/run/stream/route.test.ts`)
- [x] GET /api/run/active returns active run info or null (`app/api/run/active/route.test.ts`)

Zustand stores:

- [x] chatStore: messages, streaming, tool calls, multi-turn, error handling, pending confirmations, auto-naming, file annotations, resume flag, MCP prefix stripping (`stores/chatStore.test.ts`)
- [x] windowStore: open/close/focus/move/resize windows, z-index ordering, meta updates (`stores/windowStore.test.ts`)
- [x] streamsStore: setStreamsData updates, stable EMPTY array default, selective mutate update (`stores/streamsStore.test.ts`)
- [x] desktopStore: setStreamSlug, setChats, initialStreamContent/initialTaskContent seeding, taskError, defaults (`stores/desktopStore.test.ts`)

Not tested (integration-level, not unit):

- Event-driven SWR revalidation during active runs (`task_content_changed` events)
- `mutate(key)` revalidation pattern after server actions
- [x] ChatSessionProvider pending message consumption from sessionStorage (home → stream handoff — see [Home](home.md)) (`components/features/desktop/chat-session-provider.test.tsx`)

## Design Decisions

**SWR for fetching, Zustand for distribution.** The filesystem is Q's source of truth. SWR handles caching, deduplication, and revalidation — it knows _when_ to fetch. Zustand stores act as the distribution layer: headless providers push SWR results into stores, and components subscribe via selector hooks. This eliminates prop drilling while keeping SWR as the single fetching mechanism. The filesystem is the ultimate source of truth; SWR is the cache; Zustand is how components access the cache.

**API routes for reads, server actions for user writes.** API routes with GET handlers are the right pattern for fetching data — they support caching, can be called from `fetch()` / SWR, and match HTTP semantics. Server actions are designed for mutations — file uploads, creating streams and tasks. Agent writes bypass both because agents run server-side with direct filesystem access via SDK tools.

**One data-fetching pattern.** Filesystem + SWR for all file-backed data. No server component data loading. This eliminates a judgment call on every component ("is this initial load or dynamic data?").

**`lib/fs/` owns assembly, API routes are pass-through.** `lib/fs/` functions know what files make up a stream or task and return structured typed data. API routes parse params, call the helper, and return JSON. If the task structure changes, you update helpers — not routes. The shared types in `lib/fs/types.ts` are the contract between server and client, preventing shape drift.

**Colocated server and filesystem.** Q's server and filesystem live on the same machine — whether that's the user's laptop or a private VM. "Local" describes the server-filesystem relationship, not the client-server relationship. On a VM, the browser is remote but the server still reads local disk in microseconds. This means: don't build distributed-system sync infrastructure, don't optimize for network latency on reads, and keep complexity proportional to a local app. The API route layer is a browser limitation workaround, not a network abstraction.

**Path validation in helpers, not callers.** `lib/fs/` helpers call `validatePath()` internally before any filesystem operation. This makes path traversal impossible regardless of who calls the helper — API routes, server actions, or future code paths. Security at the lowest layer, impossible to forget.

**Client-side `mutate(key)` for revalidation.** After a server action writes to disk, the calling component calls `mutate(key)` to refresh the affected SWR cache. No `revalidatePath()`. The component knows what data changed; the refetch hits local disk and returns instantly. For transitions where instant feedback matters (task creation, sidebar seeding), optimistic cache pre-population is used via `mutate(key, data, false)`.

**Server actions in a single file.** Server actions (`createStream`, `renameStream`, `uploadFile`, `createTask`, `setupTaskFromChat`, `createChatSession`, `deleteChat`, `deleteTaskByLocation`) live in one file (`lib/actions.ts`). `createStream` creates the stream directory with user-provided slug and standard subdirectories (`specs/`, `samples/`). `createChatSession` creates the `.chats/{sessionId}/` directory with a `chat.json` metadata file before the first `POST /api/chat` call. `uploadFile` stages to `.chats/{sessionId}/uploads/` at the workspace root. `createTask` creates `task.md` with frontmatter and the description in the body at root `tasks/{slug}/`; `setupTaskFromChat` moves uploads from `.chats/{sessionId}/uploads/` to `inputs/`. `deleteChat` hard-deletes the `.chats/{sessionId}/` directory.

**Push-based liveness via SDK streaming.** The working loop already calls `query()` per iteration — the server pipes those SDK messages to the client via `GET /api/run/stream`, same pattern as the chat route. Run state lives on disk in `.run.json`, read via SWR. Two established patterns, no custom event channel.

## Acceptance Criteria

### Read path

- [x] `lib/fs/paths.ts` exports `streamPath()`, `taskPath()`, `tasksDir()`, `chatPath()`, and `validatePath()` (imports `HAPPYHQ_ROOT` from `@/lib/constants` internally)
- [x] `lib/fs/read.server.ts` returns `null` for missing files/directories (ENOENT), throws for other errors
- [x] `lib/fs/write.server.ts` creates directories and writes files; calls `validatePath()` internally before any write
- [x] `lib/fs/` helpers reject any path that resolves outside `~/HappyHQ/` — path validation is automatic, not per-caller
- [x] `lib/fs/types.ts` defines `TaskContent`, `StreamContent`, `StreamEntry`, and `FileEntry` types; API routes return them, client components consume them
- [x] API routes in `app/api/fs/` expose stream, task, file, and newest-stream-by-birthtime data as JSON
- [x] API routes in `app/api/fs/` do not import from `fs` or `fs/promises` — all filesystem access goes through `lib/fs/` helpers
- [x] SWR fetcher configured in `lib/swr.ts` with `FetchError` class preserving HTTP status codes; components distinguish 404 (empty state) from 500 (error state)
- [x] Components consume file data via `useSWR()` with API route keys
- [x] During active runs, SWR task content is revalidated by event-driven signals: `task_content_changed` (file writes), `result` (iteration boundaries), and stream close (terminal state)

### Write paths

- [x] `lib/actions.ts` exports `createStream`, `renameStream`, `deleteStream`, `createTask`, `setupTaskFromChat`, `deleteTaskByLocation`, `toggleTaskDone`, `writeTaskTitle`, `writeTaskDescription`, `uploadFile`, `createChatSession`, `deleteChat`, `checkStreamExists`, `updateTaskStream`, `ingestTaskInput`, `deleteTaskInput` as server actions with `'use server'` directive
- [x] Server actions return `void` and throw on failure
- [x] Server actions call `lib/fs/write.server.ts` helpers for filesystem operations
- [x] After a successful server action, calling component calls `mutate(key)` to refresh the affected SWR cache
- [x] `createStream(slug)` creates directory with user-provided slug and standard subdirectories
- [x] `createTask()` creates `tasks/{slug}/task.md` with frontmatter per [Filesystem Layout](filesystem-layout.md)
- [x] `uploadFile()` stages files to `.chats/{sessionId}/uploads/` and returns the sanitized filename
- [x] `setupTaskFromChat()` creates subdirectories (`inputs/`, `working/`, `outputs/`) and moves files from `.chats/{sessionId}/uploads/` to `tasks/{taskSlug}/inputs/`. The task description is written to `task.md` body by `createTask()` upstream.

### Chat streaming

- [x] `POST /api/chat` streams NDJSON responses from `query()` via `ReadableStream`
- [x] Chat route filters SDK messages — only `partial`, `assistant`, `tool_progress`, and `result` events forwarded to client
- [x] Session management via `resume` parameter — first message creates session, subsequent messages resume
- [x] `createChatSession(sessionId, streamSlug?)` creates `.chats/{sessionId}/` directory with `chat.json` before first API call
- [x] Zustand `chatStore` manages chat messages, streaming state, and tool call handling (not SWR — chat messages are ephemeral streaming data)
- [x] Multi-turn `assistant` events within a single `query()` create separate messages per turn — each `message_start` event spawns a new assistant message, Claude Code style
- [x] `canUseTool` callback on Q (learning mode) `query()` handles `AskUserQuestion` by blocking on pending-question store, denies other un-approved tools
- [x] `POST /api/chat/answer` resolves pending `AskUserQuestion` callback; returns `{ ok: true }` or `{ error }` with appropriate status codes
- [x] `lib/chat/pending-questions.ts` provides in-memory pending-question store with `waitForAnswer` and `submitAnswer`
- [x] `POST /api/chat/stop` aborts active session via `lib/chat/active-sessions.ts`; active sessions tracked with `Map<string, AbortController>` on `globalThis`

### Live updates

- [x] During active runs, server signals client to refetch after each iteration; client calls `mutate(key)` on affected caches

### Stores

- [x] Zustand `chatStore` manages chat messages, streaming state, and pending questions/confirmations
- [x] Zustand `windowStore` manages floating desktop windows (open, close, focus, move, resize)
- [x] Zustand `desktopStore` manages stream/task content, navigation, run state, and UI state — hydrated from SWR via `DesktopDataProvider`
- [x] Zustand `streamsStore` manages global stream listing — singleton store, hydrated from SWR via `StreamsDataProvider`

### State distribution

- [x] `desktopStore` exports selector hooks for stream identity, navigation, content, run state, and UI state
- [x] `StreamsDataProvider` bridges SWR fetches into `streamsStore` — renders null, mounted in root layout
- [x] `DesktopDataProvider` bridges SWR fetches into `desktopStore` — renders null, no UI
- [x] `ChatSessionProvider` shares chat store instance via React context (reference, not state)
- [x] Components read shared state from stores via selectors, not props
- [x] Fine-grained selectors prevent unnecessary re-renders

### Negative constraints

- [x] No `db.useQuery()` or InstantDB imports in `/app/`
- [x] No server component data loading for file-backed content
- [x] No `revalidatePath()` or `revalidateTag()` — revalidation is client-side via `mutate(key)`
- [x] No components calling `useSWR()` directly for shared data — read from stores instead
- [x] No prop drilling for data available in stores — components self-serve via selector hooks
