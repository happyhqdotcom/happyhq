# Foundation

The project skeleton that every other spec builds on top of.

## Purpose

Define what gets built first — the framework, dependencies, shared utilities, configuration, and directory structure that other specs assume exist. This spec is implemented before any feature spec. It creates the app so everything else has somewhere to land.

## Framework

- **Next.js 15** with App Router. React 19.
- **TypeScript** with `strict: true`. `@/*` path alias maps to project root.
- **Tailwind v4** via `@tailwindcss/postcss`. No `tailwind.config` — Tailwind v4 uses CSS-based configuration in `globals.css`.
- **Vitest** with jsdom environment, globals enabled, `@/` alias mirrored from tsconfig. Testing Library for component tests.
- **ESLint** with `next/core-web-vitals` and `next/typescript`.
- **React Strict Mode disabled**.

## Dependencies

Beyond the framework:

- `swr` — File data fetching and caching. See [Data Flow](data-flow.md).
- `zustand` — State distribution via stores and selector hooks. See [Data Flow](data-flow.md).
- `clsx` + `tailwind-merge` — Conditional class utility for `cn()`.
- `class-variance-authority` — Component variants for multi-state UI.
- `lucide-react` — Icons.
- `geist` — Geist Sans and Geist Mono fonts. Loaded in root layout.
- `framer-motion` — Required by Catalyst navbar and sidebar animation components.

## Configuration Files

```
next.config.ts        # reactStrictMode: false
tsconfig.json         # strict: true, @/* path alias, bundler moduleResolution
postcss.config.mjs    # @tailwindcss/postcss
eslint.config.mjs     # next/core-web-vitals + next/typescript, with rules disabled for copied components
vitest.config.mts     # jsdom, globals, @/ alias
vitest.setup.ts       # localStorage mock for jsdom environment
app/globals.css       # @import 'tailwindcss', theme variables
```

## Shared Utilities

### `lib/utils.ts`

The `cn()` function — the only utility that ships with the foundation.

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

Used everywhere Tailwind classes are conditional. The rest of `lib/` is built by other specs.

### `lib/constants.server.ts`

Server-only constants. `HAPPYHQ_ROOT` lives here because it uses `homedir()` from `os` (Node-only) — the `.server.ts` suffix prevents Next.js from bundling it client-side.

```typescript
import { homedir } from 'os'
import path from 'path'

export const HAPPYHQ_ROOT =
  process.env.HAPPYHQ_ROOT || path.join(homedir(), 'HappyHQ')
```

Other specs — particularly [Filesystem Layout](filesystem-layout.md) and [Data Flow](data-flow.md) — reference this constant rather than hardcoding the path. Client-safe constants (`MODEL_IDS`, `MAX_ITERATIONS`, etc.) live in `lib/constants.ts`.

### `.server.ts` Suffix Convention

Any module that imports Node-only APIs (`node:fs`, `node:path`, `node:os`, `node:child_process`) or contains server-only logic (API keys, filesystem operations, SDK calls) must use the `.server.ts` suffix. Next.js uses this suffix to exclude the module from client bundles. Omitting it causes either a build error (Node API in browser bundle) or a security issue (server secrets in client bundle). All server-only modules in `lib/` follow this convention. Test files for server modules use `.server.test.ts`.

## Visual System

The visual system is the HappyHQ design system.

### Component Library

The base component primitives:

- `components/common/ui/*` — shadcn/ui primitives
- `components/common/catalyst/*` — Catalyst primitives
- `components.json` — shadcn config

Two component libraries, both pre-styled with the correct tokens, variants, and patterns. **Catalyst is preferred** for new components — it provides built-in accessibility (focus trapping, ARIA attributes, keyboard navigation). Use shadcn/ui for structural/decorative components where Catalyst has no equivalent. Either library over raw HTML elements.

