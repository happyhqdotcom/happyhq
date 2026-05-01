# Playground

A dev workbench for building, viewing, and evolving Q's UI components.

## Purpose

The playground is where we see what we have, iterate on it, and test edge cases — without spinning up a real agent conversation. It's a dev tool, not a documentation page. The component you're working on sits front and center on a canvas. Controls around it let you swap data, toggle states, and simulate streaming. A bottom panel logs events so you can see what's firing.

Dev-only — returns 404 in production.

## Related Specs

- [Chat](chat.md) — Chat components, message rendering, interaction cards
- [Home](home.md) — Composer component, animated placeholder
- [Desktop](desktop.md) — Window system, canvas layout
- [Observability](observability.md) — debug-bundle export for user-reported bugs; the Exercise Harness below is its dev-loop sibling

## Layout

Three zones: panels (component browser + controls), canvas (the component with variant header), bottom panel (logs/data). The layout matches the HQ streams aesthetic — `bg-stone-200` with `gap-1` between panels.

```
┌──────────────┬────────────────────────────────────────────────────┬──────────────┐
│              │  Canvas Header                                     │              │
│  Component   │  ┌─ Variant Tabs ──────────────┐  ┌─ Controls ─┐  │  Inspector   │
│  Browser     │  │ ● Short  ○ Rich Markdown    │  │  ▶  ↺      │  │              │
│              │  └─────────────────────────────-┘  └────────────┘  │  Controls    │
│  User Msg    ├────────────────────────────────────────────────────┤  streaming ○ │
│  Asst Msg    │                                                    │  historical ●│
│  Thinking    │              Canvas                                │              │
│  Tools       │                                                    │              │
│  Subagent    │        ┌──────────────────┐                        │              │
│  Ask Approve │        │                  │                        │              │
│  Ask Question│        │   [Component]    │                        │              │
│  Plan Approve│        │                  │                        │              │
│  Start Task  │        └──────────────────┘                        │              │
│  Composer    │                                                    │              │
│  Cmpsr Upload│                                                    │              │
│  Chat Upload │                                                    │              │
│  Working     │                                                    │              │
│  Anim. Text  │                                                    │              │
│  Strm. Caret │                                                    │              │
│  Markdown    │                                                    │              │
│  Conversation├────────────────────────────────────────────────────┤              │
│              │  Bottom Panel (resizable, collapsible)              │              │
│              │  ┌──────┬──────┬──────┐                             │              │
│              │  │Events│ Props│ Data │                             │              │
│              │  ├──────┴──────┴──────┤                             │              │
│              │  │ onAllow("Bash")                                  │              │
│              │  │ onSubmit("teach me…")                            │              │
│              │  └─────────────────────────────────────────────────┘│              │
│              ├────────────────────────────────────────────────────┤              │
│              │  Tab Bar  [Events] [Props] [Data]    🗑  ▼         │              │
└──────────────┴────────────────────────────────────────────────────┴──────────────┘
```

### Panels

Both side panels use a peekaboo/locked dual-mode system (`panel-peekaboo.tsx`):

**PanelLocked** — inline panel that pushes the canvas aside. Rounded top corners, border `border-x border-t border-black/5 bg-black/10`. Title bar with pin/hide toggle button. Width: 350px, animated with Framer Motion spring (damping 30, stiffness 300).

**PanelPeekaboo** — hover-triggered overlay panel. An invisible 12px rail at the screen edge triggers the panel to slide in. Spring animation (`damping: 30, stiffness: 300`), slide distance 370px. Styling: `shadow-2xl`, `border-zinc-300/80`, rounded edges. Auto-hides after 300ms when mouse leaves. `Escape` key dismisses. 32px vertical padding from navbar and screen bottom.

Both modes share a `PanelContainer` with `layoutId` for smooth morph transitions between locked and peekaboo states.

**Left panel** — component browser. Starts **locked** (always visible on load). Flat list of all registered components — no category headers. Clicking a component loads it onto the canvas.

**Right panel** — inspector/controls. Starts as **peekaboo** (hidden until hover). Shows the controls panel for the selected component. Empty state if no component is selected.

### Canvas Header

The canvas header (`canvas-header.tsx`) sits above the canvas, inside the center column. Height: 40px, `bg-zinc-100`, `border-b border-zinc-200`, rounded top corners.

