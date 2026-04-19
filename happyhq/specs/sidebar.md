# Global Sidebar

Stream navigation and top-level actions, always visible on the left edge.

## Purpose

Provide persistent navigation between streams and access to top-level actions (New, Search, Memories). The sidebar replaces the previous "single stream, no switching" model — multi-stream navigation becomes first-class. Uses the existing sidebar primitive with `collapsible="icon"` mode: always visible, collapsing to a thin icon rail that never fully disappears.

## Related Specs

- [App Shell](app-shell.md) — Routing, stream creation, app launch
- [Desktop](desktop.md) — Layout anatomy (sidebar column added)
- [Data Flow](data-flow.md) — SWR patterns for stream list

## Layout

Full-height left column, outside the content area. The navbar and canvas sit inside the content column to the right of the sidebar.

```
Expanded (~250px):              Collapsed (48px):
┌──────────────────┐            ┌────┐
│ + New             │            │ +  │
│ 🔍 Search         │            │ 🔍 │
│ 📝 Memories       │            │ 📝 │
├──────────────────┤            │    │
│ Streams          │            │    │
│  ● Stream A      │            │    │
│    Stream B      │            │    │
│    Stream C      │            │    │
│                  │            │    │
└──────────────────┘            └────┘
```

When collapsed: only the three top action icons remain visible. The stream list disappears entirely (like how Claude hides conversations when the sidebar is collapsed).

## Top Actions

Full sidebar menu items (icon + label) in a `SidebarGroup` at the top:

| Item     | Icon         | Tooltip    | Behavior            |
| -------- | ------------ | ---------- | ------------------- |
| New      | `Plus`       | "New"      | Navigates to `/`    |
| Search   | `Search`     | "Search"   | No-op (placeholder) |
| Memories | `LibraryBig` | "Memories" | No-op (placeholder) |

The `New` button has distinctive styling: the `Plus` icon is wrapped in a `rounded-full` container with `ring-3 ring-current/10`, creating a circled plus that distinguishes it from Search and Memories.

When expanded: icon + label text, like standard sidebar items. When collapsed: icon-only with tooltips on hover. These are the items that remain visible in collapsed mode.

## Stream List

Below a `SidebarSeparator`, a `SidebarGroup` with label "Recents".

