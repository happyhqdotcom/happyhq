0a. Read @qa-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. Read [@.dev/exercising-the-ui.md](.dev/exercising-the-ui.md) — owns the Playwright knowledge you'll use for bespoke driving (helpers, pitfalls, routing cheat-sheet).
0d. **Read the triage plan.** Find the latest plan: `ls -t ~/.cache/qa/triage-*.md | head -1`. If empty, exit with `No triage plan found — run with --triage-only or full pipeline first`. Read the plan in full; you'll execute its test units in order.

1. **Pre-flight.** Confirm you're in the qa worktree: `git rev-parse --show-toplevel` should end in `happyhq-qa`. Confirm `${BASE_BRANCH}` is set (the wrapper exports it). Confirm the working tree is clean — if not, error out (the wrapper should have hard-reset already).

2. **For each test unit in plan order**, run the matching strategy below. Between units, **always** return to `${BASE_BRANCH}` with a clean tree (`git checkout ${BASE_BRANCH} && git reset --hard origin/main`) and **always** stop any orphan dev server (`npx tsx scripts/dev-server.ts stop` from `happyhq/`). Skip units gracefully on error: log the failure, label `ralphie:qa-fail` with the error detail, move on to the next unit.

## Strategy: `evidence-sufficient`

For a single non-critical-path PR with adequate Exercise evidence in its body.

1. Re-read the PR body and embedded evidence: `gh pr view ${PR_NUMBER} --comments`.
2. Apply the rubric's "What makes Exercise evidence sufficient" check. If the embedded evidence really does cover the changed surface, proceed; if it's thin, **promote this unit to `smoke-bespoke`** for the actual surface and re-run from that strategy.
3. Apply label: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-pass"`.
4. Post the qa-pass comment per the rubric's "Comment shape (qa-pass)" — strategy `evidence-sufficient`. Cite the specific evidence relied on.

## Strategy: `smoke-isolated`

For a single critical-path PR.

1. `git checkout ${BASE_BRANCH}` (in case a prior unit left state). Hard reset to origin/main.
2. `gh pr checkout ${PR_NUMBER}` from the qa worktree's `happyhq-qa` directory.
3. If `pnpm-lock.yaml` changed in the diff: `pnpm install`. Else skip (saves time).
4. From `happyhq/`: `pnpm smoke:e2e`. Capture the full output (stdout + stderr) — you'll quote the last 30 lines on failure.
5. **On pass:**
   - Apply label: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-pass"`.
   - Post the qa-pass comment — strategy `smoke`. Quote the timing (`PASS in Xs`), note the fixture used, note that no `run.error` events appeared in the smoke logs.
6. **On fail:**
   - Apply label: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-fail"`.
   - Post the qa-fail comment per the rubric's "Comment shape (qa-fail)" — strategy `smoke`. Quote the failing step, the last 30 log lines, and the preserved smoke root path. If the smoke produced a `failure.png` screenshot, upload via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <screenshot-dir>` and embed the URL.
7. Return to `${BASE_BRANCH}`. Stop any dev server.

## Strategy: `smoke-bespoke`

For a critical-path PR where the smoke alone wouldn't cover a specific surface (e.g., chat composer drag-and-drop, learning-mode flow). The triage plan names the surface and the scenario.

1. Same as `smoke-isolated` steps 1–4 — get the smoke baseline.
2. **On smoke fail:** label `ralphie:qa-fail` and stop. The bespoke scenario only runs after smoke baseline passes.
3. **On smoke pass:** drive the bespoke scenario the triage plan specified.
   - Use the Playwright MCP tools (registered in `.mcp.json`) to drive the affected screen. Follow the conventions in `.dev/exercising-the-ui.md` (waits, hidden file inputs, dynamic button labels, etc.).
   - For server-only bespoke scenarios, drive via the API per CLAUDE.md's "Using HappyHQ's API for verification" section.
   - Capture screenshots for each step. Save to a directory like `/tmp/qa-bespoke-${PR_NUMBER}/`.
4. **On bespoke scenario pass:**
   - Upload screenshots: `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} /tmp/qa-bespoke-${PR_NUMBER}/`. Capture the returned URLs.
   - Apply label: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-pass"`.
   - Post the qa-pass comment — strategy `bespoke`. Describe what was driven, what was asserted, and embed the screenshot URLs as inline `![](url)` markdown.
5. **On bespoke scenario fail:**
   - Apply label: `ralphie:qa-fail`.
   - Post the qa-fail comment — strategy `bespoke`. Describe what broke, embed the screenshot of the broken state, link the smoke root.
6. Return to `${BASE_BRANCH}`. Stop any dev server.

## Strategy: `smoke-batched`

For N PRs that the triage judged integration-safe to test together.

1. `git checkout ${BASE_BRANCH}` and hard reset to origin/main.
2. Create a fresh integration branch: `git checkout -b qa/integration-$(date +%Y%m%dT%H%M%S)`.
3. For each PR in the unit (in plan order):
   - Fetch its head: `gh pr view <#> --json headRefName,headRefOid --jq '.headRefOid'`. Cherry-pick the merge: `git fetch origin pull/<#>/head:qa-pr-<#> && git merge --no-ff qa-pr-<#> -m "qa: integrate #<#>"`.
   - On merge conflict: abort the integration (`git merge --abort && git reset --hard ${BASE_BRANCH}`). Label all PRs in the unit `ralphie:qa-fail` with a "merge conflict on QA integration with #X" comment. Move on to next unit.
