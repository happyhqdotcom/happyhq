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

Default port 3000. Override with `PORT=3030 npx tsx ...` if 3000 is in use (e.g. by your interactive dev session). PID + log paths are per-CWD under `~/HappyHQ/.cache/dev-server/<hash>.{pid,log}` so concurrent worktrees don't collide.

### `@playwright/mcp` — browser tools

Registered in `.mcp.json` at the repo root. Tools available to any Claude Code session in this checkout: `browser_navigate`, `browser_click`, `browser_type`, `browser_take_screenshot`, etc. Headless chromium by default.

If you're driving Playwright directly (not through MCP), spawn a sandbox install rather than adding to package.json:

```sh
mkdir -p /tmp/happyhq-dogfood && cd /tmp/happyhq-dogfood
npm install playwright && npx playwright install chromium
# write your script, run with `node script.mjs`
```

### `scripts/upload-evidence.ts` — push screenshots to R2 for inline-rendering in PR comments

```sh
npx tsx scripts/upload-evidence.ts <pr-number> <local-dir>
```

Uploads every `.png` / `.jpg` / `.gif` / `.webp` in `<local-dir>` to `ralphie.happyhq.com/pr/<n>/<uuid>/` and prints the public URLs to stdout (one per line) plus ready-to-paste markdown to stderr. Pipe stdout into a file or paste the markdown block into `gh pr comment --body-file`.

Example:

```sh
$ npx tsx scripts/upload-evidence.ts 220 /tmp/happyhq-dogfood/screenshots-216
Uploading 4 file(s) to pr/220/<uuid>/ on ralphie
https://ralphie.happyhq.com/pr/220/<uuid>/01-task-page-pre-start.png
...
Paste into a comment:
![01-task-page-pre-start](https://ralphie.happyhq.com/pr/220/<uuid>/01-task-page-pre-start.png)
...
```

The bucket auto-deletes objects under `pr/` after 90 days (R2 lifecycle rule), so don't rely on these URLs for long-term reference. GitHub's Camo proxy caches each image on first fetch though, so already-rendered comments keep working even after the source expires.

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

### 7. Run-trigger button labels depend on task state

The button that starts a run changes label based on `run.status`:

- **Fresh task** (no prior run, has description + stream): "Start Task" — direct click, no dialog.
- **Stopped task** (previous run failed/finished): "Restart" and "Continue" — Restart fires a "Start Over?" confirmation dialog, Continue resumes from where the previous run left off.

Either label triggers the same `/api/run/start` code path. Match both:

```js
const runBtn = page.locator(
  'button:has-text("Start Task"), button:has-text("Restart")',
)
```

### 8. Confirmation dialogs gate destructive actions

Some clicks open a confirmation modal before firing the underlying action. Restart opens "Start Over?" with Cancel / Start. After the trigger click, look for and click through the confirmation conditionally — fresh-task clicks don't have one:

```js
await runBtn.first().click()
await page.waitForTimeout(500)
const confirmStart = page.getByRole('button', { name: /^start$/i })
if (await confirmStart.count()) {
  await confirmStart.first().click()
}
```

### 9. SSE subscription mounts late — drive via UI, not raw API

[components/features/desktop/hooks/use-run-activity.ts](../components/features/desktop/hooks/use-run-activity.ts) only subscribes to `/api/run/stream` when `run.status` flips to `'planning'` or `'working'`. The gate avoids open SSE connections from idle pages.

