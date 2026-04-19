# Settings

Q's control center — configuration, account management, and system preferences.

## Purpose

Define a comprehensive settings experience that surfaces real app configuration in an organized, accessible way. Settings replaces the current minimal setup (four flat pages, mostly empty) with a Granola-inspired grouped sidebar, proper separation of concerns (usage vs billing, history as a real page), and new controls for model selection, budgets, and personalization.

## Related Specs

- [Accounts](accounts.md) — User identity, login, profile management
- [Billing](billing.md) — Pricing, subscriptions, usage tracking
- [Auth](auth.md) — Anthropic API credentials
- [History](history.md) — File versioning and git layer
- [Git Layer](git-layer.md) — Commit infrastructure powering the activity timeline
- [Sidebar](sidebar.md) — Main app sidebar (settings has its own sidebar)

## Design References

- **Granola** (`specs/refs/Screenshot 2026-03-20 at 9.43.39 AM.png`) — gold standard. Grouped sidebar sections, profile card at top, sign-out at bottom, clean row layout with label + description + control. App icon picker with multiple options.
- **Codex** (`specs/refs/Screenshot 2026-03-20 at 10.11.32 AM.png`) — good reference for developer-oriented settings (model selection, thread detail, speed controls).

## Current State

Settings currently has four pages (General, Account, BYO AI, Billing) in a flat sidebar list. Key problems:

- General page only has a "danger zone" reset-history action — feels empty
- Sign-out is duplicated (Account page + sidebar footer popover)
- Model selection, budgets, and iteration limits are hardcoded in `lib/constants.ts`
- Usage and billing are combined on one page
- No grouped organization in the sidebar
- "Bring Your Own AI" is a clunky name
- No way to see workspace-wide history outside of individual streams

---

## Sidebar Navigation

The settings sidebar is organized into semantic groups with lowercase section headers. A user profile card sits at the top, and sign-out anchors the bottom.

```
[< Back to app]

┌─────────────────────┐
│ [Avatar] Example User│
│   user@example.com  │  ← clickable → /settings/account
└─────────────────────┘

Preferences
  General              /settings/general

Workspace
  Models & Limits      /settings/models
  Usage                /settings/usage
  Billing              /settings/billing

Data
  History              /settings/history

────────────────────
  Advanced             /settings/advanced
────────────────────
[Sign out]
```

### Sidebar Data Structure

The current `SettingsSidebar` (`app/(settings)/settings/_components/sidebar.tsx`) uses a flat `SETTINGS_ITEMS` array. Refactor to a grouped structure:

```typescript
type SettingsGroup = {
  label: string
  items: SettingsItem[]
}

const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    label: 'Preferences',
    items: [{ href: '/settings/general', label: 'General', icon: Settings }],
  },
  {
    label: 'Workspace',
    items: [
      { href: '/settings/models', label: 'Models & Limits', icon: Cpu },
      {
        href: '/settings/usage',
        label: 'Usage',
        icon: BarChart3,
        requiresAccounts: true,
        requiresBilling: true,
      },
      {
        href: '/settings/billing',
        label: 'Billing',
        icon: CreditCard,
        requiresAccounts: true,
        requiresBilling: true,
      },
    ],
  },
  {
    label: 'Data',
    items: [{ href: '/settings/history', label: 'History', icon: Clock }],
  },
]

// Advanced is a standalone item below the groups, not inside a group.
// Rendered separately before the sign-out footer.
const ADVANCED_ITEM = {
  href: '/settings/advanced',
  label: 'Advanced',
  icon: Wrench,
}
```

Render each group with `SidebarGroup` + `SidebarGroupLabel` for the section header. Use `text-xs font-medium text-zinc-400` for group labels.

### Profile Card

At the top of the sidebar (in `SidebarHeader`), show the user's avatar, name, and email. Clicking navigates to `/settings/account`. Only shown when accounts are enabled.

### Sign-out

At the bottom of the sidebar (in `SidebarFooter`), a plain button. Calls `db.auth.signOut()` and redirects to `/login`. Only shown when accounts are enabled.

