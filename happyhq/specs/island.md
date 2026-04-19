# The Island

The contextual bottom-center control surface for task status and interaction.

## Purpose

Define the Dynamic Island — a floating UI element at the bottom-center of the Desktop that shows task activity when a task is open. When no task is open, the island is hidden — chat lives in windows and the sidebar. When a plan is ready, the island is replaced entirely by the plan approval prompt.

Think Apple's Dynamic Island: a living UI element that changes shape and content to match the moment.

## When No Task is Open

The island is hidden. Chat access is provided by:

- **Q keyboard shortcut** — opens an interactive chat window
- **Chat sidebar** — opened via toolbar or programmatically (e.g., home-page message consumption)

## When a Task is Open

When a task is selected, the island shows task activity instead of chat. The island has several sub-components based on run status:

### Task State Machine

| Run Status               | Island Mode          | Component                                                      | Content                                                                                                                                                                 |
| ------------------------ | -------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `null` (no run)          | —                    | `TaskIdleContent` in `IslandShell` (pill)                      | "Ready to start planning" + Start button (`PlayCircle` icon)                                                                                                            |
| `null` + `upgradeNeeded` | —                    | `LimitReachedOverlay` in `IslandShell` (expanded)              | Upgrade prompt — runtime exhausted, blocked before start                                                                                                                |
| `planning`               | —                    | `TaskWorkingContent` in `IslandShell` (pill)                   | Last activity step label + detail, or status sentence if no steps. Stop button (neutral styling).                                                                       |
| `plan_ready`             | `collapsed`          | `PlanApproval` (replaces island entirely)                      | Plan approval prompt: Approve / Start Over / Give Feedback / Dismiss / Open Plan.                                                                                       |
| `plan_ready`             | `composer` or `chat` | `FloatingChatContent`                                          | Plan feedback chat — user is chatting with Q about the plan.                                                                                                            |
| `working`                | —                    | `TaskWorkingContent` in `IslandShell` (pill)                   | Last activity step label + detail, or status sentence if no steps. Stop button (neutral styling).                                                                       |
| `completed` or `stopped` | `collapsed`          | `TaskCompletedContent` + Q avatar (two sibling `IslandShell`s) | Task name + restart button (`RotateCw`). Separate Q avatar pill triggers new chat. Budget stops (`stopReason: 'budget'`) are handled in the task panel, not the island. |
| `completed` or `stopped` | `composer` or `chat` | `FloatingChatContent`                                          | Composer with placeholder "What could Q do better next time?"                                                                                                           |

**Low balance warning:** When the run start or approve API returns `warning: 'low_balance'`, a `LowBalanceWarning` banner renders above the island (both in idle and active task states). Shows remaining minutes (e.g., "3m of runtime left") or "Less than 1 minute of runtime left". Non-blocking — the user can continue working.

**Stop button styling:** Neutral — `bg-black/5 text-black/50`, `rounded-full`. Not red. Hover: `bg-black/10 text-black/80`.

**Q avatar button:** When a task is completed/stopped and the island is collapsed, a separate `IslandShell` renders a Q avatar (`q-avatar.png`) to the right of `TaskCompletedContent`. These are siblings in a flex container, not nested. Clicking the avatar starts a new chat via `chatActions.newChat()`.

### Question & Confirmation Handling in Task Mode

When a task-level `AskUserQuestion` or tool approval is pending, the island shows it (these take priority over all other task states):

- `QuestionOptions` replaces the activity content
- `AskUserConfirmation` shows the tool approval prompt
- These are surfaced in the island so the user can respond without opening the sidebar

## Plan Approval Takeover

When a task's plan is ready (`status === 'plan_ready' && !approvalDismissed && islandMode === 'collapsed'`), the `PlanApproval` component **replaces the island entirely**. The island is hidden; the approval prompt takes its position. The `plan_ready` status is written only after the planning agent has fully completed, preventing the approval prompt from appearing while the agent is still writing `plan.md`.

When the user sends plan feedback, the island switches to chat mode, which hides PlanApproval (gated on `islandMode === 'collapsed'`). When the user collapses the chat (Escape / click outside), PlanApproval reappears.

**PlanApproval options:**

- **Approve** → Closes the plan window immediately, shows a spinner on the button for ~1 second while the working phase starts (`runActions.approve()`), then dismisses the approval card
- **Start Over** → Closes the plan window, stops the current run, restarts planning. Same ~1 second spinner delay before dismissal
- **Send Feedback** → Inline text input (Enter to send); starts a new learning chat in the island with the feedback message. PlanApproval hides while the chat is active and returns when collapsed.
- **Dismiss** → Hide the approval prompt (the island returns). The user can still approve from the sidebar.
- **Open Plan** → Focus/open the plan.md window

## Visual

### IslandShell Wrapper

The island content is wrapped in `IslandShell`, which provides the outer styling:

- Shadow and border treatment
- `expanded` prop toggles between `rounded-full` (collapsed pill) and `rounded-3xl` (expanded card)

### Positioning

- Bottom-center of canvas: `absolute inset-x-0 bottom-4 z-40 flex flex-col items-center`
- Max width: `max-w-3xl` with `px-6` padding
- Above all windows (z-40)

### Collapsed Pill

Minimal. Shows a prompt or status text. Click to expand. `rounded-full`.

### Expanded Card

Full card with content. `rounded-3xl`. Adapts height to content.