**Left side** — variant tabs. Headless UI `TabGroup` with pill-style `Tab` buttons. Only visible when the component has multiple variants. Selecting a tab updates the store and URL search params.

**Right side** — playback controls. Only visible when the selected component has registered `canvasActions` with the store. Shows:

- **Play/Stop toggle** — `Play` icon starts streaming, `Square` icon stops it
- **Reset button** — `RotateCcw` icon, only visible after streaming has completed (`hasStreamed && !isStreaming`)

Components register streaming actions via `usePlaygroundStore.setCanvasActions({ start, stop, reset })` in a `useEffect`, and report streaming state via `setIsStreaming()`.

### Canvas (Center)

The component rendered in isolation. Centered vertically and horizontally within the available space. The canvas provides an appropriate container width per component (chat components get `max-w-2xl`, composer gets `max-w-3xl`, etc.) — this is part of the component's registration.

Background: `rgb(250 250 250)` with a subtle grid overlay — two layers of `linear-gradient` lines (major at 64px, minor at 16px) at very low opacity (`0.15` and `0.07`). Makes it clear this is a canvas, not the real app.

Container: `h-full w-full overflow-y-auto`. Inner div constrains width with `mx-auto flex min-h-full flex-col justify-center px-6 py-6`.

### Bottom Panel

Resizable panel using `react-resizable-panels` (`ResizablePanelGroup`). Drag the handle to resize. Starts at 25% height, collapsible via drag or the chevron button.

**Starts collapsed** — panels don't open until explicitly clicked.

The bottom panel has two parts:

1. **BottomPanelContent** — lives inside the collapsible `ResizablePanel`. Renders the active tab's content.

2. **BottomTabBar** — always visible below the resizable panel group (never collapses). Height: 36px. Contains tab buttons and actions. Clicking a tab when the panel is collapsed expands it. Clicking the already-active tab collapses the panel. Events tab shows a trash icon for clearing. Chevron button toggles collapse.

Three tabs:

- **Events** — chronological log of callback invocations. Every callback the component fires (onClick, onSubmit, onAllow, onDeny, onStart, onAnswer, etc.) is logged with timestamp, callback name, and arguments. Clears when switching components. This is the primary debugging surface.

- **Props** — live view of the current props being passed to the component. Updates when controls change. Rendered as formatted JSON (`{ data, controls }`).

- **Data** — the raw fixture data for the current variant. Useful for understanding what mock data looks like. Static — doesn't reflect control changes.

## Component Registry

Each component in the playground is a registration object. This is the core abstraction — adding a new component to the playground means adding one registration, not creating a new route.

```typescript
interface PlaygroundComponent {
  /** Unique ID, used for routing — e.g., 'messages/user' */
  id: string
  /** Display name in component browser */
  name: string
  /** Category for registry organization */
  category: Category
  /** Max width for the canvas container — defaults to 'md' (max-w-2xl) */
  canvasWidth?: 'sm' | 'md' | 'lg' | 'xl'
  /** Named variants with fixture data */
  variants: Record<string, PlaygroundVariant>
  /** Optional interactive controls */
  controls?: Record<string, PlaygroundControl>
  /** Render function — receives current variant data + control values, returns JSX */
  render: (props: {
    data: unknown
    controls: Record<string, unknown>
    log: (event: string, ...args: unknown[]) => void
  }) => React.ReactNode
}

interface PlaygroundVariant {
  /** Display name in variant tabs */
  name: string
  /** Fixture data passed to render() */
  data: unknown
}

interface PlaygroundControl {
  type: 'toggle' | 'slider' | 'select'
  label: string
  default: unknown
  /** For sliders */
  min?: number
  max?: number
  step?: number
  /** For selects */
  options?: { label: string; value: unknown }[]
}

type Category =
  | 'Messages'
  | 'Thinking'
  | 'Tools'
  | 'Interaction'
  | 'Composer'
  | 'Attachments'
  | 'Primitives'
  | 'Markdown'
  | 'Conversation'
```

The `log` function passed to `render` is wired to the bottom panel's Events tab. Components pass it as their callback prop:

```typescript
render: ({ data, controls, log }) => (
  <AskUserConfirmation
    toolName={data.toolName}
    input={data.input}
    onAllow={() => log('onAllow')}
    onDeny={() => log('onDeny')}
  />
)
```

### Registry file

All registrations live in per-category files under `playground/_registry/`. The index imports them and exports a flat array:

```
playground/
  _registry/
    index.ts              — exports PLAYGROUND_COMPONENTS: PlaygroundComponent[]
    types.ts              — PlaygroundComponent, PlaygroundVariant, PlaygroundControl types
    messages.tsx          — UserMessage, AssistantMessage registrations
    thinking.tsx          — ThinkingIndicator registration
    tools.tsx             — Tools registration (one entry, per-tool-type variants)
    subagent.tsx          — Subagent registration (WritingPreviewCard)
    interaction.tsx       — AskUserApproval, AskUserQuestion, PlanApproval, StartTask
    composer.tsx          — Composer registration (card + compact via toggle)
    attachments.tsx       — ComposerUpload (FileCard), ChatUpload (FilePill)
    primitives.tsx        — WorkingIndicator, AnimatedText, StreamingCaret
    markdown.tsx          — Markdown stress test registration
    conversation.tsx      — Full conversation registration
```

## Components & Variants

Every component that Q renders in a chat session should be in the playground. The component browser is a flat list (no category headers) — with ~17 entries this doesn't need grouping.

### Messages

**User Message** (`messages/user`)
| Variant | Description |
|---------|-------------|
| `plain` | Simple text message |
| `with-files` | Text + file pills (PDF, DOCX) |
| `long` | Long text that triggers show more/less truncation |

**Assistant Message** (`messages/assistant`)
| Variant | Description |
|---------|-------------|
| `short` | Brief text response |
| `rich-markdown` | Headers, lists, bold, code blocks, tables |

Controls: `isStreaming` toggle, `isHistorical` toggle.

Streaming simulation is handled by `AssistantMessageRenderer` — a wrapper that registers `canvasActions` (start/stop/reset) with the store. Play button in the canvas header triggers word-by-word text reveal on any variant. No separate streaming variants needed.

### Thinking

**Thinking Indicator** (`thinking/indicator`)
| Variant | Description |
|---------|-------------|
| `single-block` | One thinking block |
| `multiple-blocks` | Two thinking blocks with timeline |
| `long-block` | Extended thinking with lots of text |

Controls: `isStreaming` toggle (streaming shows "Thinking...", done shows collapsed).

### Tools

**Tools** (`tools`)

A single registration with one variant per tool type — matches the agent's mental model rather than the UI component hierarchy. Each variant shows a `ToolProgressIndicator` with one step and one tool call.

| Variant      | Description                                  |
| ------------ | -------------------------------------------- |
| `read`       | Read — file path display                     |
| `write`      | Write — file path + content preview          |
| `edit`       | Edit — file path display                     |
| `grep`       | Grep — search pattern display                |
| `glob`       | Glob — glob pattern display                  |
| `bash`       | Bash — command with description              |
| `web-search` | WebSearch — query display                    |
| `web-fetch`  | WebFetch — URL display                       |
| `todo-write` | TodoWrite — task list with status indicators |

Controls: `isStreaming` toggle.

### Subagent

**Subagent** (`subagent`)

Renders `WritingPreviewCard` — the card that shows subagent output. `SubagentStreamingRenderer` wraps it with canvas actions for character-by-character streaming simulation.

| Variant    | Description                         |
| ---------- | ----------------------------------- |
| `drafting` | Completed subagent text output      |
| `explore`  | Text + subagent tool progress steps |

Controls: `isActive` toggle.

### Interaction

**Ask User Approval** (`interaction/confirmation`)
| Variant | Description |
|---------|-------------|
| `bash-command` | Bash tool — shows "Run command" with command text |
| `read-file` | Read tool — shows "Read file" with path |
| `write-file` | Write tool — shows "Write to file" with path |
| `grep-search` | Grep tool — shows search pattern |
| `web-search` | WebSearch tool — shows query |
| `web-fetch` | WebFetch tool — shows URL |
| `generic-tool` | Unknown tool — shows raw tool name |

**Ask User Question** (`interaction/questions`)
| Variant | Description |
|---------|-------------|
| `single-question` | One question with 3 options |
| `multi-question` | Two questions with tab navigation |
| `with-descriptions` | Options with description text |

**Plan Approval** (`interaction/plan-approval`)

Single `default` variant. The plan link is controlled by a toggle instead of a separate variant.

Controls: `showPlanLink` toggle (default: true). When on, `onOpenPlan` is provided. When off, the plan link is hidden.