4. If any PR in the unit changed `pnpm-lock.yaml`: `pnpm install`.
5. Run smoke: `pnpm smoke:e2e`.
6. **On pass:**
   - For each PR in the unit: apply `ralphie:qa-pass` label, post the qa-pass comment — strategy `batched`. Note which other PRs were in the integration (`PRs #X, #Y, #Z were tested together`) and the smoke output.
7. **On fail:** enter the bisect flow (next section).
8. Return to `${BASE_BRANCH}`. Stop any dev server. Delete the integration branch (`git branch -D qa/integration-...`).

### Bisect flow (only when `smoke-batched` fails)

The integration branch contains all N PRs and smoke just failed against it.

1. Initialize:
   - `BISECT_BUDGET=6` — the rubric's cost cap on additional smoke runs.
   - `BISECT_RUNS=0`.
   - `INNOCENT=[]` (PRs proven not at fault).
   - `SUSPECTS=[all N PRs]`.

2. **For cohorts of size ≥ 4: halving bisect.** Otherwise: drop-one bisect.

   **Halving:**
   - Split SUSPECTS into HALF_A and HALF_B.
   - Build an integration branch with INNOCENT + HALF_A. Run smoke. `BISECT_RUNS += 1`.
   - If pass: HALF_A is innocent. Move HALF_A into INNOCENT. SUSPECTS = HALF_B.
   - If fail: HALF_B is innocent (or independent). Move HALF_B into INNOCENT. SUSPECTS = HALF_A.
   - When SUSPECTS = single PR: that's the culprit. Stop bisect.

   **Drop-one:**
   - For each PR in SUSPECTS (largest-diff or critical-path-touching first):
     - Build integration branch with `(SUSPECTS - {pr}) + INNOCENT`. Run smoke. `BISECT_RUNS += 1`.
     - If pass: `pr` is the culprit. Stop bisect.
     - If fail: `pr` is innocent. Move it to INNOCENT. Continue.

3. **Cost cap:** if `BISECT_RUNS >= BISECT_BUDGET` and SUSPECTS is still > 1, abandon bisect.
   - Label every PR in the original unit `ralphie:qa-fail`.
   - Post the qa-fail comment — strategy `bisect-non-converge`. Describe what was tried (each integration tried, each result), name the SUSPECTS that remained.

4. **On convergence:**
   - Label the culprit `ralphie:qa-fail`. Post the qa-fail comment — strategy `bisect-converged-here`. Quote the failing smoke output. Note the bisect path (`tested with [A, B, C] → fail; with [B, C] → pass; culprit is A`). Note which PRs are now `qa-pass`.
   - For every PR in INNOCENT: label `ralphie:qa-pass`. Post the qa-pass comment — strategy `batched`. Note the bisect path that proved innocence.

5. Return to `${BASE_BRANCH}`. Stop any dev server. Delete all integration branches and `qa-pr-*` branches.

## After all units processed

1. Print a summary to stdout:
   ```
   QA execute complete.
     Units processed: N
     PRs labeled qa-pass: X
     PRs labeled qa-fail: Y
     PRs deferred (errors): Z
   ```
2. Return to `${BASE_BRANCH}`. Confirm clean tree. Exit.

## Common operations

**Stopping the dev server.** Always run `npx tsx scripts/dev-server.ts stop` from `happyhq/` after every smoke invocation, even between units. The dev server's pid file is per-CWD-hashed, so the qa worktree's pid file is distinct from the maintainer's primary, but leaving an orphan running ties up port and memory.

**Killing background processes on unexpected exit.** If a session aborts mid-bisect, also `pkill -f "next dev"` and `pkill -f "node.*vitest"` as belt-and-braces.

**Preserving evidence on failure.** The smoke script preserves its smoke root on failure (under `/tmp/happyhq-smoke-*`). When labeling `ralphie:qa-fail`, cite that path in the comment — the maintainer can inspect the artifacts there. Do **not** delete the smoke root after a failure.

**Comment formatting.** Use the rubric's "Comment shape" formats verbatim. Substitute the strategy name into the first line. The maintainer reads these comments in their queue review — make them scan-friendly.

**${DRY_RUN_NOTE}**

**${OVERRIDE_NOTE}**

3. Exit.

**[1]** ONE QA execute pass per session. Process all units in the triage plan, then exit. The orchestrator handles re-runs.
**[2]** Hard constraints from @qa-rubric.md are non-negotiable: never auto-merge, never push to a PR's branch, never apply both `qa-pass` and `qa-fail` to the same PR, never QA fork PRs (apply qa-fail with v1-limitation comment), only operate in the qa worktree.
**[3]** Cite evidence in every comment. Quote smoke output, link smoke roots, embed screenshot URLs. Comments are the artifact future-readers consume — they need to stand alone.
**[4]** Bisect cheaply. The 6-run cost cap is a real budget; abandoning is a legitimate outcome.
**[5]** Always end on `${BASE_BRANCH}` with a clean working tree, between units AND at session exit. Even on failed units. Even on bisect non-converge.
**[6]** Stop the dev server between units. Smoke leaves it running on success/fail (the script's own cleanup), but defensively `dev-server.ts stop` so the next unit boots fresh.
**[7]** AI disclosure not required on QA comments — the comment isn't the author claim, it's the verification artifact. The PR body's existing AI disclosure stands.