Remove sign-out from:

- `AccountSettings` component (currently line 263)
- `AccountFooter` popover (the popover keeps the "Settings" link but loses "Log out")

### Conditional Visibility

Same logic as today:

- Profile card → only when `isAccountsEnabledClient()` is true
- Usage, Billing → only when both accounts AND `NEXT_PUBLIC_BILLING_ENABLED` are true (Usage displays subscription/runtime data that requires billing infrastructure)
- When accounts disabled: sidebar shows General, Models & Limits, History, Advanced. No profile card, no sign-out.

---

## Row Design Pattern

Every settings row follows the same layout already used throughout the codebase. Extract this into a reusable `SettingsRow` component at `app/(settings)/settings/_components/settings-row.tsx`:

```
┌──────────────────────────────────────────────────────┐
│  Label                                    [Control]  │
│  Description text (muted)                            │
└──────────────────────────────────────────────────────┘
```

```typescript
interface SettingsRowProps {
  label: string
  description?: string
  children: React.ReactNode // the control (right side)
}
```

CSS: `flex items-center justify-between py-3` with `text-sm font-medium text-zinc-950` for label and `text-sm text-zinc-500` for description. Rows separated by `border-t border-zinc-950/5` dividers. This codifies the pattern already used in `AccountSettings`, `AuthConnection`, `BillingSettings`, and `DangerZone`.

---

## Pages

### General (`/settings/general`)

The default landing page. Currently only contains "Danger Zone" — history reset moves to its own page, and General becomes the home for app-wide preferences.

#### Preferences

| Setting         | Description                                  | Control         | Default | Notes                                                                                                                                                                         |
| --------------- | -------------------------------------------- | --------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar default | Whether the sidebar starts open or collapsed | Toggle (Switch) | Open    | Currently persisted via `sidebar_state` cookie. Surface as a visible preference.                                                                                              |
| Send with Enter | How the composer submit shortcut works       | Toggle (Switch) | On      | **On**: Enter sends, Shift+Enter for newline. **Off**: Enter for newline, Cmd+Enter (⌘↵) to send. Currently hardcoded in `composer.tsx` line 190. Stored in `.settings.json`. |

#### Appearance

| Setting       | Description                                                  | Control                          | Default  | Notes                                                   |
| ------------- | ------------------------------------------------------------ | -------------------------------- | -------- | ------------------------------------------------------- |
| Home branding | What shows on the home page behind the greeting and composer | Segmented control or radio group | Stickers | Controls the branding/decoration mode on the home page. |

The home page currently has draggable stickers scattered around (beaver, bushes, umbrella, worm, chard, poolside scene, logo, potted plant) with the chipmunk mascot at the bottom that toggles them on/off. This setting replaces that toggle with a proper preference. Options:

- **Stickers** (default) — the current draggable sticker experience. All brand illustrations scattered across the page. The chipmunk mascot at the bottom still toggles them.
- **Poolside** — the full poolside scene (`Poolside.png`) displayed as a large background element along the bottom of the home page (the hidden `sm:hidden` version that already exists in `home-page.tsx` line 94-101, but made visible).
- **Logo** — just the HappyHQ logo centered, clean and simple.
- **Random** — randomly picks one of the above modes each time the home page loads.
- **None** — clean, undecorated home page. Just the greeting and composer.

Store the preference in `.settings.json` alongside the model/limit settings. The `HomePage` component reads this value to decide which branding mode to render.

```
General

  Preferences
  ┌─────────────────────────────────────────────────┐
  │ Sidebar default                       [Toggle]  │
  │ Start with the sidebar open or collapsed        │
  └─────────────────────────────────────────────────┘

  Appearance
  ┌─────────────────────────────────────────────────┐
  │ Home branding                                   │
  │ What shows on the home page                     │
  │                                                 │
  │ (•) Stickers  ( ) Poolside  ( ) Logo            │
  │ ( ) Random    ( ) None                          │
  └─────────────────────────────────────────────────┘
```

---

### Account (`/settings/account`)