Loading states (`approve-loading`, `start-over-loading`) are managed internally by the component — click the button to see the spinner.

**Start Task Card** (`interaction/start-task`)

Single `default` variant with fixture data (`name: 'thanksgiving-apple-pies'`, `title: 'Bake three apple pie variants for Thanksgiving'`). States are controlled by toggles instead of separate variants.

Controls: `started` toggle (default: false), `showTitle` toggle (default: true).

The "starting" state is transient — `onStart` returns a delayed promise (1.5s) so the spinner is visible after clicking.

### Composer

**Composer** (`composer`)

Single entry covering both card and compact modes via a toggle control. `ComposerWrapper` manages controlled state (`useState` for text and staged files).

| Variant      | Description                          |
| ------------ | ------------------------------------ |
| `empty`      | Empty composer with placeholder      |
| `with-text`  | Pre-filled text content              |
| `with-files` | Staged file cards (PDF, DOCX, email) |
| `disabled`   | Disabled state with pre-filled text  |

Controls: `compact` toggle (default: false), `disabled` toggle (default: false).

Canvas width: `lg` (max-w-3xl).

### Attachments

**Composer Upload** (`attachments/staged`)

Renders `FileCard` components — the cards shown in the composer staging area.

| Variant    | Description            |
| ---------- | ---------------------- |
| `pdf`      | Single PDF file card   |
| `docx`     | Single Word file card  |
| `email`    | Single email file card |
| `multiple` | Multiple file cards    |

**Chat Upload** (`attachments/message`)

Renders `FilePill` components — the compact pills shown in sent messages.

| Variant    | Description            |
| ---------- | ---------------------- |
| `pdf`      | PDF file pill          |
| `docx`     | Word file pill         |
| `email`    | Email file pill        |
| `excel`    | Excel file pill        |
| `csv`      | CSV file pill          |
| `unknown`  | Unknown file type pill |
| `multiple` | Multiple file pills    |

### Primitives

**Working Indicator** (`primitives/working`)
Single variant — the animated blob with rotating phrases. No controls needed.

**Animated Text** (`primitives/animated-text`)
| Variant | Description |
|---------|-------------|
| `word-by-word` | Default word delimiter |
| `character` | Character-by-character reveal |

Controls: `duration` slider (0.1–4s), `delimiter` select (word/character). `AnimatedTextDemo` wrapper registers canvas actions for play/stop/reset streaming.

**Streaming Caret** (`primitives/caret`)
Single variant — blinking cursor inline with text. Controls: `isStreaming` toggle (default: true).

Canvas width: `sm`.

### Markdown

**Markdown Rendering** (`markdown/stress-test`)
| Variant | Description |
|---------|-------------|
| `headings` | h1 through h6 |
| `inline` | Bold, italic, strikethrough, inline code, links |
| `code-blocks` | JS, Python, shell — short and long (40+ lines) |
| `tables` | Simple table, wide table (8+ columns), long cell content |
| `lists` | Ordered, unordered, nested 3 deep, mixed, task lists |
| `edge-cases` | Adjacent code blocks, long unbroken strings, emoji, HTML entities |
| `kitchen-sink` | All of the above combined in one document |

### Conversation

**Full Conversation** (`conversation/full`)
A realistic multi-turn chat showing components in context — how they compose together in a real conversation flow.

| Variant            | Description                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `learning-session` | User teaching Q (apple pie theme) — thinking, tool progress, questions, writing preview, task card |
| `quick-exchange`   | Short back-and-forth — plain messages only                                                         |

Canvas width: `lg`.

## Mock Data

All fixture data lives in `playground/_data/` as typed constants. Each file exports named fixtures grouped by component. Apple pie baking theme throughout.

```
playground/
  _data/
    messages.ts         — user and assistant message fixtures
    thinking.ts         — ThinkingBlock[] fixtures
    tool-steps.ts       — ToolProgressStep[] and ToolCall[] fixtures
    todos.ts            — TodoWrite input fixtures (all-done, mixed, many)
    files.ts            — StagedFile[] fixtures, filename strings, file preview data
    writing.ts          — WritingPreview fixtures
    questions.ts        — question option fixtures
    confirmations.ts    — AskUserConfirmation input fixtures (per tool type)
    markdown.ts         — markdown string fixtures (headings, tables, code, edge cases)
    conversations.ts    — ChatMessage[] fixtures for full conversation view
    sample-text.ts      — long-form text for streaming simulation
```

