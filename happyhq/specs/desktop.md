# The Desktop

A home for your work. As familiar as your own computer's desktop.

## Purpose

This is where users do their work. Teaching Q, kicking off tasks, reviewing plans, watching progress, exploring outputs. All of it happens here, on one persistent surface.

The desktop metaphor makes this natural. Files are icons. Content opens in draggable windows. There's nothing to learn. And because everything stays on one surface, users stay oriented and in control no matter what's happening.

Opening a task is like our flavour of opening an app. The desktop stays, the task's files appear alongside what's already there. Closing it returns you to seeing just the stream's files on the desktop. No page transitions, no context loss.

## Stream and Task

The desktop is the workspace. A stream's content populates it. The stream is what you're working on, the desktop is where you work on it.

- **At the stream level** (`/{stream}`): The stream's artifacts (Playbook, Specs, Samples, Tasks) appear as desktop icons on the left. The island provides chat access.
- **When a task is open** (`/{stream}/task/{task}`): Task-level icons (Inputs, plan.md, working files, outputs) appear on the right. The island shows task activity. A sidebar is available for Q interaction.

Opening and closing tasks uses client-side navigation (pushState, no page reload). The URL reflects what's open.

## Layout Anatomy

```
┌────┬──────────────────────────────────────────────────────┐
│    │  Navbar: ← Stream Name          [Viewing task ×]     │
│ G  ├──────────────────────────────────────────────────────┤
│ l  │ ┌────────┐                                           │
│ o  │ │Chat    │ ┌─────┐                       ┌─────┐    │
│ b  │ │Sidebar │ │Icons│  ┌──────────────┐     │Icons│    │
│ a  │ │overlays│ │(L)  │  │ Draggable    │     │(R)  │    │
│ l  │ │canvas  │ │     │  │ Windows      │     │     │    │
│    │ └────────┘ └─────┘  └──────────────┘     └─────┘    │
│ S  │                                                      │
│ i  │              ┌──────────────────┐                     │
│ d  │              │     Island       │                     │
│ e  │              └──────────────────┘                     │
│ b  └──────────────────────────────────────────────────────┘
│ a  │
│ r  │
└────┘

Global Sidebar is a full-height column outside the content area.
Navbar and canvas sit inside the content column (SidebarInset).
See [Sidebar](sidebar.md) for full specification.
Chat sidebar shown on left of canvas here, but can be on either side.
```

### Navbar

Top bar. Minimal.

- **Stream name (left):** Plain text `formatSlug(streamSlug)` — non-interactive, no dropdown or menu bar.
- **Task indicator (centered):** Only visible when a task is open. A pill (`rounded-full bg-black/5 backdrop-blur-sm`) showing "Viewing {task name}" with a green pulse dot (when planning/working) and a close button (×) that calls `navigateToStream()`.

### Canvas

The working area below the navbar.

- Container: `rounded-t-2xl border-x border-t border-black/5 bg-black/10` with `overflow-hidden`. Padding: `pr-1 pl-0` — flush to the left edge, 4px right padding
- Grid overlay: Subtle line grid pattern via `CANVAS_GRID_OVERLAY` from `constants.ts`
- Background color: `var(--desktop-bg)` CSS custom property on the outer frame (defined in `globals.css`)
- Click canvas background to deselect any selected icon

### Desktop Icons

macOS-style icons with labels, arranged in columns at the edges of the canvas.

**Stream icons (left side, always visible):**

| Icon     | Image          | Label    | Opens                                                          |
| -------- | -------------- | -------- | -------------------------------------------------------------- |
| Playbook | `handbook.png` | Playbook | Markdown window with `playbook.md` content                     |
| Specs    | `document.png` | Specs    | Directory window listing spec files                            |
| Samples  | `folder.png`   | Samples  | Directory window listing sample files                          |
| Tasks    | `open-app.png` | Tasks    | Directory window listing tasks (click a task → opens the task) |
| Git Log  | `activity.png` | Git Log  | Git log window showing commit history (see below)              |

**Task icons (right side, when a task is open):**