Reached by clicking the profile card in the sidebar. Same content as today, minus sign-out and billing link (both moved elsewhere).

#### Profile

| Setting      | Description    | Control                                             | Notes     |
| ------------ | -------------- | --------------------------------------------------- | --------- |
| Photo        | Profile avatar | Avatar with edit overlay (click to upload, 5MB max) | Unchanged |
| Display name | Your name      | Text input + "Save changes" button on change        | Unchanged |
| Email        | Login email    | Read-only text                                      | Unchanged |

#### Danger Zone

| Setting        | Description                                  | Control                                           | Notes                  |
| -------------- | -------------------------------------------- | ------------------------------------------------- | ---------------------- |
| Delete account | Permanently delete your account and all data | Red "Delete account" button → confirmation dialog | Unchanged from current |

**Removed from this page:**

- Log out button → moves to sidebar bottom
- Billing "Manage" link → Billing is now its own sidebar item

---

### Advanced (`/settings/advanced`)

A catch-all page for power-user settings that most users never need to touch. Sits as a standalone sidebar item below the main groups, visually separated.

#### Bring Your Own AI

For users who want to use their own Anthropic credentials instead of a managed account. The existing `AuthConnection` component is reused unchanged.

| Setting              | Description                     | Control                     | Notes                                   |
| -------------------- | ------------------------------- | --------------------------- | --------------------------------------- |
| Claude login         | OAuth connection status         | "Log out" / "Log in" button | Unchanged                               |
| Anthropic API key    | API key configuration           | "Remove" / "Add" button     | Unchanged                               |
| Managed (AI Gateway) | Organization-managed connection | Read-only status text       | Only shown when `method === 'accounts'` |

As other power-user settings emerge, they become additional sections on this page.

---

### Models & Limits (`/settings/models`)

**New page.** Exposes the currently hardcoded constants from `lib/constants.ts`. This is what makes settings feel like a real control center.

#### Agent Models

Each mode has its own model and thinking configuration. All three currently use Opus with adaptive thinking.

| Setting           | Description                      | Control                            | Default  | Source                                                 |
| ----------------- | -------------------------------- | ---------------------------------- | -------- | ------------------------------------------------------ |
| Learning model    | Model for learning conversations | Dropdown: Haiku / Sonnet / Opus    | Opus     | `learningAgentOptions` in `config.server.ts`           |
| Learning thinking | Thinking behavior for learning   | Dropdown: Adaptive / Enabled / Off | Adaptive | `thinking: { type: 'adaptive' }` in `config.server.ts` |
| Planning model    | Model for plan generation        | Dropdown: Haiku / Sonnet / Opus    | Opus     | `planningAgentOptions` in `config.server.ts`           |
| Planning thinking | Thinking behavior for planning   | Dropdown: Adaptive / Enabled / Off | Adaptive | `thinking: { type: 'adaptive' }` in `config.server.ts` |
| Working model     | Model for task execution         | Dropdown: Haiku / Sonnet / Opus    | Opus     | `workingAgentOptions` in `config.server.ts`            |
| Working thinking  | Thinking behavior for working    | Dropdown: Adaptive / Enabled / Off | Adaptive | `thinking: { type: 'adaptive' }` in `config.server.ts` |

**Thinking modes:**

- **Adaptive** (default) — Claude decides when and how much to think. Best balance of quality and speed.
- **Enabled** — Always use extended thinking. Higher quality reasoning but slower and more expensive.
- **Off** — No extended thinking. Fastest responses, lower cost, but may reduce quality on complex tasks.

Display as rows per mode, with model and thinking dropdowns side by side on the right, so the relationship between model and thinking is clear:

```
  Agent models
  ┌─────────────────────────────────────────────────┐
  │ Learning                  [Opus ▾] [Adaptive ▾] │
  │ Model for learning conversations                │
  │─────────────────────────────────────────────────│
  │ Planning                  [Opus ▾] [Adaptive ▾] │
  │ Model for plan generation                       │
  │─────────────────────────────────────────────────│
  │ Working                   [Opus ▾] [Adaptive ▾] │
  │ Model for task execution                        │
  └─────────────────────────────────────────────────┘
```

