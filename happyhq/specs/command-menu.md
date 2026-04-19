# Command Menu

A composable command menu system — one shell, many compositions.

## Purpose

The command menu is a keyboard-first, glass-morphism modal for navigating, searching, and taking actions. Different contexts compose different menus from shared building blocks. Pressing `/` opens the full command palette. Clicking "Quick Open" opens a focused stream+task picker. Both share the same shell, atoms, and groups — just different compositions.

## Architecture

Three layers:

1. **Shell** — the modal container, search input, keyboard navigation, focus management, page stack. Owns the mechanics, renders whatever content it's given.
2. **Groups** — self-contained chunks of command items. Each group fetches its own data, renders its own items, and handles its own selection logic. Reusable across compositions.
3. **Pages** — drilldown views for multi-step flows (e.g., "Add from web" → web sources → URL input). Managed by the shell's page stack. Groups push pages; the shell handles back navigation.

### Shell

`CommandMenuShell` wraps `cmdk`'s `Command` primitive with:

- Glass morphism container with backdrop (existing `CommandMenuContainer`)
- Search input with auto-focus (existing `CommandMenuHeader`)
- Back button (visible when page stack is non-empty)
- Keyboard handling: Escape (pop page or close), Backspace on empty (pop page), ArrowLeft (pop page)
- Footer with keyboard hints
- Custom keyword-based search filtering

The shell reads state from the Zustand store (open/close, search text, page stack). Content — groups and page rendering — is provided by the composition, not the shell.

### Groups

Each group is a `CommandPrimitive.Group` wrapper that renders command items. Groups are self-contained:

| Group           | Items                               | Data Source                        |
| --------------- | ----------------------------------- | ---------------------------------- |
| `ActionsGroup`  | New task, Upload file, Add from web | Static (web sources pushes a page) |
| `NavigateGroup` | Tasks, Chat                         | Static                             |
| `StreamsGroup`  | All streams, searchable             | `useStreams()` from streamsStore   |
| `TasksGroup`    | Recent tasks, searchable            | SWR `taskItemsKey()`               |

Groups live in `components/features/command-menu/groups/`. Each group handles its own `onSelect` — typically `router.push()` + close the menu.

`StreamsGroup` is reused in two contexts: as a top-level group in Quick Open, and as the drilldown page when "Open stream..." is selected in the full palette.

### Pages

Pages are drilldown views pushed onto the shell's page stack. They exist for multi-step flows within the full palette:

- `streams` — `StreamsGroup` rendered as a full page (same component, different context)
- `web-sources` — list of web input types (save link, read page, watch video, etc.)
- `url-input` — URL input with unfurl preview and submission

Pages are not relevant to simpler compositions like Quick Open, which have no drilldown.

## State Management

A Zustand store (`commandMenuStore`) replaces the current React context and `useCommandMenu` hook. Any component can open/control the menu by importing from the store.

```
State:
  isOpen: boolean
  variant: 'palette' | 'quick-open' | null
  search: string
  pages: Page[]

Derived:
  page → pages[pages.length - 1]

Actions:
  openPalette()     — open full palette (via / shortcut)
  openQuickOpen()   — open quick open picker
  close()           — close and reset
  toggle()          — toggle palette
  pushPage(page)    — push drilldown page
  popPage()         — pop page (go back)
  setSearch(s)      — update search text
```

The global `/` keyboard listener calls `toggle()`. The QuickOpen button calls `openQuickOpen()`.

No React context, no provider wrapping. Components import store selectors directly.

## Compositions

### Command Palette (`/`)

The full menu. Root view shows all groups; items can drill into pages.

```
Root view:
  ActionsGroup
    ├── New task
    ├── Upload file
    └── Add from web → pushes 'web-sources' page
  NavigateGroup
    ├── Tasks
    └── Chat
  StreamsGroup (as browse item)
    └── Open stream... → pushes 'streams' page

Pages:
  streams → StreamsGroup (full list)
  web-sources → WebSourcesPage
  url-input → UrlInputPage (with unfurl preview)
```

Back navigation works through the page stack. Escape on root closes.

### Quick Open

A focused picker opened from the QuickOpen panel. No drilldown, no actions — just streams and tasks.

```
StreamsGroup (full list, inline)
TasksGroup (recent tasks, inline)
```

No pages. Escape closes. Selecting an item navigates and closes.

## Component Tree

```
DesktopShell
  └── CommandMenuShell (reads isOpen, search, pages from store)
      ├── CommandMenuContainer (glass morphism + animations)
      ├── CommandMenuHeader (back icon + search input + action button)
      ├── Content (variant-dependent)
      │   ├── palette root: ActionsGroup + NavigateGroup + StreamsBrowseGroup
      │   ├── palette pages: StreamsGroup / WebSourcesPage / UrlInputPage
      │   └── quick-open: StreamsGroup + TasksGroup
      └── CommandMenuFooter
```

## Atoms

Existing atoms are unchanged — they're the primitives both groups and pages use:

- `CommandMenuContainer` — glass morphism wrapper, click-outside-to-close, spring animation
- `CommandMenuHeader` — icon + input + optional action button
- `CommandMenuHeaderIcon` — search icon or back button
- `CommandMenuHeaderAction` — disabled / loading / preview / submit states
- `CommandMenuGroup` — section with heading
- `CommandMenuItem` — icon + label + action text, keyword-searchable
- `CommandMenuFooter` / `CommandMenuFooterHints` — keyboard hints

## Design Decisions

**Shell + groups, not modes.** Instead of a single component with a `focused` boolean, the menu is composed from reusable groups. A "focused" experience is just a composition without drilldown — no special flag needed.

**Zustand over React context.** The command menu state is client-only UI state (open/close, search text, page stack). Zustand is the established pattern for this in the codebase. No provider wrapping needed — any component can import the store directly.

**Groups own their data.** Each group fetches its own data and handles its own selection. The shell doesn't need to know about streams, tasks, or actions — it just renders what it's given.

**Variant in the store.** The store tracks which composition is active (`palette` vs `quick-open`). This lets the single mount point in the shell render the right content without multiple component instances.

**Reusable StreamsGroup.** The same component renders streams whether it's a top-level group (Quick Open) or a drilldown page (full palette). No duplication.

## Acceptance Criteria

- [ ] Pressing `/` opens the full command palette with Actions, Navigate, and Streams groups
- [ ] "Add from web" drills into web sources, then URL input — back navigation works
- [ ] "Open stream..." drills into the streams list — back navigation works
- [ ] QuickOpen panel shows a "Quick Open" button that opens a focused stream+task picker
- [ ] Quick Open shows streams and tasks as searchable groups — no back button, escape closes
- [ ] Selecting a stream (from either composition) navigates to `/{stream}` and closes
- [ ] Selecting a task (from Quick Open) navigates to the task and closes
- [ ] Command menu state lives in a Zustand store — no React context provider
- [ ] Global `/` keyboard shortcut toggles the palette (ignores input fields)

## Testing

No dedicated tests. The command menu is primarily UI rendering — modal behavior, keyboard shortcuts, search filtering — which falls outside testing scope per `testing.md`.

Behaviors that could be tested through store tests:

- [ ] Store actions: open/close/toggle, push/pop page, variant management
- [ ] Page stack: push adds, pop removes, close resets

## Cross-References

- [Desktop](desktop.md) — the canvas where the command menu renders
- [App Shell](app-shell.md) — routing and navigation patterns
