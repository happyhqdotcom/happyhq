# Exercising the UI

How to drive the running app from a script (Playwright via `@playwright/mcp`, or the library directly) without thrashing on the same handful of gotchas every time.

## When to use this

- **Ralphie's Exercise step** — the step between "lint/types/test" and "open PR" where the loop drives the actual UI to confirm a fix works. Both [PROMPT_bugs_fix.md](PROMPT_bugs_fix.md) step 5b and [PROMPT_tech_debt_fix.md](PROMPT_tech_debt_fix.md) step 6a point here.
- **Manual UI verification** — when you're checking a fix yourself with a Playwright script and don't want to rediscover the pitfalls.
- **Anywhere else that drives the app via a real browser.**

This file owns the UI-driving knowledge for the codebase. Server-side / API verification has its own home in [CLAUDE.md](../CLAUDE.md) under "Using HappyHQ's API for verification" and is more deterministic — no parallel doc for it yet.

## Helpers

### `scripts/dev-server.ts` — dev-server lifecycle

```
npx tsx scripts/dev-server.ts start       # boot pnpm dev in background
npx tsx scripts/dev-server.ts wait-ready  # poll /api/auth/status until 200
npx tsx scripts/dev-server.ts stop        # kill the dev server
npx tsx scripts/dev-server.ts status      # check if it's running
```

Default port 3000. Override with `PORT=3030 npx tsx ...` if 3000 is in use (e.g. by your interactive dev session). PID + log paths are per-CWD under `/tmp/happyhq-dev-server.<hash>.{pid,log}` so concurrent worktrees don't collide.

### `@playwright/mcp` — browser tools

Registered in `.mcp.json` at the repo root. Tools available to any Claude Code session in this checkout: `browser_navigate`, `browser_click`, `browser_type`, `browser_take_screenshot`, etc. Headless chromium by default.

If you're driving Playwright directly (not through MCP), spawn a sandbox install rather than adding to package.json:

```sh
mkdir -p /tmp/happyhq-dogfood && cd /tmp/happyhq-dogfood
npm install playwright && npx playwright install chromium
# write your script, run with `node script.mjs`
```

## Pitfalls (the things we keep tripping on)

### 1. `networkidle` lies in Next dev mode

`waitForLoadState('networkidle')` returns before hot-compile finishes. The page renders the old shell while the new route compiles in the background — and your next interaction fires against the wrong DOM.

**Wait for a deterministic page signal instead:**

```js
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(
  () => document.title.toLowerCase().includes('hello test'),
  { timeout: 60000 },
)
```

Title is reliable because Next sets it from `generateMetadata` only after the route component loads. Role-based selectors (`getByRole('heading', { name: ... })`) also work.

### 2. First-compile in dev mode is slow

Cold route compile can take 30+ seconds. Default Playwright timeouts (5s for waits, 30s for nav) trip routinely.

```js
page.setDefaultTimeout(15000) // for getByText, click, etc.
page.setDefaultNavigationTimeout(60000) // for goto
```

Or pass an explicit `{ timeout: 60000 }` on the first wait after each navigation.

### 3. Global hotkeys need document focus

The codebase's `/` hotkey to open the command menu (and similar global keys) checks `e.target.tagName !== 'INPUT'/'TEXTAREA'` and `!isContentEditable`. After hydration, focus may have landed in an input, so `page.keyboard.press('/')` does nothing visible.

```js
await page.click('body', { position: { x: 700, y: 600 } }) // anywhere safe
await page.keyboard.press('/')
```

Click coordinates that are clearly empty (below the content) so you don't accidentally trigger something.

### 4. Button labels are dynamic; read the affordances

Don't grep for `getByRole('button', { name: /preview/i })` based on the issue body's vocabulary. The actual button text changes with state — the URL-input page shows "Search" or "Add" depending on whether an unfurl has loaded, and the on-screen hint says "press Enter".

When unsure, take a screenshot and look at it, or use `page.locator('button').allTextContents()` to enumerate. Don't assume.

### 5. Routes gate command-menu items

Some surfaces only appear when the app's panel state matches. The `taskSlug`-gated items in the command menu (e.g. "Add from the web") need `openPanel.type === 'task'` — set by the `(desktop)` route group, not by the `(app)/tasks/inbox/[task]` inline-on-home variant.

When picking a deep-link target, **match the route group to the surface you need to reach** (see Routing below).

### 6. Task/stream slugs are environment-specific

Don't hardcode a slug — query the running app's API to find one that exists in this checkout's `~/HappyHQ/`:

```js
const res = await fetch('http://localhost:3030/api/fs/task-items')
const items = await res.json()
const slug = items[0]?.slug
```

For tasks-with-stream, `items[0].frontmatter.stream` gives the stream slug. For tasks without a stream, the URL is `/task/<slug>` (desktop) or `/tasks/inbox/<slug>` (inline-on-home).

## Routing cheat-sheet

What URL gets you which surface. Add to this as you discover more.

| Surface                 | Route                                | Notes                                                                                                                  |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Home / task list        | `/` → redirects to `/tasks`          | The redirect is fine; let it happen.                                                                                   |
| Task page (desktop)     | `/task/[task]`                       | Sets `openPanel.type === 'task'`; gates command-menu's "Add from the web" and friends.                                 |
| Task page (with stream) | `/[stream]/[task]`                   | Same `openPanel` semantics as above.                                                                                   |
| Task inline on home     | `/tasks/inbox/[task]`                | Renders home with task expanded inline. **Does not** set `openPanel` — task-aware command-menu items are missing here. |
| Stream                  | `/[stream]`                          |                                                                                                                        |
| Chat                    | `/chat/[id]`                         |                                                                                                                        |
| Command menu            | `/` keystroke from any page (hotkey) | Toggles overlay. Needs document focus, not an input — see Pitfall 3.                                                   |
| Task-create dialog      | Click "+ New task" in the sidebar    | Or use [shell.tsx](../components/features/desktop/shell.tsx)'s shortcut if there is one.                               |

## Conventions

- **Where to put exercise scripts.** For Ralphie's autonomous loop, `/tmp/ralphie-exercise-<issue>.mjs`. For ad-hoc maintainer use, `/tmp/happyhq-dogfood/<name>.mjs`. Don't commit these — they're scratch.
- **Where to put screenshots.** `/tmp/ralphie-screenshots/<issue>/` or `/tmp/happyhq-dogfood/screenshots/`. Reference the absolute path in the PR body so reviewers can `open` it.
- **Pre-clean screenshot dir before each run** so a stale shot from a prior attempt doesn't masquerade as success: `for (const f of fs.readdirSync(OUT_DIR)) fs.unlinkSync(path.join(OUT_DIR, f))`.
- **Wait between actions, but not blindly.** Prefer `waitForSelector` / `waitForFunction` over `waitForTimeout`. A 500ms `waitForTimeout` after a click is fine for letting CSS transitions settle; a 30s `waitForTimeout` waiting for compile is a sign you should be waiting on a signal instead.
- **Capture a screenshot at every step**, not just the final one. When something fails, the trail of screenshots is what tells you which step broke. Cheap insurance.

## Updating this doc

This doc is the codebase's memory of how to drive itself. When you hit a new gotcha or learn a new route mapping, add a bullet here. If a section grows past a screen, that's a signal to split — but until then, one file beats five.