| Concern                         | Library             | Examples                                     |
| ------------------------------- | ------------------- | -------------------------------------------- |
| Buttons, links                  | Catalyst            | `Button` from catalyst                       |
| Navigation bars                 | Catalyst            | `Navbar`, `NavbarItem`                       |
| Dialogs, forms                  | Catalyst            | `Dialog`, `Field`, `Label`, `Input`          |
| Dropdowns/menus                 | Catalyst            | `Dropdown`, `DropdownButton`, `DropdownItem` |
| Layout, cards, badges, tooltips | shadcn/ui           | No Catalyst equivalent                       |
| Toast notifications             | sonner (via shadcn) | `Toaster` in root layout                     |

**Use these directly. Don't create new base components unless there's a gap in both libraries.** Feature-level compositions go in `components/features/`.

### Typography

- **Geist Sans** — Primary typeface for all UI text. Loaded via the `geist` package in root layout.
- **Geist Mono** — Code blocks, progress logs, monospace contexts.

### Color

**Light mode only.** No dark mode, no workspace color themes. Implementation: `globals.css` uses `@custom-variant dark (&:where(.dark, .dark *))` to redefine Tailwind's dark variant. This makes all `dark:` utilities no-ops unless the `.dark` class is explicitly added to the DOM — which the app never does. Dark-mode utilities from copied components are silently suppressed without needing to be removed.

**Desktop background.** `--desktop-bg: oklch(0.93 0.01 80)` — warm neutral background for the desktop canvas. `--background` is set to the same value so the page background and canvas match. `--sidebar` is also overridden to this value for visual continuity.

All color tokens live in `globals.css` as CSS custom properties (popover tokens, chart colors, animations, utilities). Light mode only — no `.dark` block. Key tokens:

```
--background / --foreground
--card / --card-foreground
--primary / --primary-foreground
--secondary / --secondary-foreground
--muted / --muted-foreground
--accent / --accent-foreground
--destructive / --destructive-foreground
--border / --input / --ring
--sidebar / --sidebar-foreground / --sidebar-primary / --sidebar-accent / --sidebar-border / --sidebar-ring
```

Use semantic Tailwind classes (`bg-primary`, `text-muted-foreground`, `border-input`), not raw HSL values.

### Icons

Lucide React.

### Locked Patterns

Specific visual decisions locked in:

**Grid background.** `CANVAS_GRID_OVERLAY` lives in `components/features/desktop/constants.ts` — a dual-layer grid with 64px major lines and 16px minor lines. Used as canvas texture on the desktop.

**Panel corners.** `rounded-t-2xl` on main content panels. `rounded-tl-2xl` / `rounded-tr-2xl` on sidebars.

**Border treatment.** `border-black/5` or `ring-1 ring-black/10` for subtle panel separation. No heavy borders.

**Shadow hierarchy.** `shadow-xs` (inputs) → `shadow-sm` (cards, buttons) → `shadow-md` (elevated content) → `shadow-lg` (modals, floating panels).

**Border radius.** Base `--radius: 0.6rem` with derivatives: `--radius-sm` (calc - 4px), `--radius-md` (calc - 2px), `--radius-lg` (base), `--radius-xl` (calc + 4px).

**Sidebar dimensions.** `--sidebar-width: 250px` (expanded), `--sidebar-width-icon: 48px` (collapsed/icon-only). The original `24rem`/`3rem` defaults from the shadcn sidebar primitive were overridden.

### Visual Philosophy

- Typography-forward, minimal chrome — whitespace does the work, not borders and shadows
- Inspired by: Claude.ai (conversational surfaces), Granola (content lists), Codex (task lists)
- Clean rows, good spacing, no heavy containers unless needed for interaction affordance
- No card borders on list items — typography and spacing create hierarchy

### Error Display

Two error surfaces, each for a different situation:

- **Toast (`sonner`)** — for mutation failures, API errors, permission denials, and transient errors where the user cannot take a corrective action in-place. Call `toast.error(message)` from `sonner`. The `<Toaster position="top-right" />` is mounted in root layout. Examples: failed chat session creation, SDK permission denials, network errors during streaming.
- **Inline error states** — for structural data-loading errors where the component can render an alternative view. A 404 from SWR means "doesn't exist yet" and triggers empty-state UI or a redirect, not a toast. A 500 triggers an error state with a retry affordance.