| Icon          | Image             | Label      | Opens                             |
| ------------- | ----------------- | ---------- | --------------------------------- |
| Inputs        | `folder.png`      | Inputs     | (not yet wired)                   |
| Plan          | `doc.png`         | plan.md    | Markdown window with plan content |
| Working files | `typewriter.png`  | {filename} | Markdown window with file content |
| Output files  | `spreadsheet.png` | {filename} | Markdown window with file content |

Working and output files are dynamic. One icon per file, appearing as Q creates them.

**Icon behavior:**

- Single-click to open the associated window (or focus it if already open)
- Selected state: visual highlight
- `isEmpty` indicator: dimmed when the underlying data is empty (e.g., no playbook yet, no specs yet)
- Click canvas background to deselect

**Icon component:** `DesktopIcon` renders a single icon with `<img>` and `<figcaption>`. `DesktopIconGroup` arranges a column of icons.

### Windows

Draggable floating panels for viewing content. Think macOS Finder windows on the desktop.

**Content types:**

| Type        | Component                | Used for                                         | How it opens                                                                                                                                |
| ----------- | ------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `markdown`  | `MarkdownWindow`         | Playbook, plan.md, specs, working files, outputs | Fetches text via `/api/fs/file`, renders with `react-markdown` + `remark-gfm`                                                               |
| `directory` | `DirectoryDesktopWindow` | Specs, Samples, Tasks listings                   | Lists items with icons, supports in-place navigation                                                                                        |
| `pdf`       | `PdfWindow`              | PDF samples and inputs                           | Fetches binary via `/api/fs/download`, renders with PDF.js. "View Raw" toggle shows extracted `raw.txt`                                     |
| `email`     | `EmailWindow`            | `.eml` email inputs                              | Fetches `email.json`, renders structured header (From/To/Date) + body. Window title updates to subject line. Attachment chips are clickable |
| `image`     | `ImageWindow`            | Image attachments (from emails, etc.)            | Fetches via `/api/fs/download`, renders `<img>` with `object-fit: contain`. Window auto-resizes to match image aspect ratio on load         |

**Upcoming:** As new input types are added (Word docs, spreadsheets, calendar invites, etc.), each will get a purpose-built window if the content benefits from structured rendering. Plain text formats can reuse the markdown window. See [Input Types](input-types.md) for the extraction pipeline that feeds these windows.

**Routing:** `openFileWindow()` in `use-desktop-windows.ts` routes by file extension — `.pdf` → pdf, `.eml` → email, `.docx` → markdown (loads `content.md`), image extensions → image, everything else → markdown. Each window type has its own meta interface in `windowStore.ts`.

**Window behavior:**

- Draggable within canvas bounds (Framer Motion drag constraints)
- Click to focus (bring to front via z-index management)
- Close button (× in title bar)
- File actions dropdown (for markdown windows): Copy, Download, Reveal in Finder
- Navigation slot: `DesktopWindow` accepts an optional `navigation` prop rendered to the left of the title in the title bar. When present, the title bar uses `pl-2`; when absent, `pl-4`.
- Default base position: `{ x: 160, y: 48 }` for most windows (plan window uses `{ x: 200, y: 24 }`)
- Cascading: each new window is offset `+24px` diagonally (x and y) per open window, wrapping after 8 steps — so windows don't stack on top of each other
- Default size: `576×600` for markdown, `380×420` for directory
- Reopen behavior: reopening a previously closed window resets its size to the default for its content type and clears `isMaximized`/`savedBounds`. This prevents a previously-maximized window from reopening at full-canvas dimensions at a cascade offset

**Window resizing:**

- Resize handles on all edges and corners — top, right, bottom, left, top-left, top-right, bottom-left, bottom-right
- Left/top edge drags adjust both position and size (the window origin moves as the edge is dragged)
- Minimum size: `320×200` — windows cannot be resized smaller
- Maximum size: canvas bounds — windows cannot be resized beyond the visible canvas
- `resizeWindow(id, size)` in `windowStore` — resize handles call it on pointer up (drag end)
- Cursor indicators: `col-resize` on left/right edges, `row-resize` on top/bottom edges, `nwse-resize` on top-left/bottom-right corners, `nesw-resize` on top-right/bottom-left corners
- Text selection prevention: `document.body.style.userSelect = 'none'` is set during any drag or resize operation and restored on pointer up, preventing accidental text selection

