# Exercise Harness — Close-Out

The Exercise Harness described in [specs/playground.md §521](specs/playground.md#exercise-harness) is shipped end-to-end. All eight planned steps merged on `ralph/exercise-harness`. Spec acceptance criteria (§683) verified against code; deviations folded back into the spec.

For the per-step history (file-by-file work, decisions, selector lessons), read `git log` on this branch — every step landed as its own commit with a detailed body.

---

## What shipped

| Step | Commit    | Title                                                              |
| ---- | --------- | ------------------------------------------------------------------ |
| 1    | `631c807` | `feat(fs): add exerciseDir/runWirePath helpers`                    |
| 2    | `215cef3` | `refactor(run): extract activity reducer for replay`               |
| 3    | `4d1f74d` | `feat(run): tee wire events to .runs/<runId>/wire.jsonl`           |
| 4    | `ce8eac5` | `feat(harness): scripts/exercise.ts CLI skeleton`                  |
| 5    | `405badc` | `feat(harness): smoke exercise + selector hooks`                   |
| 6    | `347cf38` | `feat(sidebar): wire rename + delete gesture for streams`          |
| 7    | `249c993` | `feat(harness): rename-stream exercise (verifies #24)`             |
| 8    | `cd0d206` | `test(run): pin subagent activity rendering (#26) via wire replay` |

---

## Verification (spec §683) — close-out audit

| #   | Criterion                                      | Status | Evidence                                                                                                         |
| --- | ---------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| 1   | `pnpm install` pulls Playwright                | ✅     | `package.json` `playwright@^1.55.2` in devDeps + `postinstall: playwright install chromium`                      |
| 2   | Smoke exercise exits 0; round-trips            | ✅     | `scripts/exercises/smoke.ts` (verified end-to-end against live dev server in step 5 commit)                      |
| 3   | Pollution audit clean (`~/HappyHQ/` untouched) | ✅     | Verified in step 4 + step 7 commits via `find ~/HappyHQ -newer …/meta.json`                                      |
| 4   | Rename-stream exercise produces evidence dir   | ✅     | `scripts/exercises/rename-stream.ts` exits 0 in ~23s with six DOM snapshots, four screenshots, full artifact set |
| 5   | Wire-replay regression test for #26            | ✅     | `lib/run/wire-replay.test.ts` replays `lib/run/__fixtures__/wire-issue-26.jsonl`                                 |

`pnpm check-types && pnpm lint && pnpm test` — all green (1497 tests / 126 files).

---

## Known follow-ups (not in scope here)

These are _not_ harness work; flagging so the next loop can pick them up if asked.

- **#24 actual fix.** The rename-stream exercise _demonstrates_ the bug and becomes the regression sentinel once a fix lands. The fix itself is `windowStore` state rewriting on rename — mirror `rewriteTaskPaths` at `stores/windowStore.ts:502`. Open scope, separate PR.
- **`pending_confirmation` in `wire.jsonl`.** The 12th `ChatStreamEvent` variant lands in the tee but the reducer has no case (matches the prior hook). Replays may want to surface it. Defer until a replay UI cares.
- **Heartbeat filtering.** Heartbeats fire every 20s during a run and land in `wire.jsonl`. Reducer ignores them; future replay viewers may want a filter switch.

---

## Operational notes

These are the things future-me would have to re-discover. Worth preserving past close-out.

- **`data-role` is the harness-selector convention.** Distinct from `data-testid` (which the codebase uses ad-hoc). `data-role` describes _semantic role_ — `assistant-message`, `auth-error`, `stream-row-menu`, `stream-row-menu-trigger` — and is intended to be reused by exercises long-term. Keep the count small; add only when an exercise needs one.
- **Sandbox isolation is at the env-var boundary only.** `HAPPYHQ_ROOT` is read once in `lib/constants.server.ts` and threaded through every `lib/fs/paths.ts` helper. Never reach into agent factories or `canUseTool` to "fix" sandboxing — the constants layer is the only valid hook.
- **Wire-slice = `listdir(.runs)` diff before/after.** Scoped to one exercise at a time per `HAPPYHQ_ROOT`; concurrent invocations against the same root cross-contaminate. Spec §725 (Constraints) makes this explicit.
- **Selector lessons** (baked into `scripts/exercises/rename-stream.ts` comments):
  - HeadlessUI's outer `<div role="dialog">` has zero bbox; wait on the autofocused input, not the dialog.
  - Controlled inputs invalidate selectors keyed on the original `value` after `fill()`. Press `Enter` on the focused input instead of chasing a fresh submit-button locator.
  - The stream-row dropdown trigger is `opacity-0` until hover/focus-within. `hover()` before `click()`.
- **Dev-server cwd convention.** `scripts/exercise.ts` uses `process.cwd()` as the cwd for the spawned `next dev`, matching `scripts/smoke-test.ts` ("Run from `happyhq/`"). Document this if a CI runner ever invokes the harness from elsewhere.
- **`next dev` cold start ≈17s on M-series.** The 60s readiness budget is conservative; keep it.
