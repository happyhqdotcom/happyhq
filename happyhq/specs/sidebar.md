# Global Sidebar

Stream navigation and top-level actions, always visible on the left edge.

## Purpose

Provide persistent navigation between streams and access to top-level actions (New task, Home, Chat). Uses the shadcn sidebar primitive with `collapsible="icon"` mode: always visible, collapsing to a thin icon rail that never fully disappears.

## Related Specs

- [App Shell](app-shell.md) — Routing, stream creation, app launch
- [Desktop](desktop.md) — Layout anatomy (sidebar column added)
- [Data Flow](data-flow.md) — SWR patterns for stream list

## Layout

Full-height left column, outside the content area. The navbar and canvas sit inside the content column to the right of the sidebar.

```
Expanded (~250px):              Collapsed (48px):
┌──────────────────┐            ┌────┐
│ ⊕ New task        │            │ ⊕  │
│ 🏠 Home           │            │ 🏠 │
│ 💬 Chat           │            │ 💬 │
├──────────────────┤            │    │
│ Streams       +  │            │    │
│  # Stream A      │            │    │
│    Stream B      │            │    │
│    Stream C      │            │    │
└──────────────────┘            └────┘
```

When collapsed: only the three top action icons remain visible. The "Streams" group disappears entirely.

## Top Actions

Full sidebar menu items (icon + label) in a `SidebarGroup` at the top, rendered by `ActionButtons`:

| Item     | Icon             | Tooltip    | Behavior                                                       |
| -------- | ---------------- | ---------- | -------------------------------------------------------------- |
| New task | `Plus` (circled) | "New task" | Opens `TaskCreateDialog`                                       |
| Home     | `Home`           | "Home"     | Navigates to `/tasks`. Active on `/tasks` and `/tasks/inbox/*` |
| Chat     | `MessageCircle`  | "Chat"     | Navigates to `/chat`. Active on `/chat` and `/chat/*`          |

The `New task` icon is wrapped in a `rounded-full` container with `bg-current/10 ring-3 ring-current/10` for the circled-plus look that distinguishes it from Home and Chat.

When expanded: icon + label text, like standard sidebar items. When collapsed: icon-only with tooltips on hover.

## Stream List

Inside `SidebarContent`, a `SidebarGroup` with label "Streams" and a `+` `SidebarGroupAction`.

- Each stream is a `SidebarMenuItem` with a `SidebarMenuButton` wrapping a `Link` to `/tasks/{stream.name}`.
- Active stream: `isActive` is true when `pathname` equals or starts with `/tasks/{stream.name}` or `/{stream.name}` — covers both the canonical `/tasks/{stream}` route and the legacy `/{stream}` form.
- Display name: `displayTitle(stream.title, stream.name)` (preferring the human-readable title, falling back to the slug).
- Stream icon: `Hash`.
- Sorted newest-first by birthtime (same order as `GET /api/fs/streams`).
- **Empty state:** When `streams.length === 0`, a disabled "No streams" item is shown.
- **Attention badge:** A red `SidebarMenuBadge` shows the count of pending tasks per stream, computed from the `taskItems` SWR cache (`pending` frontmatter flag, grouped by `stream`). The badge is hidden when the count is zero.
- **Hidden when collapsed:** The entire "Streams" `SidebarGroup` is hidden in icon mode via `group-data-[collapsible=icon]:hidden`.
- The `+` group action navigates to `/stream/new` via `router.push()` — it does not open a dialog.

## Collapse Behavior

Uses the sidebar primitive's `collapsible="icon"` mode:

- **Expanded:** ~250px. Shows icon + label for action items, full stream list with group label.
- **Collapsed:** `--sidebar-width-icon: 48px` (3rem). Top action icons remain with tooltips. Stream list hidden entirely.
- **Never offcanvas:** The sidebar never fully disappears. In collapsed mode it remains as a 48px icon rail.
- **Default state:** `defaultOpen` is resolved by the `(app)` layout — the `sidebar_state` cookie wins if present, otherwise `config.general.sidebarDefault === 'open'` decides (see [Settings](settings.md)).
- **Cookie persistence:** The sidebar primitive persists open/closed state in the `sidebar_state` cookie, surviving page reloads.
- **Keyboard shortcut:** `Cmd+L` toggles (built into `SidebarProvider`).
- **Toggle button:** In `SidebarHeader`. When expanded: the header shows the logo (linking to `/tasks`) on the left and a `PanelLeftClose` button on the right. When collapsed: only a `PanelLeftOpen` `SidebarMenuButton` is shown.