- Each stream is a `SidebarMenuItem` with a `SidebarMenuButton` wrapping a `Link` to `/{stream.name}`.
- Active stream: `isActive={stream.name === currentStreamSlug}` — uses the primitive's `data-[active=true]` styling.
- Display name: `formatSlug(stream.name)` for human-readable title (kebab-case → Title Case).
- Sorted newest-first by birthtime (same order as `GET /api/fs/streams`).
- Click (same stream): `navigateToStream()` — client-side store action, no page re-render.
- Click (different stream): `<Link>` falls through to Next.js navigation (re-mounts `DesktopDataProvider` which reseeds `useDesktopStore` with the new stream's data).
- Task click (same stream): `navigateToTask(slug)` — client-side store action.
- Task click (different stream): `<Link>` falls through to Next.js navigation.
- **Hidden when collapsed:** The entire "Recents" `SidebarGroup` is hidden in icon mode via `group-data-[collapsible=icon]:hidden`. The `SidebarSeparator` above it is also hidden when collapsed.

## Collapse Behavior

Uses the sidebar primitive's `collapsible="icon"` mode:

- **Expanded:** `--sidebar-width: 250px`. Shows icon + label for action items, stream list with group label.
- **Collapsed:** `--sidebar-width-icon: 48px` (3rem). Top action icons remain with tooltips. Stream list hidden entirely.
- **Never offcanvas:** The sidebar never fully disappears. In collapsed mode it remains as a 48px icon rail.
- **Default state:** `SidebarProvider` is initialized with `defaultOpen={false}` — the sidebar starts closed on first load until the cookie establishes a preference.
- **Cookie persistence:** The sidebar primitive persists open/closed state in a cookie (`sidebar_state`), surviving page reloads.
- **Keyboard shortcut:** `Cmd+L` toggles (built into `SidebarProvider`).
- **Toggle button:** In `SidebarHeader`. When expanded: the header shows the logo (linking to `/`) on the left and a `PanelLeftClose` button on the right. When collapsed: only a `PanelLeftOpen` `SidebarMenuButton` is shown (the expanded header is hidden via `group-data-[collapsible=icon]:hidden`).

## Styling

Uses the sidebar primitive in its standard form — no custom context variants.

- **Variant:** `sidebar` (default). Gives the natural `border-r` divider on the left side.
- **Background:** `--sidebar` CSS variable overridden to `oklch(0.93 0.01 80)` (matching `--desktop-bg`). `bg-black/5` layered on `SidebarContent` for subtle darkening per spec.
- **Border:** `--sidebar-border` CSS variable overridden to `rgba(0, 0, 0, 0.05)` for a subtle tint. The primitive's built-in `group-data-[side=left]:border-r` picks up this value automatically.
- **Full height:** `h-svh` (built into the primitive).

## Data

Follows the app's SWR → Zustand pattern (see [Data Flow](data-flow.md)):

- **Store:** A global `streamsStore` holds the streams list. Created via `create()` — a global singleton, same pattern as `desktopStore` and `windowStore`.
- **Provider:** A headless `StreamsDataProvider` (renders null) fetches via `useSWR<StreamEntry[]>('/api/fs/streams', fetcher)` and pushes results into `streamsStore` via a setter. Mounted in the root layout alongside `SidebarProvider`.
- **Components read from store:** The sidebar reads streams via `useStreams()` selector hook. The home page reads `useStreamsLoading()` to disable the composer while loading (see [Home](home.md)).
- **Current stream:** `usePathname()` to extract the first path segment as the stream slug. Not `useParams()` — the sidebar lives outside the `[stream]` route segment, so `useParams()` would not have access to the stream param.
- **Revalidation:** On focus (SWR default). No polling — streams change rarely.
- **Mutation:** When a stream is created, the `StreamsDataProvider`'s mutate function (stored in `streamsStore`) refreshes the list.

## Component Structure

```
GlobalSidebar
├── SidebarHeader (logo + collapse toggle)
│   └── SidebarMenu
│       ├── SidebarMenuItem (expanded: logo + PanelLeftClose) — hidden when icon-only
│       └── SidebarMenuItem (collapsed: PanelLeftOpen expand button) — shown only when icon-only
├── SidebarContent
│   ├── SidebarGroup (top actions — visible at all sizes)
│   │   └── SidebarMenu
│   │       ├── SidebarMenuItem: New (with Tooltip) — navigates to /
│   │       ├── SidebarMenuItem: Search (with Tooltip) — no-op
│   │       └── SidebarMenuItem: Memories (with Tooltip) — no-op
│   ├── SidebarSeparator (hidden when collapsed)
│   └── SidebarGroup ("Recents") — hidden when collapsed
│       └── SidebarMenu
│           └── SidebarMenuItem * N (SidebarMenuButton + Link)
└── SidebarFooter (account component, see Account Footer section)
```

### Account Footer

When `NEXT_PUBLIC_ACCOUNTS_ENABLED` is `'true'`, a `SidebarFooter` renders `AccountFooter` at the bottom of the sidebar. Follows the standard shadcn sidebar account pattern — a compact row that expands into a dropdown menu.

**Collapsed state (icon mode):** Avatar only (user initial circle).

**Expanded state:** Avatar + email + chevron. Clicking opens a `DropdownMenu` anchored to the footer.

**Dropdown menu items:**

| Item         | Behavior                                                                                         |
| ------------ | ------------------------------------------------------------------------------------------------ |
| Current plan | `TierBadge` shows capitalized tier name (e.g., "Starter") — display only, disabled menu item     |
| Usage        | `UsageIndicator` shows remaining time (e.g., "42 min left") with color-coded text — display only |
| Billing      | Opens `/settings#billing`                                                                        |
| Log out      | Clears InstantDB session, redirects to login                                                     |

**Usage color coding:** `UsageIndicator` uses red text when < 25% remaining, amber when ≤ 50%, normal otherwise.

**Billing data:** `useBillingData()` hook queries InstantDB for the user's active subscription and current-period usage, returning `currentTier`, `usedMinutes`, `includedMinutes`, `remainingMinutes`, and `remainingPercent`.

Billing-specific items (TierBadge, UsageIndicator, Billing link) are conditionally shown within the dropdown when `NEXT_PUBLIC_BILLING_ENABLED` is also `'true'`. When billing is off but accounts are on, the dropdown shows a Settings link instead of a Billing link.

**When `NEXT_PUBLIC_ACCOUNTS_ENABLED` is off:** `SidebarFooter` is not rendered. No account UI. This is the open source / demo / tester experience.

The `GlobalSidebar` lives in the root layout. Since `useDesktopStore` is a global singleton, the sidebar can import it directly when needed (no context required).

## Where It Mounts

`SidebarProvider` + `StreamsDataProvider` + `GlobalSidebar` + `SidebarInset` in `app/layout.tsx` (the root layout). The sidebar is present on every route — `/`, `/{stream}`, `/{stream}/task/{task}`.

```
SidebarProvider (style={{ '--sidebar-width': '250px' }})
├── StreamsDataProvider (headless: SWR → streamsStore)
├── Sidebar (side="left", collapsible="icon")
│   └── GlobalSidebar content (reads from streamsStore)
└── SidebarInset
    └── {children} (/ → Home page, /{stream} → DesktopDataProvider + HappyDesktop)
```

This keeps the sidebar above the stream boundary — it persists across stream transitions and renders on the home page. `SidebarInset` renders as `<main>`, so `HappyDesktop` should use `<div>` instead of `<main>` to avoid nesting.

## Stream & Task Actions

Each stream row shows action buttons on hover (right-aligned, absolute-positioned):

1. **Three-dots menu** (`Ellipsis` icon) — `StreamDropdownMenu` with actions

Each task row shows a three-dots menu on hover:

1. **Three-dots menu** (`Ellipsis` icon) — `TaskDropdownMenu` with actions

### Stream Menu

| Item   | Icon        | Behavior                                                                          |
| ------ | ----------- | --------------------------------------------------------------------------------- |
| Rename | `SquarePen` | Opens `NameInputDialog` pre-filled with current stream name                       |
| Delete | `Trash2`    | Shows `DeleteAlert` confirmation dialog, then deletes stream and navigates to `/` |

### Task Menu

| Item   | Icon        | Behavior                                                                                  |
| ------ | ----------- | ----------------------------------------------------------------------------------------- |
| Rename | `SquarePen` | Opens `NameInputDialog` pre-filled with current task name                                 |
| Delete | `Trash2`    | Shows `DeleteAlert` confirmation dialog, then deletes task and calls `navigateToStream()` |

### Confirmation Dialogs

All destructive actions (stream delete, task delete, task restart) show a confirmation alert before executing. `DeleteAlert` and `RestartAlert` are reusable components that wrap the Catalyst `Alert` primitive. The user must explicitly confirm before any deletion or restart proceeds. Task restart confirmation is shown when the user clicks "Start Over" in the dynamic island (see [Island](island.md)).

### Run Status Badge

Task items in the sidebar show a spinner badge when a run is active (`status === 'planning'`, `plan_ready`, or `working`). The badge has a tooltip showing the current phase: "Planning" for `planning`/`plan_ready`, "Working" for `working`. This gives ambient awareness of task activity without opening the task.

When `status === 'stopped'` and `stopReason === 'budget'`, the badge shows a violet `Pause` icon with tooltip "Paused" — indicating the run was stopped due to billing limits. Other stop reasons show an amber `CircleAlert` with tooltip "Agent stopped".

### Create Stream

The `+` button next to the "Recents" group label opens a `NameInputDialog` for creating a new stream.

The top sidebar "New" button (circled plus) is unchanged — continues navigating to `/` for the AI-assisted home composer flow. These are two distinct paths: AI-assisted (home composer generates name from conversation) vs. manual (user provides name directly).

**Dialog config:** `title="New stream"`, `defaultValue=""`, `submitLabel="Create"`.

**Submit flow:**

1. Convert input to slug via `toSlug()` (shared utility in `lib/format.ts`).
2. If slug is empty after cleanup, set error "Please enter a valid name" and return.
3. Pre-check: call `checkStreamExists(slug)`. If true, set error "A stream with this name already exists" and return.
4. Call `createStream(slug)` server action — creates stream dir + `specs/`, `samples/`.
5. Call `mutateStreams()` to refresh the sidebar stream list via SWR.
6. Close the dialog.
7. Navigate to `/${slug}` via `router.push()`.

**No auto-suffix on collision.** The AI-assisted flow appends `-2`, `-3` because the user never chose the name. For manual creation, the user typed it — show an error and let them pick a different name.

**Git:** `syncGitState()` catches the new directory before the next agent session. No explicit git operation needed on create.

### Create Task (Conversation-First)

The `+` button on each stream item starts a **task-discovery chat** rather than creating an empty task directory. This is the conversation-first entry point — Q learns what the user needs before creating the task via `CreateTask`.

**Flow:**

1. User clicks `+` on a stream item.
2. The sidebar stashes the stream slug in `sessionStorage` (`q-home-message` key) and dispatches a custom `q-start-task-chat` event.
3. The chat session provider picks up the event, opens the chat sidebar, and starts a new learning session scoped to that stream.
4. Q checks the stream's playbook and specs to understand what's available, asks the user what they need, and calls `CreateTask` when it has enough context.

This replaces the previous `NameInputDialog` approach where tasks were created as empty shells. The conversation-first model ensures Q always has rich context before planning begins. Manual task creation via a dialog is deferred (see [bugs-enhancements.md](../.dev/bugs-enhancements.md)).

### Rename Stream

Opens from the stream menu's "Rename" item. Uses `NameInputDialog` with `title="Rename stream"`, `defaultValue={formatSlug(stream.name)}`, `submitLabel="Rename"`.

**Working/planning task guard:** The "Rename" menu item is disabled (via `disabled` prop on `DropdownItem`) when any task in the stream has `run.status === 'working'` or `run.status === 'planning'`. A tooltip on hover explains: "Rename is available once the task finishes". The `renameDisabled` prop is computed from the task list and passed to `StreamDropdownMenu`.

**Submit flow:**

1. Convert input to slug via `toSlug()`.
2. If slug is empty after cleanup, set error "Please enter a valid name" and return.
3. If slug equals the current `stream.name`, close the dialog (no-op rename).
4. Check for working tasks (if not already checked on open). If any `task.run?.status === 'working'`, set error "Cannot rename while a task is working" and return.
5. Check for collision: call `checkStreamExists(newSlug)`. If true, set error "A stream with this name already exists" and return.
6. Call `renameStream(stream.name, newSlug)` server action — atomic `fs.rename()`.
7. Seed SWR cache: `mutate(streamContentKey(newSlug), currentData, false)` to prevent loading flash. (The sidebar does not have access to chats data, so `chatsKey` is not seeded here. The `DesktopDataProvider` refetches chats on navigation.)
8. Call `mutateStreams()` to refresh the sidebar.
9. **URL update:** If the user is viewing this stream (`pathname` starts with `/${stream.name}`), call `router.replace('/' + newSlug + remainingPath)` where `remainingPath` is the task portion of the URL if any. Full re-mount is acceptable for user-initiated rename.
10. Close the dialog.

### Task Title Editing

Task slugs are immutable identifiers (time-sortable, e.g., `bridgeway-sow-01h8k2w4`). The display title is stored in `task.md` frontmatter and can be updated via `writeTaskTitle(taskSlug, newTitle)`. Task directory renaming is not supported — the slug is a permanent identifier.

### `NameInputDialog` Component

A single reusable modal at `components/features/sidebar/name-input-dialog.tsx`, built on the Catalyst dialog and input primitives (`Dialog`, `DialogTitle`, `DialogBody`, `DialogActions` from `catalyst/dialog`, `Button` from `catalyst/button`, `Input` from `catalyst/input`, `Field` from `catalyst/fieldset`). Consistent with the sidebar's existing Catalyst dropdown usage.

**Props:**

| Prop           | Type                              | Description                                                                    |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `open`         | `boolean`                         | Controlled open state                                                          |
| `onClose`      | `() => void`                      | Called on close (overlay click, Escape). Gated: cannot close while submitting. |
| `title`        | `string`                          | Dialog title ("New stream", "Rename task", etc.)                               |
| `defaultValue` | `string`                          | Pre-filled input value — empty for create, `formatSlug(name)` for rename       |
| `submitLabel`  | `string`                          | Button text: "Create" or "Rename"                                              |
| `onSubmit`     | `(name: string) => Promise<void>` | Called with raw input on confirm. Async — modal stays open until resolved.     |

**Layout:**

```
+----------------------------------+
|  New stream                    X |
|                                  |
|  +------------------------------+
|  | My Stream Name               |
|  +------------------------------+
|  A stream with this name         |
|  already exists.                 |
|                                  |
|               [Cancel] [Create]  |
+----------------------------------+
```

**Behavior:**

- Input auto-focuses on open. Inside a `<form>` — Enter submits.
- Submit button disabled when input is empty/whitespace-only.
- Error string displayed as `text-sm text-red-600` below the input. Cleared on next keystroke.
- While `onSubmit` is in-flight, the submit button is disabled and the dialog cannot be closed (`onClose` is gated by `isSubmitting`).
- On success (no throw), the caller sets `open` to `false`.
- Pre-fill for rename: `defaultValue` is set to `formatSlug(currentSlug)` — user sees "Email Intros" and edits naturally. Slug conversion on submit re-kebab-cases it.
- `DialogActions` contains Cancel (`Button plain`, disabled while submitting) and Submit (`Button type="submit"`).

### `toSlug()` Utility

Shared slug conversion in `lib/format.ts`:

```typescript
export function toSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
}
```

This is the same cleanup logic used by the sidebar rename dialog.

### New Server Actions

Add to `lib/actions.ts`:

| Action              | Signature                            | Purpose                                             |
| ------------------- | ------------------------------------ | --------------------------------------------------- |
| `checkStreamExists` | `(slug: string) => Promise<boolean>` | Wraps `streamExists()` from `lib/fs/read.server.ts` |

### Component Structure Update

The sidebar was decomposed from a single monolith into an atom/molecule structure for composability and testability:

```
components/features/sidebar/
  global-sidebar.tsx              # Shell: header, top actions, stream list, modals
  atoms/
    status-badge.tsx              # Run status spinner with tooltip (includes paused state)
    dropdown-menu.tsx             # Shared stream/task dropdown menu primitives
    action-buttons.tsx            # Hover-revealed action buttons (three-dots trigger)
    account-footer.tsx            # Account dropdown with tier badge, usage, billing link, logout (EE)
    usage-indicator.tsx           # TierBadge, UsageIndicator components, useBillingData() hook (EE)
  molecules/
    stream-item.tsx               # Stream row with actions, task expansion
    task-list.tsx                 # Expandable task list under a stream
    name-input-dialog.tsx         # Shared modal for create/rename operations
    delete-alert.tsx              # Confirmation dialog for destructive deletes
  hooks/
    use-stream-actions.ts         # Stream CRUD logic (create, rename, delete)
    use-task-actions.ts           # Task CRUD logic (rename, delete)
```

## Acceptance Criteria

- [x] Global sidebar renders on the left side of the app on all routes including `/`
- [x] Sidebar shows a list of all streams, sorted newest-first
- [x] Active stream is visually highlighted in the list
- [x] Clicking a stream navigates to that stream
- [x] Sidebar collapses to 48px icon rail — top action icons visible with tooltips, stream list hidden
- [x] Sidebar expands to ~250px with full icon + label items
- [x] Collapse state persists across page reloads (cookie)
- [x] Cmd+L toggles sidebar open/closed
- [x] New navigates to `/`. Search and Memories are no-ops
- [x] Navbar and canvas are inside the content area (right of sidebar), not spanning full width
- [x] Sidebar is full viewport height
- [x] Sidebar styling is subtle — blends with the app background
- [x] "Recents" `+` button opens a "New stream" dialog
- [x] Top "New" button (circled plus) still navigates to `/` for AI-assisted flow
- [x] Stream item `+` button starts a task-discovery chat (conversation-first — see Create Task section)
- [x] Stream three-dots menu shows "Rename" above "Delete"
- [x] Task three-dots menu shows "Rename" above "Delete"
- [x] Rename dialog pre-fills with the current human-readable name
- [x] All four operations use the same `NameInputDialog` component
- [x] Name input is auto-focused when the dialog opens
- [x] Enter key submits the form
- [x] Empty/whitespace-only input shows validation error
- [x] Slug collision shows appropriate error message
- [x] Create stream: directory created, sidebar updates, navigates to `/{slug}`
- [x] Create task: directory created with empty context.md, sidebar updates, navigates to `/{stream}/task/{slug}`
- [x] Rename stream: directory renamed, sidebar updates, URL updates if viewing that stream
- [x] Rename task: directory renamed, sidebar updates, URL updates if viewing that task
- [x] Cannot rename a stream while any of its tasks has `run.status === 'working'` or `'planning'`
- [x] Cannot rename a task while it has `run.status === 'working'` or `'planning'`
- [x] Working/planning guard disables the Rename menu item with an explanatory tooltip
- [x] Dialog cannot be closed while a submission is in-flight
- [x] No-op rename (same name) closes dialog without filesystem operation
- [x] `toSlug()` utility used by rename modal
- [x] `checkStreamExists` server action added to `lib/actions.ts`

## Edge Cases

- **No streams:** Stream list section is empty. The sidebar still renders with action buttons.
- **One stream:** List shows one item, highlighted as active.
- **Many streams (>20):** `SidebarContent` scrolls (`overflow-auto` is built into the primitive).
- **Long stream names:** Truncated with ellipsis (built into `SidebarMenuButton`).
- **Stream created while sidebar is open:** `mutate('/api/fs/streams')` after `createStream()` — the new stream appears in the list.
- **Stream deleted externally:** Next SWR revalidation (on focus) removes it from the list.
- **Launch page (`/`):** Sidebar shows stream list but no stream is highlighted as active (no `streamSlug` in params).
- **Empty input after slug cleanup:** User types `---` or `!!!` — cleanup produces empty string. Error: "Please enter a valid name."
- **Slug collision on create:** Error shown in dialog: "A stream/task with this name already exists." User picks a different name.
- **No-op rename:** User opens rename and submits without changing. `newSlug === currentSlug` — close dialog, no filesystem op.
- **Rename to equivalent slug:** User changes "Email Intros" to "email intros" — both produce `email-intros`. Detected as no-op.
- **Running/planning task blocks rename:** Rename menu item is disabled with tooltip. Dialog cannot be opened.
- **Concurrent rename from two tabs:** First succeeds, second's `renameStream` throws ENOENT (source gone). Error shown in dialog.
- **Stream with pending AI rename:** If user manually renames a stream that's mid-server-side-naming, the manual rename wins. The server-side rename in the chat route fails gracefully (keeps whatever name exists, clears shimmer).

## Constraints

- No drag-to-resize. Fixed expanded width (250px) and collapsed width (48px).
- No right-side option. Global sidebar is always on the left.
- Top "New" button navigates to `/` for AI-assisted stream creation via the home composer. The "Recents" `+` button opens the manual create dialog. Search and Memories are no-ops in v1.
- Same-stream navigation (task switching, returning to stream root) uses `navigateToTask()`/`navigateToStream()` store actions — client-side only, no page re-render. Cross-stream navigation falls through to `<Link>` / Next.js routing, which re-mounts `DesktopDataProvider` and reseeds `useDesktopStore`.

## Testing

No dedicated test files for sidebar UI. The sidebar is primarily UI rendering — icons, menu items, collapse behavior — which falls outside the testing scope per `testing.md`.

Server actions tested through existing patterns:

- [x] Stream list data shape tested via `readStreams()` (`lib/fs/read.server.test.ts`)
- [x] GET /api/fs/streams endpoint tested (`app/api/fs/streams/route.test.ts`)
- [x] `checkStreamExists` tested (`lib/actions.test.ts`)
- [x] `toSlug()` and `formatSlug()` conversion tested (`lib/format.test.ts`)

NameInputDialog validation contracts:

- [x] Empty/whitespace-only input disables submit button (`components/features/sidebar/name-input-dialog.test.tsx`)
- [x] Dialog cannot be closed while onSubmit is in-flight (isSubmitting guard) (`components/features/sidebar/name-input-dialog.test.tsx`)
- [x] Error display, error clearing on input change, state reset on reopen (`components/features/sidebar/name-input-dialog.test.tsx`)
- [x] Slug collision on stream create → error via checkStreamExists (`lib/actions.test.ts`)
- [x] Task creation uses unique time-sortable slugs — no collision detection needed
- Running task guards and no-op rename are caller-owned sidebar integration concerns (not dialog contracts)

## Cross-References

- [App Shell](app-shell.md): Routing, stream creation (AI-assisted and manual), stream switching
- [Home](home.md): AI-assisted stream creation via home composer (the top "New" button path)
- [Desktop](desktop.md): Layout anatomy, component tree
- [Data Flow](data-flow.md): SWR patterns for fetching stream list, mutation after create/rename
- [Billing](billing.md): Account footer, usage data, tier info — EE only
