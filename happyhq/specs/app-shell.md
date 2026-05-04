# App Shell

Routing, navigation, and transitions.

## Purpose

Define the app's routing structure, navigation patterns, and view transitions. Individual view layouts are defined in their own specs — this spec owns what connects them.

## Chats & Tasks

A stream contains two types of entities:

- **Chats** — Conversations with Q, powered by Q in learning mode. Can be Q&A, exploration, stream setup, or the lead-up to a task.
- **Tasks** — Units of work that Q executes, powered by Q in planning/working mode. Created when a user clicks a "Start Task" structured message in a chat.

Chats contain structured "Start Task" messages when Q identifies actionable work. Clicking one creates a task directory and opens the task on the Desktop. The message becomes "View Task" for future access. Both chats and tasks are accessible from the Desktop's icons and windows.

The onboarding/setup flow is just the first chat in a stream — no special mode, no separate logic from the user's perspective (may be a different prompt/mode under the hood).

## Q's Presence

No separate Q widget, no FAB. Q is integrated into each view — not bolted on. How Q appears in each view is defined in that view's spec.

## Routes

| Route                   | View                      | Spec                  |
| ----------------------- | ------------------------- | --------------------- |
| `/`                     | Home — greeting, composer | [Home](home.md)       |
| `/{stream}`             | Desktop                   | [Desktop](desktop.md) |
| `/{stream}/task/{task}` | Desktop (task open)       | [Desktop](desktop.md) |
| `/login`                | Password gate             | [Auth](auth.md)       |
| `/setup`                | Credential setup          | [Auth](auth.md)       |

All routes render inside the global sidebar layout (see [Sidebar](sidebar.md)). The sidebar is present on every route — `/`, `/{stream}`, `/{stream}/task/{task}` — providing stream navigation and top-level actions. The `/` home route renders the `HomePage` component — a unified experience with greeting and composer regardless of whether streams exist. See [Home](home.md).

Chat is no longer a separate route — it's a surface within the Desktop (floating in the island or in a sidebar panel). See [Chat](chat.md). Tasks open on the Desktop, not on a separate page. The same `HappyDesktop` component handles both; opening a task uses client-side navigation (pushState) without a page reload.

**Routing implementation:** All three routes are served by a single Next.js catch-all page at `app/[stream]/[[...slug]]/page.tsx`. This is critical — stream and task views must share one page boundary so that pushState navigation between them doesn't unmount/remount the Desktop. Do not split this into separate page routes for streams and tasks; that causes full page reloads when crossing the page boundary.

Stream and task slugs are human-readable directory names. The route prefix `/task/` mirrors the `tasks/` directory on disk.

### Stream Creation

Streams can be created in two ways:

**Via the home composer** (top "New" button navigates to `/`):

1. User types a message in the home composer and submits
2. `HomeComposer` creates the stream (using a temp UUID slug) and chat session in parallel, stores the pending message in `sessionStorage`, and navigates to `/{slug}`
3. `ChatSessionProvider` on the stream page picks up the pending message and sends it as the first chat message

The user can also select an existing stream from the `StreamContextSelector` dropdown in the composer to start a new chat in that stream instead of creating a new one.

See [Home](home.md) for the full data flow.

**Via the sidebar** (manual — "Streams" `+` button):

1. User clicks the `+` button next to the "Streams" group label in the sidebar
2. The sidebar navigates to `/stream/new` (a dedicated route under `app/(desktop)/stream/new/`)
3. The page collects a name, validates/converts to a slug, calls `createStream(slug)`, then navigates to the new stream

See [Sidebar](sidebar.md).

## App Launch

On launch, the home page (`/`) shows a unified experience — greeting and composer — regardless of whether streams exist. See [Home](home.md). The global sidebar lists all streams sorted newest-first by birthtime. No auto-redirect.

A stream is any top-level directory under `~/HappyHQ/` excluding dot-prefixed directories (`.git`, `.q`, etc.) (see [Filesystem Layout](filesystem-layout.md)).

**Why birthtime, not mtime:** If Q is actively writing files in an old stream when the user creates a new stream, mtime on the old stream would keep updating and the sidebar could incorrectly reorder. Birthtime is stable and represents true creation time. Runs on macOS where birthtime is reliable.

No persistence (localStorage, config files) is needed. The filesystem is the source of truth. `GET /api/fs/streams` uses birthtime from `fs.stat()` for ordering (see [Data Flow](data-flow.md)).

## Transitions

All transitions happen within the Desktop — there are no separate page routes to navigate between.

- **Desktop → Chat:** User clicks the island to expand the composer. Types and sends a message. Chat opens in the island (or sidebar).
- **Opening a task:** User clicks a task in the Tasks directory window. Client-side pushState to `/{stream}/task/{task}`.
- **Chat → Task:** User clicks "Start Task" in a chat message. Task is created, planning starts, task opens on the Desktop. The message becomes "View Task."
- **Closing a task:** × on task indicator pill or browser back. Client-side pushState to `/{stream}`.

No full-page reloads between modes. The Desktop component manages its own active task state.

## Design Decisions

**One view.** The Desktop is the only view. The stream is always there; tasks open on top of it. This avoids jarring page transitions and keeps the user grounded. See [Desktop](desktop.md).

**Chat is a surface, not a route.** Chat used to be a separate page at `/{stream}/chat/{id}`. Now it's a panel that appears within the Desktop — floating from the island or in a sidebar. This keeps the user in their spatial context. See [Chat](chat.md).

**Chats and tasks as first-class stream entities.** A stream isn't just a list of tasks — it's a collection of conversations and work. Chats surface learning, exploration, and task setup. Tasks surface execution. Both are accessible from the Desktop's icons and windows.