## Component

`DynamicIsland` in `components/features/desktop/island/dynamic-island.tsx`.

**Key props:**

- `mode: IslandMode` — Current mode (collapsed/composer/chat)
- `onActivate` — Expand from collapsed state
- `renderCreateTask?` — Optional render callback for StartTaskCard inline rendering

Task state (slug, status, activitySteps, run actions), chat state (messages, streaming, chats, actions), and interaction state (pending questions/confirmations) are read from `desktopStore` and `chatStore` via selector hooks — not passed as props.

**Sub-components** (in `island/modes/`):

- `FloatingChatContent` (`modes/chat.tsx`) — expanded chat card with `ChatContent`, "Move to sidebar" button, optional placeholder override
- `TaskWorkingContent` (`modes/working.tsx`) — compact pill showing activity
- `TaskIdleContent`, `TaskCompletedContent` (`modes/ambient.tsx`) — ambient state pills

**Billing components** (in `components/features/billing/`):

- `LimitReachedOverlay` — blocking overlay with upgrade prompt (variant: overlay). Shown when `upgradeNeeded && status === null` or when budget-stopped mid-run (`stopReason === 'budget'`).
- `LowBalanceWarning` — non-blocking amber banner above the island. Shown when `billingWarning === 'low_balance'`.

**Sidebar interaction:** When the chat sidebar is open (`sidebarOpen === true`), the island zone is not rendered — `HappyDesktop` renders nothing in the island's position. The island transitions to `opacity-0 translate-y-4` when the sidebar opens, for a smooth fade.

## Design Decisions

**Morphing over modals.** The island changes shape to match context rather than spawning separate modals or panels. This keeps the user grounded in one spatial location.

**Island is task-only.** The island only appears when a task is active. Chat lives in windows and the sidebar — the island stays focused on task status and controls.

**Plan approval replaces the island.** The plan is a human-in-the-loop checkpoint. Making it take over the island's position ensures it can't be missed.

**Task activity in the island, chat in the sidebar.** During a task, the island provides ambient awareness (what Q is doing). Deeper interaction (conversation, detailed progress) lives in the chat sidebar, which the user opens deliberately. This separation keeps the canvas clean while maintaining awareness.

## Acceptance Criteria

**Naming:**

- [x] Rename `DockShell` → `IslandShell` (file: `dock-shell.tsx` → `island-shell.tsx`) to standardize on "Island" naming

**Billing integration:**

- [x] `LimitReachedOverlay` shown when `upgradeNeeded` is set (pre-start block)
- [x] Budget-stopped tasks (`stopReason: 'budget'`) handled in task panel, not island
- [x] `LowBalanceWarning` banner shown above island when `billingWarning === 'low_balance'`

## Testing

No dedicated test files for the island itself. The Island is primarily UI rendering — mode transitions, click-outside collapse, expanded/collapsed styling — which falls outside the testing scope per `testing.md`.

Behaviors tested through other specs:

- [x] PlanApproval options (approve, start over, feedback) exercised through run loop tests
- [x] Task activity data (status, progress) tested via run API routes and loop tests
- [x] Question/confirmation handling tested via pending-questions and pending-confirmations stores
- [x] Billing state flow (upgradeNeeded, billingWarning, remainingMinutes) tested in `use-run-actions.test.ts`
- [x] `LimitReachedOverlay` and `LowBalanceWarning` rendering tested in `limit-reached.test.tsx`
- [x] `UpgradePrompt` rendering and variant behavior tested in `upgrade-prompt.test.tsx`

Not tested (UI rendering, skip per testing.md):

- DynamicIsland mode transitions (collapsed → composer → chat)
- Click-outside and Escape collapse behavior
- IslandShell expanded/collapsed styling
- TaskIdleContent / TaskWorkingContent / TaskCompletedContent layout
- Q avatar button interaction

## Activity Tracking

The island's activity display during planning and working modes is powered by `useRunActivity` — see [Working](working.md) for the full `ActivityStep` interface and event processing model. Key behaviors visible in the island:

**Thinking phase.** A stable `__thinking__` step shows during Claude's thinking phase, giving the user feedback before any tool calls begin.

**Parallel tool merging.** When Q fires multiple identical tools in parallel (e.g., 3 Read calls), they merge into a single island step rather than flashing separate entries. Merged details are joined with commas.

**Live line counting.** Write and Edit operations display a running "+N lines added" counter, updated as partial JSON streams in. The count accumulates across merged parallel blocks.

**Early detail extraction.** File paths, patterns, and descriptions appear in the island as soon as partial JSON is available — before the tool completes. This gives instant feedback on what Q is doing.

## Activity Debug Tool (dev-only)

`useActivityPreview` hook in `island/use-activity-preview.ts` listens for `Ctrl+Shift+A`. When toggled, it overrides the island's task slug, status, and activity steps with mock data (`MOCK_ACTIVITY_STEPS`), allowing the activity UI to be tested without a live run. The override is toggled off with another `Ctrl+Shift+A`. This affects only the island display — the actual store state is unchanged.

## Cross-References

- [Desktop](desktop.md) — The canvas where the island lives
- [Chat](chat.md) — Chat surfaces and shared components
- [Planning](planning.md) — Plan approval flow
- [Working](working.md) — Task execution and activity steps
- [Billing](billing.md) — Usage limits, upgrade prompts, and `paused` status