If the system recovers on its own (successful retry, self-healing iteration), no error is shown. If the user needs to act (retry a message, fix a config, provide different input), the error is visible where they'd take that action.

### Constraint

No custom colors outside the token palette. No custom shadows or border-radius values. If a component needs a value that doesn't exist in the copied library, flag it — don't invent.

## Source Directory Structure

This spec creates only what it populates. Other specs create their own directories when they need them.

```
app/                   # Next.js App Router pages and layouts
  globals.css          # Tailwind imports, theme variables (light mode only)
  layout.tsx           # Root layout (loads Geist fonts)
components/
  common/
    ui/                # shadcn/ui components
    catalyst/          # Catalyst components
  features/            # Feature-specific components (flat folders)
lib/
  utils.ts             # cn()
  constants.ts         # App constants
```

Other specs create their own structure when built:

- [Data Flow](data-flow.md) → `lib/fs/`, `lib/swr.ts`, `lib/actions.ts`, `stores/chatStore.ts`, `stores/windowStore.ts`
- [Agent Configuration](agent-config.md) → `lib/agents/`, `prompts/`

## Design Decisions

**A buildable spec, not a reference doc.** A conventions file is something Ralph consults while building other specs. A foundation spec is something Ralph builds first, and the decisions are embedded in the implementation. Every other spec can assume this skeleton exists.

**Feature folders, not atomic design.** `components/features/{feature}/` with components at the top level. No `atoms/` or `molecules/` sub-classification. Simple features (e.g., `launch/`) stay flat. Complex features (e.g., `desktop/`) can grow internal subdirectories (`hooks/`, `icons/`, `island/`, `windows/`) when the component count warrants it.

**Copy components, don't rebuild.** The shadcn/ui and Catalyst components have been iterated on — button styles, input treatments, shadow levels, focus rings. Copying them gives Ralph the exact design vocabulary immediately.

**Light mode only.** No dark mode, no workspace color themes.

## Setup Checklist

### npm packages to install

**Runtime:**

```bash
pnpm add swr zustand clsx tailwind-merge class-variance-authority lucide-react geist react-markdown remark-gfm
```

**Tailwind plugins:**

```bash
pnpm add @tailwindcss/typography tailwindcss-animate
```

**Radix UI (shadcn component dependencies):**

```bash
pnpm add @radix-ui/react-slot @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-tooltip @radix-ui/react-separator @radix-ui/react-select @radix-ui/react-tabs @radix-ui/react-accordion
```

Additional Radix packages may be required by specific components — resolve from build errors after install.

### Other setup

- Create `.env.example` with `ANTHROPIC_API_KEY=`
- Create `.env.local` (gitignored) with actual API key

### Build gate

**`pnpm build` must pass before proceeding to any other spec.** All import paths resolved, all dependencies installed, all copied components compiling.

## Tests

No unit tests. This spec creates configuration, copies components, and installs dependencies — the build gate (`pnpm build`, `pnpm check-types`, `pnpm lint`) is the verification. Unit tests are for behavioral code, which this spec does not produce.

## Acceptance Criteria

- [x] Next.js 15, React 19, TypeScript strict, Tailwind v4, Vitest configured
- [x] All dependencies from the setup checklist installed
- [x] `lib/utils.ts` exports `cn()` (clsx + tailwind-merge)
- [x] `lib/constants.server.ts` exports `HAPPYHQ_ROOT`
- [x] `components/common/ui/` contains shadcn/ui components
- [x] `components/common/catalyst/` contains Catalyst components
- [x] `globals.css` contains light-mode design tokens
- [x] Root layout loads Geist Sans and Geist Mono fonts
- [x] Copied components render correctly with theme tokens
- [x] `.env.example` exists with `ANTHROPIC_API_KEY=`
- [x] `pnpm build` passes