#### Budget & Limits

| Setting         | Description                         | Control                    | Default | Source                                  |
| --------------- | ----------------------------------- | -------------------------- | ------- | --------------------------------------- |
| Planning budget | Maximum spend per planning run      | Number input with $ prefix | $5      | `PLANNING_BUDGET_USD` in `constants.ts` |
| Working budget  | Maximum spend per task execution    | Number input with $ prefix | $10     | `WORKING_BUDGET_USD` in `constants.ts`  |
| Max iterations  | Maximum working iterations per task | Number input               | 20      | `MAX_ITERATIONS` in `constants.ts`      |

```
Models & Limits

  (Agent models mockup is above)

  Budget & limits
  ┌─────────────────────────────────────────────────┐
  │ Planning budget                     [$  5    ]  │
  │ Maximum spend per planning run                  │
  │─────────────────────────────────────────────────│
  │ Working budget                      [$ 10    ]  │
  │ Maximum spend per task execution                │
  │─────────────────────────────────────────────────│
  │ Max iterations                      [  20    ]  │
  │ Maximum working iterations per task             │
  └─────────────────────────────────────────────────┘
```

#### Server-Side Config Storage

These settings affect server-side agent behavior, so they can't live in localStorage alone. Store them in a workspace config file that the server can read at agent invocation time.

**File**: `.settings.json` (alongside the existing `data/` directory used by the git layer)

**Schema:**

```typescript
interface AppConfig {
  models?: {
    learning?: {
      model?: 'haiku' | 'sonnet' | 'opus'
      thinking?: 'adaptive' | 'enabled' | 'disabled'
    }
    planning?: {
      model?: 'haiku' | 'sonnet' | 'opus'
      thinking?: 'adaptive' | 'enabled' | 'disabled'
    }
    working?: {
      model?: 'haiku' | 'sonnet' | 'opus'
      thinking?: 'adaptive' | 'enabled' | 'disabled'
    }
  }
  limits?: {
    planningBudgetUsd?: number
    workingBudgetUsd?: number
    maxIterations?: number
  }
  general?: {
    sidebarDefault?: 'open' | 'collapsed'
    sendWithEnter?: boolean // true = Enter sends, false = Cmd+Enter sends
  }
  appearance?: {
    homeBranding?: 'stickers' | 'poolside' | 'logo' | 'random' | 'none'
  }
  git?: {
    authorName?: string // overrides account name / "Q" default
    authorEmail?: string // overrides account email / "q@happyhq.com" default
  }
}
```

**API**: `GET /api/config` reads the file and returns a fully resolved config with all defaults filled in. `PUT /api/config` accepts a partial update, merges it with the existing config, and returns the resolved result. Client hook: `useConfig()` (SWR) and `useUpdateConfig()` in `lib/config/use-config.ts`.

**Integration**: The agent config factories (`planningAgentOptions`, `workingAgentOptions`, `learningAgentOptions` in `lib/agents/config.server.ts`) read from this config at invocation time, falling back to the current hardcoded defaults in `constants.ts` when values are missing.

**What is NOT exposed** (intentionally):

- `LLM_COST_PER_MINUTE_USD` — internal billing math
- `MAX_AVATAR_SIZE` — validation constant
- Agent tool permission lists — core safety invariant
- `acceptEdits` mode — core safety invariant

---

### Usage (`/settings/usage`)

**New page.** Splits the usage display out of the current Billing page. Usage is meaningful even on the free tier and is conceptually separate from payment management.

| Setting       | Description                      | Control                                   | Notes                                    |
| ------------- | -------------------------------- | ----------------------------------------- | ---------------------------------------- |
| Current plan  | Tier name and price              | Read-only text (e.g., "Starter — $30/mo") | Extracted from current `BillingSettings` |
| Runtime usage | Minutes used this billing period | Progress bar with "Xm / Ym" label         | Extracted from current `BillingSettings` |

If usage is at 90%+, show an amber warning. If at 100%, show "Runtime limit reached."