**Maximize / restore:**

- Double-click the title bar to toggle maximize/restore
- Maximize button in the title bar (between title and close button) toggles the same state
- Maximized: window fills the entire canvas edge to edge, covering icons. Position becomes `{ x: 0, y: 0 }`, size becomes canvas dimensions
- Restore: returns window to its pre-maximize position and size
- Dragging a maximized window restores it first (snap out of maximize, then drag from the grabbed point)
- Resizing a maximized window restores it first
- Maximizing also focuses the window (brings to front)

**Window state:** Managed by `windowStore` (Zustand). Tracks `id`, `title`, `isOpen`, `position`, `zIndex`, `size`, `contentType`, `isMaximized`, `savedBounds` (pre-maximize position/size), and for markdown windows `meta`:

```typescript
interface MarkdownWindowMeta {
  markdown: string
  filePath: string
  loading?: boolean
  historyLabel?: string | null // non-null when viewing a historical version (e.g. "3 min ago")
  historyHash?: string | null // commit hash of the version being viewed
  lastUpdatedAt?: number // timestamp set when markdown content changes (drives UI indicator)
}
```

`updateWindowMeta()` auto-sets `lastUpdatedAt` when markdown content changes. Actions include `toggleMaximize(id, canvasBounds)` which saves current position/size before maximizing, or restores them. `canvasBounds` is passed from the component because the store has no DOM access.

**Rendering isolation:** Each window subscribes to only its own state via `WindowRenderer` (`windows/window-renderer.tsx`), which uses `useWindowById(id)` to read a single window from the store. The parent renders a flat list of `WindowRenderer` components keyed by `useOpenWindowIds()` — a `useShallow`-wrapped selector returning only the IDs of open windows. This means updating window A's markdown content does not re-render windows B and C. Stable action references are obtained via `useWindowStore.getState()` to avoid callback invalidation on unrelated state changes.

**Update pulse:** When `lastUpdatedAt` changes (after mount), the version badge in the window title bar briefly brightens via a CSS transition pulse (`useUpdatePulse` in `windows/use-update-pulse.ts`). The hook returns a boolean that toggles a highlighted background class; a 100ms timeout plus `duration-700` transition creates a subtle pulse that coalesces during rapid updates. Both markdown and CSV windows use the shared `WindowHistoryDropdown` for version history and the update pulse.

**Directory in-place navigation:** Clicking a subdirectory inside a directory window navigates in-place rather than opening a new window. The `DirectoryDesktopWindow` wrapper (`windows/directory/directory-window.tsx`) manages this:

- **History model:** Index-based — `history: NavEntry[]` + `index: number` (-1 = root). Each `NavEntry` stores `{ items, title }`.
- **Navigate into directory:** Truncates any forward history, fetches `/api/fs/directory?path=...`, appends the result to history, increments index.
- **Back/forward buttons:** `ChevronLeft`/`ChevronRight` buttons in the title bar (via `DesktopWindow`'s `navigation` prop). Disabled when you can't go that direction (`disabled:opacity-30`). Back and forward don't re-fetch — items are cached in the history array.
- **Title updates:** The window title shows the current folder name (`formatSlug`), or the root title (e.g. "Specs") when at index -1.
- **File clicks:** Always open a new markdown window (delegated to `onFileClick`).
- **State lifecycle:** Navigation state is component-internal (React `useState`). Closing and reopening the window resets to the root. No window store changes needed.

**Auto-open behavior:** The plan window opens automatically when the task transitions to `plan_ready` status — not when plan content first appears on disk. This prevents premature opening while the planning agent is still writing `plan.md`. The trigger is the `plan_ready` status transition (tracked via `taskStatus` in the desktop store), which fires after the planning agent completes and `.run.json` is updated. Subsequent plan updates sync the window content live as Q writes incrementally.

**Live content sync:** The plan window's markdown updates in real-time as Q writes `plan.md`. Two mechanisms work together: (1) event-driven SWR revalidation — a `PostToolUse` hook sends `task_content_changed` events through the activity stream when Q writes files, triggering `mutateTask()`, and (2) a `useEffect` in `HappyDesktop` that listens to `taskContent?.plan` and pushes updated content directly into the plan window's store meta via `updateWindowMeta()`. The effect uses `getState()` to avoid subscribing to the entire windows array, skips updates when viewing a historical version (`historyLabel` is set), and guards against no-op updates where the content hasn't changed.

### Git Log Window

A stream-level window showing commit history. Component: `GitLogContent` in `windows/git-log-content.tsx`.

**Content:** Monospace list of commits, each row showing hash (amber, truncated), subject, and date. `[done]` markers are extracted from commit subjects and rendered as green badges (`bg-emerald-500/20 text-emerald-400`) at the start of the row. Stream/task prefixes like `[stream/task]` are visually highlighted.

**Scope toggle:** A button in the status bar cycles through available scopes based on context:

- In task mode: `task` → `stream` → `all`
- In stream mode: `stream` → `all`
- At root: `all` only

**Dirty files indicator:** Shows "N dirty" count (amber) in the status bar. Clickable to expand a list of uncommitted files with their git status codes (M, A, D). Refreshes via polling.

### File History Dropdown

Markdown windows show a version dropdown in the title bar. Component: `WindowHistoryDropdown` in `windows/window-history-dropdown.tsx`.

**Trigger:** A badge in the title bar showing "Current" or a historical date. Clicking opens the dropdown.

**Dropdown content:** Lists commits that touched the file, each showing a version number (v1, v2, etc. — newest is highest), commit subject (with stream/task prefixes stripped), and date. Active version shows a checkmark.

**Selecting a version:** Fetches file content at that git ref (`/api/fs/file?path=X&ref=HASH`), displays it read-only in the window. The title badge updates to show the historical date.

**Returning to current:** When viewing a historical version and the file has uncommitted changes (dirty), a "Current" option appears with a "now" timestamp. Clicking it fetches the latest file content and clears the history state.

**Reset on file change:** When the window's file path changes, version state resets.

### Island Zone

Bottom-center of the canvas. The island container uses `z-1000` to ensure it always renders above desktop windows (which have dynamic z-indexes). See [Island](island.md) for full specification.

### Sidebar Zone

Right edge of the canvas only (no user preference for position). `450px` wide, absolutely positioned at `top-1 right-1 bottom-1.5`, z-index 50. Overlays icons and windows. See [Chat](chat.md) for full specification.

### Session Persistence

Window layout survives page refreshes but resets when switching streams.

- **Storage:** `sessionStorage` keyed by stream slug (e.g., `q-desktop-windows:{streamSlug}`)
- **What's persisted:** For each window: `id`, `contentType`, `position`, `size`, `isOpen`, `isMaximized`, `savedBounds` (pre-maximize bounds, if maximized), `filePath` (for markdown/pdf/image), `directoryPath` (for directory/email). Content is NOT persisted — it's re-fetched on load. `restoreLayout` in `windowStore` reconstructs typed window state from these fields. When adding a new window type, update three places: `restoreLayout` (reconstruct), the save mapping in `desktop-data-provider.tsx`, and `SavedWindowState.contentType`
- **Save trigger:** Persist on every state change via a Zustand `subscribe` listener, debounced ~500ms
- **Restore trigger:** On `DesktopDataProvider` mount, check `sessionStorage` for the current context key. Stream windows use `happyhq:windows:{stream}`, task windows use `happyhq:windows:{stream}:{task}`.
- **Stream switch:** `clearAll()` runs on `DesktopDataProvider` mount with a new stream. The previous stream's sessionStorage entry is left as-is (overwritten on next visit)
- **Task switch:** `closeTaskWindows(streamSlug, taskSlug)` removes task-specific windows (plan, inputs, debug panels, and file windows under the task directory) when `activeTaskSlug` changes. This is a reactive subscription on `desktopStore` — fires regardless of which navigation path triggered the change
- **Tab isolation:** `sessionStorage` is per-tab, so multiple tabs with different streams don't conflict

## Navigation

The Desktop uses client-side navigation to open and close tasks without page reloads. All navigation goes through `desktopStore` actions which update both store state and the browser URL via `pushState`.

**Store actions:**

- `navigateToTask(slug)` — sets `activeTaskSlug`, pushes `/{stream}/task/{slug}`
- `navigateToStream()` — clears `activeTaskSlug`, pushes `/{stream}`

**Opening a task:**

- Click a task in the sidebar → `navigateToTask(slug)` (same-stream) or `<Link>` fallback (cross-stream)
- Click a task in the Tasks directory window → `navigateToTask(slug)`
- Click "Start Task" in chat → creates task, starts planning, calls `navigateToTask(slug)`
- Direct URL (deep link) → `taskSlug` prop seeds `activeTaskSlug` on mount

**Closing a task:**

- Click × on the task indicator pill → `navigateToStream()`
- Click stream name in sidebar → `navigateToStream()` (same-stream) or `<Link>` fallback (cross-stream)
- Browser back button → `popstate` listener syncs `activeTaskSlug` from URL

**Window cleanup:** A reactive `desktopStore.subscribe()` watches `activeTaskSlug`. When it changes away from a value, `windowStore.closeTaskWindows()` removes task-specific windows (plan, inputs, debug panels, file windows under the task path). This fires regardless of navigation path — store actions, popstate, or any other mechanism.

**Sidebar navigation normalization:** The sidebar uses `navigateToTask()`/`navigateToStream()` for same-stream navigation (intercepting `<Link>` clicks with `preventDefault`). For cross-stream navigation, the `<Link>` falls through to Next.js routing, which triggers a page re-render and `DesktopDataProvider` remount.

**Browser back/forward:** A `popstate` event listener in `DesktopDataProvider` parses the current URL path to determine if a task slug is present, syncing `activeTaskSlug` without calling `pushState` again.

**Deep links:** The page component receives `taskSlug` as a prop from the route and passes it to `DesktopDataProvider`, which seeds `activeTaskSlug` so the Desktop opens with the task already open.

## Data Layer

Data flows from the filesystem through SWR into Zustand stores, and components self-serve from stores. See [Data Flow](data-flow.md) for the full architecture.

**Store creation:** `useDesktopStore` is a global singleton store (module-level `create()`) with a `reset()` action, like `windowStore` and `streamsStore`. No React context needed — components import `useDesktopStore` directly.

**Data flow:** The page Server Component pre-loads all desktop data (stream content, task content, chats) in parallel and passes it to `DesktopDataProvider` as `initialData`. The provider seeds the store via `reset()` in a `useEffect` and provides the data as SWR `fallbackData` for instant first paint.

**Single SWR fetch:** `DesktopDataProvider` (headless, renders null) makes one SWR call to `GET /api/fs/desktop?stream={stream}&task={task}` which returns all desktop data in a single response. One `useEffect` pushes the data into `desktopStore`. The SWR key changes when `activeTaskSlug` changes (client-side task navigation), triggering a refetch automatically.

- **Stream content:** `streamContent` — playbook, specs, samples. Tasks and chats are fetched separately (root-level entities with stream affiliation via metadata).
- **Task content:** `taskContent` — plan, run status, files, outputs, inputs (null when no task active).
- **Task event stream:** NDJSON from `GET /api/run/stream` → `desktopStore.activitySteps` for real-time activity steps during active runs. Also carries `task_content_changed` events that trigger SWR revalidation.

**Chat state:** `ChatSessionProvider` creates a `chatStore` instance per Desktop mount and shares it via React context. Both floating and sidebar chat modes read from the same store instance.

**Component access:** Child components read from stores directly via selector hooks — no prop drilling through intermediate layers.

## Component Tree

`HappyDesktop` in `components/features/desktop/happy-desktop.tsx`. Takes zero props — reads everything from stores.

The root layout (`app/layout.tsx`) wraps in the sidebar provider, and the page component (`app/[stream]/[[...slug]]/page.tsx`) sets up the desktop provider tree:

```
SidebarProvider (in app/layout.tsx, present on all routes)
├── StreamsDataProvider (headless: SWR → streamsStore)
├── Sidebar (GlobalSidebar — reads from streamsStore)
└── SidebarInset
    ├── DesktopDataProvider (headless, returns null: seeds store + single SWR fetch → desktopStore)
    └── ChatSessionProvider (chat store instance via context)
            └── HappyDesktop (thin layout shell, zero props)
                ├── DesktopNavbar (reads from desktopStore)
                ├── Canvas
                │   ├── DesktopIconGroup (reads from desktopStore + windowStore)
                │   ├── Windows (reads from windowStore + desktopStore for content)
                │   └── Bottom stack
                │       ├── PlanApproval (reads from desktopStore)
                │       └── DynamicIsland (reads from desktopStore + chatStore)
                └── ChatSidebar (reads from chatStore via context)
```

## Design Decisions

**One view, not separate pages.** The desktop is always there. Opening a task adds task content to it. Closing it returns to just the stream. No page transitions, the user stays grounded.

**Desktop metaphor over list/feed.** A files-first product deserves a files-first experience. Icons and windows make artifacts feel like real things you work with, not items in a list.

**Client-side navigation.** PushState avoids full page reloads. The Desktop component manages its own active task state, with the URL as a reflection of that state. Browser back/forward works via popstate. Both `/{stream}` and `/{stream}/task/{task}` are served by one catch-all page route (`app/[stream]/[[...slug]]/page.tsx`) so that stream↔task navigation stays within a single page boundary. Never use `router.push`/`router.replace` for stream↔task transitions — only pushState. Next.js router is only for cross-page navigation (e.g., to `/`).

**Auto-open plan.** The plan is the most important artifact during a task run. Auto-opening it when it arrives means the user sees Q's thinking without having to click anything.

**Store-based distribution, not prop drilling.** HappyDesktop was a 422-line orchestrator threading data through 2-4 intermediate layers. Components like ChatSidebar existed as pure prop passthroughs. By pushing SWR data into Zustand stores via headless providers, every component self-serves. This follows the pattern established in HappyHQ where InstantDB data flows into Zustand stores and components subscribe directly via selector hooks.

## Acceptance Criteria

**Stream-level desktop:**

- [x] Stream icons (Playbook, Specs, Samples, Tasks) appear on the left side of the canvas
- [x] Single-clicking an icon opens its window (or focuses it if already open)
- [x] Icons show `isEmpty` dimmed state when underlying data is empty
- [x] Clicking canvas background deselects any selected icon

**Windows:**

- [x] Markdown windows render content via react-markdown + remark-gfm
- [x] Directory windows list items with optional subtitles and badges
- [x] Windows are draggable within canvas bounds
- [x] Clicking a window brings it to front (z-index)
- [x] Windows have a close button (×)
- [x] Markdown windows have a file actions dropdown (Copy, Download, Reveal in Finder)

**Window resizing:**

- [x] All edges and corners (8 handles) are draggable resize handles
- [x] Windows respect minimum size (320×200)
- [x] Windows cannot be resized beyond canvas bounds
- [x] Cursor changes to appropriate resize cursor on handle hover

**Maximize/restore:**

- [x] Double-click title bar toggles maximize/restore
- [x] Maximize button in title bar toggles state
- [x] Maximized window fills entire canvas
- [x] Restore returns to previous position and size
- [x] Dragging or resizing a maximized window restores it first

**Session persistence:**

- [x] Window layout survives page refresh (F5)
- [x] Switching streams starts fresh (clearAll behavior preserved)
- [x] Switching/closing tasks closes task-specific windows (closeTaskWindows)
- [x] Content is re-fetched via SWR, not persisted

**Tasks on the desktop:**

- [x] Opening a task adds task icons (Inputs, plan.md, working files, outputs) on the right side
- [x] Task indicator pill appears in navbar showing task name with close button
- [x] Green pulse dot on pill when task is planning/working
- [x] Closing a task removes task icons and closes task windows
- [x] Plan window auto-opens on `plan_ready` status transition (not on content arrival)
- [x] Plan window content syncs live as Q writes incrementally

**Navigation:**

- [x] Opening/closing tasks uses client-side navigation (pushState, no page reload)
- [x] URL reflects current state (`/{stream}` or `/{stream}/task/{task}`)
- [x] Browser back/forward works via popstate listener
- [x] Deep links work (direct URL with task slug opens with task active)

**Git log window:**

- [x] Git Log icon appears in stream-level icons (left side)
- [x] Window shows commit history with hash, subject, and date
- [x] `[done]` markers render as green badges
- [x] Scope toggle cycles through task/stream/all based on context
- [x] Dirty files count shown in status bar, expandable to file list

**File history dropdown:**

- [x] Markdown windows show a version badge in the title bar
- [x] Dropdown lists commits that touched the file with version numbers
- [x] Selecting a historical version shows read-only content at that ref
- [x] "Current" option returns to the latest version when viewing history

**Working files / outputs:**

- [x] One icon per file, appearing dynamically as Q creates them
- [x] Clicking opens a markdown window with file content

## Testing

No dedicated test files for the Desktop shell. The Desktop is primarily UI rendering — icons, windows, drag behavior, canvas layout — which falls outside the testing scope per `testing.md`.

Behaviors tested through component and hook tests:

- [x] Desktop icons: stream icons (playbook, specs, samples, tasks) and task icons (plan, inputs, files, outputs), empty state marking, click handlers (`components/desktop/hooks/use-desktop-icons.test.ts`)
- [x] Desktop windows: file path derivation, openOrFocusWindow (create or raise), openDirectoryWindow (`components/desktop/hooks/use-desktop-windows.test.ts`)
- [x] DesktopDataProvider: hydrates desktopStore with stream/task content and run state from SWR (`components/desktop/desktop-data-provider.test.tsx`)
- [x] DesktopNavbar: renders stream name, task breadcrumbs, navigates on click (`components/desktop/desktop-navbar.test.tsx`)
- [x] ChatSidebar: renders sessions, shows names, switches on select, deletes on confirmation (`components/desktop/chat-sidebar.test.tsx`)
- [x] Directory window helpers: getDirectoryItems, handleDirectoryItemClick, getDirectoryEmptyMessage (`components/desktop/windows/directory/helpers.test.ts`)
- [x] Window store: open/close/focus/move/resize, z-index ordering, meta updates, toggleMaximize, restoreWindow, restoreLayout, openWindow layout preservation (`stores/windowStore.test.ts`)
- [x] Chat actions: send, stop, newChat, switchChat, deleteChat, answerQuestion, startTask, confirmations (`components/desktop/hooks/use-chat-actions.test.ts`)
- [x] Tool label and detail helpers for activity display (`lib/chat/tool-labels.test.ts`)

Not tested (UI rendering, skip per testing.md):

- DesktopIcon/DesktopIconGroup rendering and selection
- Window drag, resize handles, z-index focus, close button visual behavior
- Window maximize/restore UI (button, double-click, drag-to-restore)
- Session persistence integration (sessionStorage read/write in DesktopDataProvider)
- plan.md auto-open when content arrives via SWR
- Canvas grid overlay and background styling
- Task indicator pill in navbar

## Cross-References

- [Sidebar](sidebar.md): Global sidebar with stream list and top-level actions
- [Island](island.md): The contextual bottom-center control surface
- [Chat](chat.md): Chat surfaces (floating and sidebar)
- [App Shell](app-shell.md): Routing, stream creation, app launch
- [Data Flow](data-flow.md): SWR patterns, API routes, server actions
- [Filesystem Layout](filesystem-layout.md): What lives on disk
