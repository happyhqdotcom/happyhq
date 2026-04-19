# Bugs & Enhancements

Known bugs and enhancements for Ralphie to fix. Each entry is self-contained — symptom, suspected cause, and pointers to the relevant code and specs.

Pick one, fix it, mark it **[Implemented]**, then verify and mark **[Validated]**.

---

## Bugs

- [ ] **Expose `maxTurns` as a configurable option per user/stream/task**

  The SDK supports `maxTurns` to cap how many tool-use rounds an iteration can take. Currently not exposed. Would give another knob alongside `maxBudgetUsd` for controlling iteration scope. Consider making it configurable at the stream or task level so different workloads can tune their own limits.

---

## Enhancements

- [ ] **Show the loop count during working mode**

  While a task is in progress, display the current loop/iteration count so the user has a sense of how many agentic turns have been taken. Helps gauge progress and cost.

- [ ] **Add dark mode support**

  Implement a dark color scheme and a toggle to switch between light/dark (or follow system preference). Audit existing components, colors, and backgrounds to ensure they look good in both modes.

- [ ] **Google OAuth consent screen shows "your-app.fly.dev" instead of "HappyHQ"**

  The Google "Choose an account" screen displays "continue to your-app.fly.dev" instead of the app name. This is a Google Cloud Console config issue, not code. Fix: Go to Google Cloud Console → OAuth consent screen, set the app name to "HappyHQ", add the production domain as an authorized domain, and ensure publishing status is "In production" (testing mode can show the redirect URI origin instead of the app name).

- [ ] **Consider targeted git staging instead of `git add -A` in `commitGitState`**

  `commitGitState()` in `lib/git/sync.server.ts` uses `git add -A`, which stages everything in `~/HappyHQ/`. This means any user action that commits (move sample, delete sample, ingest, etc.) can sweep up unrelated changes — including half-written output from an active agent run. It's unclear whether this is a bug or a feature: sweeping catches user-initiated filesystem changes (the original intent of `syncGitState`), but it also means a sample type change during an active task could commit partial task output in the same commit. Options: (1) add a `commitPaths(paths[], message)` helper that stages only the relevant paths (`git add -- path1 path2`) and migrate actions to use it, (2) keep `git add -A` but accept the sweep-up as intentional, (3) hybrid — use targeted staging for actions that commonly run during active tasks (sample moves, renames) and keep `git add -A` for actions that don't (stream create/delete). Related: if we ever add sample directory renaming (renaming the slug, not just the `.meta.json` title), targeted staging becomes important to avoid committing concurrent run artifacts.

- [ ] **Import an LLM chat share link as input to a new stream**

  Let users paste a share link from an LLM conversation (e.g. a ChatGPT or Claude shared chat URL) as the starting point for a new stream. The idea: someone has a full-blown AI-assisted session where they build or figure something out, and then they can turn that conversation into a learning stream — extracting the key concepts, decisions, and steps so they (or others) can actually learn how it was done rather than just having the end result. Q would fetch/parse the shared conversation and use it as rich context to generate a structured learning path.