## Routing

Two routes:

- `/playground` — the component fixture browser. Selected component is tracked in URL search params (`?component=messages/user&variant=with-files`) so links are shareable and browser back works.
- `/playground/sessions/[sessionId]` — viewer for a recorded live-SDK session (see [Sessions](#sessions)).

```
app/(playground)/playground/
  layout.tsx            — Navbar + peekaboo panels + ResizablePanelGroup + BottomTabBar
  page.tsx              — reads search params, syncs to store, renders selected component
  sessions/[sessionId]/
    page.tsx            — three-pane viewer for a session (real panel + ActivityStep[] snapshot + wire log)
  _registry/            — component registrations (see Registry section)
  _data/                — fixture data
  _components/
    component-browser.tsx   — flat list of all components
    canvas-header.tsx       — variant tabs + play/stop/reset controls
    controls-panel.tsx      — dynamic controls renderer (toggle, slider, select)
    canvas.tsx              — centered component container with grid background
    bottom-panel.tsx        — BottomPanelContent + BottomTabBar
    event-log.tsx           — scrollable event log
    panel-peekaboo.tsx      — PanelLocked + PanelPeekaboo dual-mode panel system
    navbar.tsx              — Back button + "Playground" title
    keyboard-nav.ts         — shared arrow-key navigation helper
    playground-store.ts     — Zustand store for playground state
```

## Playground State

A Zustand store for playground-wide state:

```typescript
interface PanelState {
  isLocked: boolean
  isPeekabooVisible: boolean
}

type BottomTab = 'events' | 'props' | 'data'

interface CanvasActions {
  start: () => void
  stop: () => void
  reset: () => void
}

interface PlaygroundState {
  /** Currently selected component ID */
  selectedComponent: string | null
  /** Currently selected variant */
  selectedVariant: string | null
  /** Current control values */
  controlValues: Record<string, unknown>
  /** Event log entries */
  events: PlaygroundEvent[]
  /** Bottom panel collapsed/expanded */
  bottomPanelOpen: boolean
  /** Active bottom panel tab */
  bottomTab: BottomTab

  /** Canvas streaming controls (registered by demo wrapper components) */
  canvasActions: CanvasActions | null
  /** Whether a streaming simulation is currently running */
  isStreaming: boolean
  /** Whether streaming has run at least once (shows reset button) */
  hasStreamed: boolean

  /** Panel states (locked inline vs peekaboo overlay) */
  leftPanel: PanelState // starts { isLocked: true, isPeekabooVisible: false }
  rightPanel: PanelState // starts { isLocked: false, isPeekabooVisible: false }

  selectComponent: (component: PlaygroundComponent) => void
  selectVariant: (name: string, component: PlaygroundComponent) => void
  setControl: (name: string, value: unknown) => void
  logEvent: (name: string, ...args: unknown[]) => void
  clearEvents: () => void
  setBottomPanelOpen: (open: boolean) => void
  setBottomTab: (tab: BottomTab) => void
  setCanvasActions: (actions: CanvasActions | null) => void
  setIsStreaming: (streaming: boolean) => void
  setLeftPanel: (state: Partial<PanelState>) => void
  setRightPanel: (state: Partial<PanelState>) => void
}
```

`selectComponent` resets variant to first key, control values to defaults, and clears events. `selectVariant` resets control values to defaults.

Sync `selectedComponent` and `selectedVariant` to URL search params via `useSearchParams` + `router.replace` in `page.tsx` and `canvas-header.tsx`.

## Canvas

| canvasWidth | Class       | Use case                                        |
| ----------- | ----------- | ----------------------------------------------- |
| `sm`        | `max-w-sm`  | Small components (streaming caret)              |
| `md`        | `max-w-2xl` | Chat messages, tool progress, interaction cards |
| `lg`        | `max-w-3xl` | Composer, conversation view                     |
| `xl`        | `max-w-5xl` | Side-by-side comparisons (future)               |

## Implementation Notes

**No mock providers needed.** Composer is fully self-contained — it takes all data via props (`value`, `onValueChange`, `stagedFiles`, `onStagedFilesChange`, `onSubmit`, `disabled`, `compact`). No store dependency. Similarly, `ChatMessageComponent` and its children (`ToolProgressIndicator`, `WriteFileDisplay`) depend on Zustand stores (`useDesktopStore`, `useWindowStore`) that have safe defaults — empty state and fully-defined action functions. Everything renders without providers; click handlers for file windows are no-ops with default state.

**Wrapper components for stateful demos.** Components that need controlled state or streaming simulation use wrapper components returned from the render function. The wrapper manages `useState`/`setInterval` internally and registers canvas actions with the store for play/stop/reset. This pattern is used by: `ComposerWrapper`, `AssistantMessageRenderer`, `SubagentStreamingRenderer`, `AnimatedTextDemo`, `StreamingCaretDemo`.

**Canvas actions pattern.** Demo wrappers that support streaming call `setCanvasActions({ start, stop, reset })` in a `useEffect` and clean up on unmount. They report streaming state via `setIsStreaming(boolean)`. The canvas header reads these from the store and renders the appropriate playback controls.

**Apple pie theme** is maintained across all fixtures for coherence. Every mock message, tool call, and question relates to baking.

## Exercise Harness

The fixture browser covers components in isolation. The Exercise Harness
covers the opposite shape: Ralphie (or a human) drives the **real
running app** through a headless browser, with the system's filesystem
state isolated to a sandbox directory and every observable signal
captured to disk. The artifact directory is the deliverable — Ralphie
inspects it to verify a fix; a human can read the same files to follow
along.

The motivation: most "logical but not quite there" bugs land on the FE
(rendering, panels, components, data shapes Ralphie can't see). Without
a way to drive and observe the real UI, Ralphie ships guesses and the
human re-verifies by hand. The harness closes that loop.

Dev-only — same 404-in-prod constraint as the fixture browser.

### How Ralphie uses it

Three workflows, same machinery:

1. **Building a feature.** Write `scripts/exercises/<feature>.ts`,
   drive the UI through the new behavior, assert the expected outcome,
   iterate code until the exercise passes. The exercise stays in the
   repo as a permanent regression test.
2. **Post-merge regression.** Run the existing exercise battery
   (`scripts/exercises/smoke/*.ts` plus per-feature exercises that
   have accumulated). Each produces a clean artifact dir; red ones
   surface concrete defects with reproducible artifacts.
3. **Bug verification.** Write an exercise that reproduces the bug,
   fix the code, re-run until pass. The exercise stays as the
   regression test for that bug.

The script format, artifact directory, and exit-code contract are
uniform across all three modes. The library compounds — every new
feature or fixed bug adds an exercise; coverage grows over time
without new infrastructure.

### Sandbox via env-var

Filesystem isolation is solved at the constants layer:
`lib/constants.server.ts` reads `HAPPYHQ_ROOT` from `process.env` with
a default of `~/HappyHQ`. Every path in `lib/fs/paths.ts` (`tasks/`,
`.chats/`, `.logs/`, `.q/`, streams) routes through this.

The harness spawns the dev server with `HAPPYHQ_ROOT=/tmp/exercise-<id>/`.
The whole app — agent runs, chat history, file uploads, logs —
operates against that root. The user's real `~/HappyHQ/` is never
touched. No `cwd` overrides on agent factories, no `canUseTool`
substitutions, no per-session contortions inside production code.
Sandboxing happens at the env boundary only.

### CLI

```
pnpm tsx scripts/exercise.ts \
  --root /tmp/exercise-XYZ \         # sets HAPPYHQ_ROOT for the spawned dev server
  --script scripts/exercises/<x>.ts  # what to do once the page is up
  [--keep]                           # keep the sandbox dir after exit (default: keep)
```

The harness:

1. Starts the dev server as a child process with `HAPPYHQ_ROOT` set.
2. Waits for `/api/auth/status` to respond.
3. Launches Playwright, opens a page.
4. Calls the script's exported `run({ page, dump, root })` function.
5. On exit (clean or thrown), captures final artifacts, kills the
   dev server, writes `meta.json`, exits 0/non-zero.

Exercise scripts are TypeScript modules that export `run`. They
receive a Playwright `page`, a `dump(name?)` helper that takes
on-demand snapshots, and the sandbox `root` path. They do whatever
they need: navigate, click, type, upload, wait for selectors, assert.
A thrown error fails the exercise (non-zero exit) with the error
recorded in `meta.json`.

### Setup — browser binaries

Playwright ships as a JS package; the actual browser binary
(Chromium for our purposes) installs separately. Ralphie's autonomous
loop has to work from a fresh checkout, so:

1. `package.json` adds a `postinstall` script that runs
   `playwright install chromium` after `pnpm install` completes.
   First-time install is a one-time cost (~150 MB); subsequent
   installs no-op once the cache is warm.
2. The harness fails fast with a clear error message if Chromium is
   missing at launch time — print the install command and exit
   non-zero rather than throwing a Playwright internal stack trace.

WebKit and Firefox are intentionally not installed — a single browser
is enough for a dev tool, and skipping them keeps the install lean.

### Artifact directory

Each exercise run produces `<HAPPYHQ_ROOT>/.exercises/<id>/`:

| File            | Purpose                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `meta.json`     | `{ id, script, root, port, baseUrl, started, ended, durationMs, exit, error?, runIds: string[] }`                                    |
| `dom.html`      | Final DOM snapshot (or named snapshots from `dump('name')` calls)                                                                    |
| `console.jsonl` | Every browser console message (level, text, url, line)                                                                               |
| `network.jsonl` | Every browser request/response (method, url, status, timing)                                                                         |
| `screenshots/`  | PNGs from `dump('name')` (optional)                                                                                                  |
| `logs.jsonl`    | Slice of `<root>/.logs/<date>.jsonl` covering the exercise window                                                                    |
| `wire.jsonl`    | `ChatStreamEvent`s from any run that fired during the exercise (concatenated across `runIds`, separated by `{"_runId":"..."}` lines) |
| `server.log`    | stdout/stderr from the spawned `next dev` child (useful for debugging dev-server start failures)                                     |

The directory is the artifact — no separate viewer needed for the MVP.
Ralphie greps `console.jsonl` for errors, opens `dom.html` to inspect
state, reads `wire.jsonl` to verify backend behavior. A web viewer
can come later if browsing the dir gets painful.

### Wire-event tee

A small writer in `lib/run/loop.server.ts` appends every emitted
`ChatStreamEvent` to `<HAPPYHQ_ROOT>/.runs/<runId>/wire.jsonl` as it
flows through the existing fan-out. Cheap, additive, no behavior
change. Lets Ralphie inspect or replay any past run, in or out of an
exercise. Inside an exercise, the harness copies the relevant
`wire.jsonl` slice into `.exercises/<id>/wire.jsonl`.

### Reducer extraction

`useRunActivity` today inlines the wire-events-to-`ActivityStep[]`
reducer as `useEffect` + refs. Extract it to a pure function so
the same logic works outside React (deterministic tests, replay
tools, future CLI inspectors):

```ts
// lib/run/activity-reducer.ts
export function reduceActivity(
  prev: ActivityState,
  event: ChatStreamEvent,
  now: number,
): ActivityState
```

The hook rewrites to wrap `useReducer(reduceActivity, initialActivityState())` —
production behavior unchanged. A captured `wire.jsonl` becomes a
deterministic regression fixture for issues like #26 (subagent
activity rendering).

### Files

- New: `scripts/exercise.ts` — harness CLI
- New: `scripts/exercises/` — directory; first exercise verifies #24
  (rename stream while windows open)
- New: `lib/exercise/dump.ts` — `dump()` helper used by exercise scripts
- New: `lib/run/activity-reducer.ts` (+ `.test.ts`) — pure reducer
- New: `lib/run/wire-tee.server.ts` — appender used by the run loop
- Edit: `lib/fs/paths.ts` — add `exerciseDir(id)`, `runWirePath(runId)`
- Edit: `lib/run/loop.server.ts` — call the wire tee at the fan-out emit point
- Edit: `components/features/desktop/hooks/use-run-activity.ts` — `useReducer(reduceActivity, ...)`
- Edit: `package.json` — add `playwright` (or `@playwright/test`)

Reused unchanged: `filterMessage`, `encodeEvent`, `getAuthEnv`, all
agent-options factories. The `_registry/` fixture set is untouched.
**No production agent code is reshaped to fit the harness** — the
harness adapts to the app, not the other way around.

### Verification

1. `pnpm install` pulls Playwright.
2. `pnpm tsx scripts/exercise.ts --root /tmp/exercise-smoke --script scripts/exercises/smoke.ts`
   — minimal smoke (open `/chat`, fill the home composer, submit, wait
   for any of three terminal signals: `[data-role="assistant-message"]`,
   `[data-role="auth-error"]`, or `/setup` redirect). Exit 0;
   `dom.html` is captured; the artifact dir round-trips. (`/` redirects
   to `/tasks`, which renders the task quick-add gesture, not the home
   composer — the smoke navigates directly to `/chat`.)
3. **Pollution audit:** the user's real `~/HappyHQ/` is untouched
   after the smoke. Only `/tmp/exercise-smoke/` got artifacts.
4. `pnpm tsx scripts/exercise.ts --root /tmp/exercise-rename --script scripts/exercises/rename-stream.ts`
   — runs the verification for #24. Either produces a green report
   ("rename works, windows rebind") or red defects with concrete
   artifacts (DOM snapshot of broken window, console error log,
   screenshot). The human reads the artifact dir and trusts it without
   re-running by hand.
5. `pnpm test` — `lib/run/wire-replay.test.ts` replays the captured
   `lib/run/__fixtures__/wire-issue-26.jsonl` fixture through
   `reduceActivity` and pins the subagent rendering guarantees that
   regressed in issue #26.

## Testing

The fixture browser is a dev tool — no automated tests. Verification is visual:

- Navigate to `/playground` in development mode
- Click through every component in the browser
- Click through every variant tab for each component
- Toggle each control and verify the component updates
- For streaming components, use the play/stop/reset controls in the canvas header
- Verify callbacks log to the Events tab
- Verify Props and Data tabs show correct JSON
- Verify the bottom panel resizes smoothly and the tab bar stays visible when collapsed
- Verify URL search params update and are shareable (copy URL -> paste in new tab -> same component and variant load)
- Verify peekaboo panels: hover rail triggers slide-in, mouse leave auto-hides, Escape dismisses, lock/unlock transitions smoothly

The Exercise Harness adds programmatic test surface for the running app:

- `lib/run/activity-reducer.test.ts` — unit-level reducer tests (purity, parity with the prior hook implementation, deterministic `now` injection).
- `lib/run/wire-replay.test.ts` — replays captured `wire.jsonl` fixtures from `lib/run/__fixtures__/` through `reduceActivity` and pins the visible activity-rendering guarantees. Issues like #26 (subagent activity rendering) become pinned regression tests once a wire transcript is captured.
- `scripts/exercises/*.ts` — Playwright-driven flows; exit code is the verdict, the artifact dir is the evidence. Run on demand by Ralphie or as a battery after merges.

## Constraints

- Dev-only (production returns 404)
- Light mode only (per foundation spec)
- No external dependencies — built with existing UI primitives
- Exercise Harness never writes to the user's real `~/HappyHQ/` — sandboxing is via `HAPPYHQ_ROOT` set on the spawned dev server; all filesystem residue (runs, chats, logs, exercise artifacts) lands under the sandbox root
- Exercises run sequentially within a single `HAPPYHQ_ROOT` — concurrent harness invocations against the same root are not supported. The wire-slice algorithm (snapshot `.runs/` before/after the exercise window) depends on this. Parallelism is achieved by giving each invocation its own `HAPPYHQ_ROOT`, not by sharing one.

## Future Enhancements

- **Web viewer for exercise artifacts** — once the artifact-dir-as-deliverable pattern shows friction, add a `/playground/exercises/<id>` page that renders `meta.json` + `dom.html` + the JSONL files in panes. Strictly additive.
- **Machine-readable fixture render endpoint** — `GET /api/playground/render?component=…&variant=…` returning `{ html, firedEvents, consoleErrors }` so Ralphie can verify atomic component changes without spinning up Playwright. Small extension of the existing fixture browser.
- **Smoke battery / pre-merge gate** — once a few exercises exist, wire `scripts/exercises/smoke/*.ts` into a single command Ralphie runs after every merge.
- **Replay viewer for past runs** — point a viewer page at `<root>/.runs/<runId>/wire.jsonl` to walk through any historical run without re-running it. Reuses the production `ActivityDebugContent` driven by the pure reducer.
- **Windows** — register desktop window components (MarkdownWindow, PdfWindow, etc.) in the fixture browser with their own canvas treatment.
- **Side-by-side** — render two variants of the same component next to each other in the fixture browser for comparison.
- **Theme testing** — when dark mode is added, toggle light/dark in the playground.
- **Viewport simulation** — render components at different container widths to test responsive behavior.