## Styling

Uses the sidebar primitive in its standard form — no custom context variants.

- **Variant:** `sidebar` (default). Gives the natural `border-r` divider on the left side.
- **Full height:** `h-svh` (built into the primitive).

## Data

Follows the app's SWR-as-source-of-truth pattern (see [Data Flow](data-flow.md)):

- **Initial seed:** `app/(app)/layout.tsx` calls `readStreams()` server-side and passes `initialStreams` to `GlobalSidebar`. Used as the render seed before SWR resolves.
- **SWR cache:** `WorkspaceInitializer` (mounted in the `(app)` layout) warms the SWR cache for `/api/fs/streams`.
- **Reading:** The sidebar reads streams via the `useStreams()` selector (SWR-backed, `revalidateOnFocus: false`). Uses `storeStreams.length > 0 ? storeStreams : initialStreams` to avoid a flash before SWR hydrates.
- **Task items:** A separate `useSWR<TaskItem[]>(taskItemsKey(), fetcher)` powers the per-stream attention badges.
- **Revalidation:** Driven by `useStreamsMutate()` after server-action mutations (create, rename, delete) elsewhere in the app.

## Component Structure

```
GlobalSidebar (components/features/sidebar/sidebar.tsx)
├── SidebarHeader (logo + collapse toggle)
│   └── SidebarMenu
│       ├── SidebarMenuItem (expanded: logo + PanelLeftClose) — hidden when icon-only
│       └── SidebarMenuItem (collapsed: PanelLeftOpen expand button) — shown only when icon-only
├── ActionButtons (atoms/action-buttons.tsx)  — New task / Home / Chat
├── TaskCreateDialog (controlled by GlobalSidebar's createOpen state)
├── SidebarContent
│   └── SidebarGroup ("Streams") — hidden when collapsed
│       ├── SidebarGroupAction (Plus → router.push('/stream/new'))
│       └── SidebarMenu
│           └── SidebarMenuItem * N (Link to /tasks/{name} + optional badge)
└── SidebarFooter
    ├── (NODE_ENV === 'development') Playground link
    ├── SidebarSeparator
    └── AccountFooter (when NEXT_PUBLIC_ACCOUNTS_ENABLED) | Settings link (otherwise)
```

```
components/features/sidebar/
  sidebar.tsx                # GlobalSidebar shell
  atoms/
    action-buttons.tsx       # New task / Home / Chat top group
    account-footer.tsx       # Account popover (EE/accounts-enabled builds)
    usage-indicator.tsx      # Tier badge + usage display helpers
    dropdown-menu.tsx        # Shared dropdown-menu primitive wrapper
```

### Account Footer

When `NEXT_PUBLIC_ACCOUNTS_ENABLED` is `'true'`, `SidebarFooter` renders `AccountFooter`. Otherwise it renders a single Settings link.

`AccountFooter` is a Catalyst `Popover` (not a `DropdownMenu`):

**Trigger row:** Avatar + display name (and email below when name and email differ) + `ChevronsUpDown` chevron. Collapses to avatar-only in icon mode.

**Popover panel:**

- Inset card header repeating avatar + name + email
- A single "Settings" `CloseButton` that routes to `/settings`

**Display data:** `useCurrentUser()` provides the logged-in user; `db.useQuery` on `$users` fetches the profile (name + avatar). Fallback initials are derived from the name, or the first letter of the email.

**Loading state:** `AccountFooter` returns `null` while `isLoading` is true or `user` is missing — no skeleton; the footer area collapses cleanly.

> The footer does not currently surface tier, usage minutes, or a billing link. `usage-indicator.tsx` defines `TierBadge` / `UsageIndicator` / `useBillingData()` for use elsewhere; integration into the footer is deferred.

### Development Footer Item

When `process.env.NODE_ENV === 'development'`, the footer shows a Playground link (`FerrisWheel` icon → `/playground`) above the separator. Hidden in production.