**Q is integrated, not a widget.** No floating button, no FAB, no bolt-on feel. Q lives in the island and sidebar — contextual, always appropriate to the moment.

**Onboarding is just the first chat.** No special empty-stream state. The Desktop always looks the same — progressive content fills in as Q learns. The first chat is the teaching conversation, starting from the island's composer.

**Global sidebar for stream navigation.** The sidebar lives in the root layout so it persists across stream transitions. Since `useDesktopStore` is a global singleton, the sidebar can import it directly when needed. Stream switching is full Next.js navigation — each stream re-mounts `DesktopDataProvider`, which reseeds the global store.

**Human-readable slugs for streams and tasks.** The filesystem is the single source of truth, no mapping layer needed. Chat session IDs (UUIDs) are internal — no longer exposed in URLs since chat is not a route.

**Route prefix mirrors the filesystem.** `/task/` in routes matches `tasks/` on disk. No ambiguity about which entity type a slug refers to.

**Birthtime for ordering, no persistence.** Streams are sorted newest-first by `fs.stat()` birthtime. No localStorage, no config files, no "last active" tracking. The filesystem is the source of truth. Birthtime is stable — mtime would be fragile because Q writing files to an old stream would update its mtime.

## Acceptance Criteria

- [x] Routes: `/{stream}`, `/{stream}/task/{task}` (task open)
- [x] Home composer creates stream with AI-generated slug; navigates to `/{slug}`
- [x] First message in a stream creates a chat session (no route change — chat is a surface within the Desktop)
- [x] User can navigate directly to any route (deep linking works for streams and open tasks)
- [x] Page refresh returns to the same view (route-driven, no client-only state for navigation)
- [x] Invalid stream routes redirect to `/`; invalid task routes redirect to `/{stream}`
- [x] Stream ↔ task transitions use client-side pushState (no full-page reloads)
- [x] Sidebar lists all streams sorted newest-first by birthtime
- [x] Home page shows unified experience (greeting, composer) regardless of stream count — see [Home](home.md)
- [x] `GET /api/fs/streams` uses birthtime from `fs.stat()` for ordering
- [x] Global sidebar shows all streams, active stream highlighted
- [x] Clicking a stream in the sidebar navigates to that stream

## Testing

Route-level behaviors tested through component tests:

- [x] Home composer creates stream with temp slug and navigates (`components/features/home/home-composer/home-composer.test.tsx`)
- [x] Desktop navigation: pushState for stream↔task transitions (`components/desktop/desktop-navbar.test.tsx`)
- [x] Stream list sorted newest-first by birthtime (`lib/fs/read.server.test.ts`)
- [x] GET /api/fs/streams returns StreamEntry[] with birthtimes (`app/api/fs/streams/route.test.ts`)

Not tested:

- [ ] Invalid stream route redirects to `/` (catch-all page server component logic)
- [ ] Invalid task route redirects to `/{stream}` (catch-all page server component logic)
- [ ] Deep link handling: direct navigation to `/{stream}/task/{task}` renders correctly
- [ ] Browser back/forward via popstate listener restores correct task state

## Edge Cases

- **No stream exists yet:** Home page shows the same greeting and composer as always. User can type in the composer to create their first stream, or use the sidebar "New" button (which navigates to `/`). See [Home](home.md).
- **Direct navigation to a task URL:** Works — Desktop opens with the task open. × on the task pill closes the task.
- **Invalid stream slug:** Redirect to `/`. **Invalid task slug:** Redirect to `/{stream}` — if the stream exists, the user lands on the stream; if not, redirects to `/`.
- **Page refresh:** Returns to the same view (route-driven, no client-only state).
- **Browser back/forward:** Handled via `popstate` listener in the Desktop component. The Desktop parses the URL to determine whether a task is open.
- **Multiple stream directories, all old:** Most recently created (birthtime) wins regardless of age. No staleness concept.
- **User deletes the active stream directory via Finder:** On next load, app falls back to the most recently created remaining stream, or first-launch state if none remain.
- **Q is writing files to old stream when user creates new stream:** Birthtime ensures the new stream remains visible. Old stream's mtime may update, but birthtime does not change.

## Constraints

- Password gate when deployed (`Q_PASSWORD`); Anthropic credential setup on first use. See [Auth](auth.md).
- Stream switching via the global sidebar. The sidebar lists all streams; clicking one navigates to it. New streams via the home composer (top "New" button navigates to `/`) or via the sidebar's manual create dialog (Recents `+` button). Streams and tasks can be renamed and deleted from the sidebar's three-dots menus (see [Sidebar](sidebar.md)).
- Runs locally or deployed to Fly.io. See [Deployment](deployment.md).
- Light mode only. No dark mode, no workspace color themes.
- Slugs for streams and tasks. Chat sessions are internal (SDK session IDs, not in URLs).

## Cross-References

- [Home](home.md) — Home page greeting and composer
- [Sidebar](sidebar.md) — Global sidebar with stream list and top-level actions
- [Desktop](desktop.md) — The single unified view, layout, icons, windows, navigation
- [Island](island.md) — The contextual bottom-center control surface
- [Chat](chat.md) — Chat surfaces (floating and sidebar)
- [Filesystem Layout](filesystem-layout.md) — directory structure for streams, chats, and tasks
- [Data Flow](data-flow.md) — how views read/write data
- [Planning](planning.md) — "Start Task" flow and task creation
- [Learning](learning.md) — first-session behavior, teaching flow
- [Agent Configuration](agent-config.md) — SDK session management, chat persistence, planning and working modes