If you trigger a run via raw `POST /api/run/start`, the server can fire its broadcast (the run loop's catch path, e.g. an `error` event after a fast SDK failure) before the client's SWR refetch picks up the status change and mounts the subscription. The event lands in a channel with no subscribers — toast missed.

**Drive run-loop dogfoods via the UI button click, not raw API.** The button's click handler does an optimistic SWR update that mounts the subscription before the server's broadcast fires.

(There's also a real bug in the broadcast — events aren't buffered for late subscribers. Tracked in #227. Until that's fixed, this pitfall is the workaround.)

## Routing cheat-sheet

What URL gets you which surface. Add to this as you discover more.

| Surface                 | Route                                         | Notes                                                                                                                                                               |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home / task list        | `/` → redirects to `/tasks`                   | The redirect is fine; let it happen.                                                                                                                                |
| Task page (desktop)     | `/task/[task]`                                | Sets `openPanel.type === 'task'`; gates command-menu's "Add from the web" and friends.                                                                              |
| Task page (with stream) | `/[stream]/[task]`                            | Same `openPanel` semantics as above.                                                                                                                                |
| Task inline on home     | `/tasks/inbox/[task]`                         | Renders home with task expanded inline. **Does not** set `openPanel` — task-aware command-menu items are missing here.                                              |
| Stream                  | `/[stream]`                                   |                                                                                                                                                                     |
| Chat                    | `/chat/[id]`                                  |                                                                                                                                                                     |
| Command menu            | `/` keystroke from any page (hotkey)          | Toggles overlay. Needs document focus, not an input — see Pitfall 3.                                                                                                |
| Task-create dialog      | Click "+ New task" in the sidebar             | Or use [shell.tsx](../components/features/desktop/shell.tsx)'s shortcut if there is one.                                                                            |
| Run a task              | Click "Start Task" / "Restart" on a task page | Restart gates on a "Start Over?" confirmation dialog. Both end up at `POST /api/run/start`. UI path mounts the SSE subscription via optimistic SWR — see Pitfall 9. |

## Conventions

- **Where to put exercise scripts.** For Ralphie's autonomous loop, `/tmp/ralphie-exercise-<issue>.mjs`. For ad-hoc maintainer use, `/tmp/happyhq-dogfood/<name>.mjs`. Don't commit these — they're scratch.
- **Where to put screenshots.** Local working dir: `/tmp/ralphie-screenshots/<issue>/` or `/tmp/happyhq-dogfood/screenshots/`. **Then upload to R2** with `npx tsx scripts/upload-evidence.ts <pr> <dir>` and embed the returned URLs as inline images in the PR-body Visual evidence section. Don't reference local `/tmp` paths in the PR — reviewers can't `open` them, and a screenshot embedded inline is the whole point.
- **Pre-clean screenshot dir before each run** so a stale shot from a prior attempt doesn't masquerade as success: `for (const f of fs.readdirSync(OUT_DIR)) fs.unlinkSync(path.join(OUT_DIR, f))`.
- **Wait between actions, but not blindly.** Prefer `waitForSelector` / `waitForFunction` over `waitForTimeout`. A 500ms `waitForTimeout` after a click is fine for letting CSS transitions settle; a 30s `waitForTimeout` waiting for compile is a sign you should be waiting on a signal instead.
- **Capture a screenshot at every step**, not just the final one. When something fails, the trail of screenshots is what tells you which step broke. Cheap insurance.
- **Synthetic tasks for failure-mode dogfooding.** When you need a stream-bound task to exercise a run-loop failure path (and don't want to disturb the user's real tasks), write directly to `~/HappyHQ/tasks/<slug>/task.md` with frontmatter that includes a `stream:` field. The API picks it up immediately. Delete the directory after the dogfood.

## Maintainer setup (one-time, per machine)

Most of the helpers above work out of the box. The exception is `upload-evidence.ts` — it talks to a Cloudflare R2 bucket, so each machine that runs it (your laptop, any Fly machine running an autonomous loop) needs the bucket creds.

**One-time on the Cloudflare side** (already done as of this writing — listed for re-creation if the bucket is ever rebuilt or someone else needs to set it up on a fresh account):

```sh
# Wrangler is the Cloudflare CLI — global install if you don't have it.
npm install -g wrangler
wrangler login

# Create the bucket.
wrangler r2 bucket create ralphie

# Attach the custom domain. Look up your zone-id with:
#   curl -sS "https://api.cloudflare.com/client/v4/zones?name=happyhq.com" \
#     -H "Authorization: Bearer $(grep '^oauth_token' ~/Library/Preferences/.wrangler/config/default.toml | cut -d'"' -f2)"
wrangler r2 bucket domain add ralphie --domain ralphie.happyhq.com --zone-id <zone-id> --min-tls 1.2 --force

# 90-day auto-expire on PR evidence.
wrangler r2 bucket lifecycle add ralphie --name "expire-evidence-90d" --prefix "pr/" --expire-days 90 --force
```

**One-time per machine:**

1. Generate an S3-compatible token at `https://dash.cloudflare.com/<account-id>/r2/api-tokens`. Pick **Account API Token**, **Object Read & Write** permission, scoped to the `ralphie` bucket. Save the **Access Key ID** + **Secret Access Key** — Cloudflare only shows the secret once.
2. Add to `happyhq/.env.local` (gitignored). On a multi-worktree setup, mirror to each worktree's `.env.local`:

   ```
   # Cloudflare R2 — Ralphie evidence bucket
   R2_ACCOUNT_ID=<account-id>
   R2_BUCKET=ralphie
   R2_ACCESS_KEY_ID=<from dashboard>
   R2_SECRET_ACCESS_KEY=<from dashboard>
   R2_PUBLIC_BASE_URL=https://ralphie.happyhq.com
   ```

3. Smoke-test: `npx tsx scripts/upload-evidence.ts 1 /path/to/some/screenshots`. Should print URLs and `curl -sI <url>` should return `200 image/png` from `server: cloudflare`.

## Updating this doc

This doc is the codebase's memory of how to drive itself. When you hit a new gotcha or learn a new route mapping, add a bullet here. If a section grows past a screen, that's a signal to split — but until then, one file beats five.