If the user is on the free tier, show a subtle "Upgrade" link pointing to `/settings/billing`.

```
Usage

  ┌─────────────────────────────────────────────────┐
  │ Current plan                  Starter — $30/mo  │
  │─────────────────────────────────────────────────│
  │ Runtime usage                    45m / 120m     │
  │ ████████████░░░░░░░░░░░░░░░░░░░░  37%          │
  └─────────────────────────────────────────────────┘
```

Extract the usage meter and plan display from `BillingSettings` into a new `UsageSettings` component at `components/features/settings/usage-settings.tsx`.

---

### Billing (`/settings/billing`)

Simplified now that usage has its own page. Billing is purely about payment and subscription management.

| Setting             | Description                 | Control                       | Notes                                    |
| ------------------- | --------------------------- | ----------------------------- | ---------------------------------------- |
| Current plan        | Tier + price                | Read-only text                | Kept here too for context                |
| Manage subscription | Open Stripe customer portal | Button: "Manage subscription" | Only shown when `currentTier !== 'free'` |
| Upgrade options     | Available higher tiers      | Button per tier with price    | Same as today                            |

The usage progress bar is removed from this page.

---

### History (`/settings/history`)

**New page.** More than just a reset button — it's a workspace-wide activity timeline. The git layer already tracks all changes across all streams and tasks via structured commit messages, but currently you can only see history scoped to individual streams via the Git Log window. This page surfaces the full picture.

#### Git Identity

Controls how your activity is attributed in the git history.

| Setting      | Description          | Control    | Default                                                      | Notes                                        |
| ------------ | -------------------- | ---------- | ------------------------------------------------------------ | -------------------------------------------- |
| Author name  | Name on git commits  | Text input | Account name if accounts enabled, otherwise "Q"              | Overrides the account-derived default if set |
| Author email | Email on git commits | Text input | Account email if accounts enabled, otherwise "q@happyhq.com" | Overrides the account-derived default if set |

**Behavior:**

- Inputs show `"Q"` and `"q@happyhq.com"` as placeholder text, reflecting the server-side defaults used when no override is set.
- If the user explicitly sets values, those always win. A "Reset to default" link clears the override when any override is set.
- Stored in `.settings.json` under `git.authorName` / `git.authorEmail`. The git init code in `lib/git/init.server.ts` reads from config instead of hardcoding `"Q"`.

#### Activity

A scrolling timeline of all workspace activity, fetched from `/api/git/log` with no scope filter. Each entry shows:

- Commit subject (with `[stream/task]` prefix parsed into a clickable badge)
- Relative timestamp ("2 hours ago", "yesterday")
- `[done]` badge highlighted in green for completed tasks

```
History

  Activity
  ┌─────────────────────────────────────────────────┐
  │ [blog/write-intro]  Draft introduction    2h ago│
  │ [blog/write-intro]  Completed ✓       yesterday│
  │ [app/settings]  Add billing page        2 days  │
  │ [app/settings]  Initial layout          3 days  │
  │ [app]  Created stream                   3 days  │
  │                                                 │
  │              [Load more]                        │
  └─────────────────────────────────────────────────┘
```

**Implementation notes:**

- Reuse the data fetching pattern from `GitLogContent` (`components/features/desktop/windows/git-log-content.tsx`) which already calls `/api/git/log` via SWR with polling
- The existing `getGitLog(limit?, grep?)` in `lib/git/log.server.ts` returns `{ hash, subject, date }` entries — everything needed
- Start with `limit=50`, add a "Load more" button that increases the limit
- Parse `[stream/task]` prefixes from commit subjects to render as styled badges (the git-log-content component already does this highlighting)
- No scope filtering — always show all workspace activity (unlike the Git Log window which scopes to current stream/task)
- Consider a search/filter input at the top to grep commits by keyword (the backend `grep` parameter already supports this)

#### Danger Zone

| Setting       | Description                                                          | Control                                          | Notes                                   |
| ------------- | -------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| Reset history | Clears the activity log. Streams, tasks, and files are not affected. | Red "Reset history" button → confirmation dialog | Same `DangerZone` component, relocated. |