## Where It Mounts

`SidebarProvider` + `Sidebar` + `GlobalSidebar` + `SidebarInset` in `app/(app)/layout.tsx`. The sidebar wraps the entire `(app)` route group — it does not appear in `(settings)` (which has its own sidebar) or on `/login` / `/setup`.

```
AuthGuard
└── SidebarProvider (defaultOpen resolved from cookie ?? config)
    ├── WorkspaceInitializer (warms SWR cache)
    ├── Sidebar (side="left", collapsible="icon")
    │   └── GlobalSidebar
    └── SidebarInset
        └── {children}
```

## Stream Creation

The `+` next to the "Streams" group label navigates to `/stream/new` (a dedicated page route under `app/(desktop)/stream/new/`). The page owns the create form; the sidebar is just a launcher. There is no in-sidebar dialog for stream creation.

The home composer also creates streams as a side effect of submitting a first message — see [Home](home.md) and [App Shell](app-shell.md).

## Task Creation

The "New task" top action opens `TaskCreateDialog` (`components/features/tasks/create/dialog.tsx`). The dialog is controlled by `GlobalSidebar`'s `createOpen` state.

The dialog collects a title, optional description, optional stream selection (`StreamPicker`), and optional file attachments. Submit calls `createTask()` (server action), uploads any staged files via `ingestTaskInput`, then revalidates `taskItemsKey()`. Slug is generated from the title via `generateTaskSlug()`.

## Acceptance Criteria

- [x] Global sidebar renders on the left side of every `(app)` route
- [x] Sidebar shows a list of all streams, sorted newest-first
- [x] Active stream is visually highlighted in the list
- [x] Clicking a stream navigates to `/tasks/{name}`
- [x] Sidebar collapses to ~48px icon rail — top actions visible with tooltips, stream list hidden
- [x] Sidebar expands with full icon + label items
- [x] Collapse state persists across page reloads (cookie)
- [x] `Cmd+L` toggles the sidebar
- [x] "New task" opens the task-create dialog; Home and Chat are link navigations
- [x] "Streams" `+` button navigates to `/stream/new`
- [x] Per-stream attention badge shows the count of pending tasks
- [x] Empty stream list shows a disabled "No streams" placeholder
- [x] Account footer is hidden when `NEXT_PUBLIC_ACCOUNTS_ENABLED` is off; a Settings link is shown instead
- [x] Playground link only appears in development

## Edge Cases

- **No streams:** "No streams" placeholder shown; the rest of the sidebar still renders.
- **Many streams (>20):** `SidebarContent` scrolls (`overflow-auto` is built into the primitive).
- **Long stream names:** Truncated with ellipsis (built into `SidebarMenuButton`).
- **Stream created elsewhere:** SWR mutation/revalidation refreshes the list; the new stream appears.
- **Stream deleted externally:** Next SWR revalidation removes it from the list.
- **Pending-tasks count drops to zero:** Badge unmounts (the conditional render hides it).
- **Account profile missing:** `AccountFooter` falls back to the email and email-initial; renders nothing while loading.

## Constraints

- No drag-to-resize. Width is owned by the sidebar primitive and the `--sidebar-width-icon` variable.
- No right-side option. Global sidebar is always on the left.
- Stream rows have no inline actions (no rename, delete, or three-dots menu). Stream/task lifecycle is handled on dedicated pages and within task views.

## Testing

No dedicated test files for sidebar UI rendering — it is primarily composition over the sidebar primitive. The atoms have their own tests where they own logic:

- `account-footer.test.tsx` — initials, fallback rendering, loading state
- `usage-indicator.test.tsx` — tier/usage formatting

Stream list data is tested via `readStreams()` (`lib/fs/read.server.test.ts`) and the streams API route.

## Cross-References

- [App Shell](app-shell.md): Routing, stream creation flows
- [Home](home.md): Home composer creates streams as a side effect of the first message
- [Desktop](desktop.md): Layout anatomy
- [Data Flow](data-flow.md): SWR patterns and the `WorkspaceInitializer` cache warmup
- [Settings](settings.md): `general.sidebarDefault` controls the default open/closed state on first load