---

## Component Changes

### Moved

| Component          | From                                        | To                                  |
| ------------------ | ------------------------------------------- | ----------------------------------- |
| Sign-out button    | `AccountSettings` + `AccountFooter` popover | Settings sidebar footer             |
| Billing link       | `AccountSettings`                           | Removed (Billing is a sidebar item) |
| `DangerZone`       | General page                                | History page                        |
| Usage progress bar | `BillingSettings`                           | New `UsageSettings` component       |

### Modified

| Component         | Change                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------- |
| `AccountSettings` | Remove sign-out button and billing link                                                   |
| `BillingSettings` | Remove usage meter (moves to Usage). Current plan display kept on both pages for context. |
| `AccountFooter`   | Remove "Log out" from popover menu (keep "Settings" link)                                 |
| `SettingsSidebar` | Rewrite: flat list → grouped sections with profile card + sign-out footer                 |

### New Components

| Component            | Path                                                    | Purpose                                             |
| -------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| `SettingsRow`        | `app/(settings)/settings/_components/settings-row.tsx`  | Reusable row layout                                 |
| `ModelSettings`      | `components/features/settings/model-settings.tsx`       | Model dropdowns + budget/limit inputs               |
| `UsageSettings`      | `components/features/settings/usage-settings.tsx`       | Plan display + runtime progress bar                 |
| `HomeBrandingPicker` | `components/features/settings/home-branding-picker.tsx` | Stickers / Poolside / Logo / Random / None selector |
| `ActivityTimeline`   | `components/features/settings/activity-timeline.tsx`    | Workspace-wide git history timeline                 |

### New Routes

| Route                | File                                                            |
| -------------------- | --------------------------------------------------------------- |
| `/settings/models`   | `app/(settings)/settings/models/page.tsx`                       |
| `/settings/usage`    | `app/(settings)/settings/usage/page.tsx`                        |
| `/settings/history`  | `app/(settings)/settings/history/page.tsx`                      |
| `/settings/advanced` | `app/(settings)/settings/advanced/page.tsx` (replaces `byo-ai`) |

---

## Critical Files

Files that need modification or serve as reference for new components:

- `app/(settings)/settings/_components/sidebar.tsx` — core rewrite (grouped sections, profile card, sign-out)
- `lib/constants.ts` — hardcoded values being made configurable
- `lib/agents/config.server.ts` — agent factories need to read from config file
- `components/features/settings/account-settings.tsx` — remove sign-out + billing link
- `components/features/settings/billing-settings.tsx` — extract usage into separate component
- `components/features/sidebar/atoms/account-footer.tsx` — remove Log out from popover
- `components/features/desktop/windows/git-log-content.tsx` — reference for history timeline (reuse data fetching + subject parsing)
- `lib/git/log.server.ts` — `getGitLog()` already returns everything needed for activity timeline
- `components/features/home/home-page.tsx` — branding modes live here (stickers, poolside, logo); needs to read config preference
- `components/common/sticker.tsx` — draggable sticker component used by stickers mode

---

## Future Considerations

Things worth exposing as settings eventually, but not in scope for the initial build.

- **Workspace path** — currently hardcoded to `~/HappyHQ` (`HAPPYHQ_ROOT` in `lib/constants.server.ts`). Could let users pick where files live. Opens the door to cloud storage (GDrive, Dropbox) down the road.
- **Accepted file types** — composer only accepts `.pdf`, `.eml`, `.docx` (hardcoded in `composer.tsx`). As we support more formats, a setting to enable/disable types or show what's supported.
- **Tool approvals** — agents use `acceptEdits` mode and a safe-bash whitelist (`lib/agents/bash-safety.server.ts`). Power users may want to auto-approve all file writes in working mode, or require confirmation for everything. Could be a simple toggle per mode on the Advanced page.
- **Notifications** — task completion alerts when running in background (similar to Codex's notification settings).
- **Keyboard shortcuts** — customizable keybindings beyond just the Enter/Cmd+Enter send behavior.
