0a. Read @qa-rubric.md — this is the spec. Apply it literally. Note especially the litmus test (_Are you satisfied with what's been tested?_) and the pitfalls section.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. Read [@.dev/exercising-the-ui.md](.dev/exercising-the-ui.md) — Playwright knowledge for any verification that involves driving the UI.
0d. **You are running QA on PR #${PR_NUMBER}.** Operate only on this PR — the wrapper fires a fresh session per PR.

1. **Pre-flight.** Confirm `git rev-parse --show-toplevel` ends in `happyhq-qa`. Confirm `${BASE_BRANCH}` is set (the wrapper exports it). The wrapper has already snapped to a clean tree at `${BASE_BRANCH}` — don't reset again.

2. **Read the triage plan from the PR.** It's a comment body starting with `QA: triage`:

   ```
   gh pr view ${PR_NUMBER} --json comments \
     --jq '.comments[] | select(.body | startswith("QA: triage")) | .body' | head -1
   ```

   - If empty → print `PR #${PR_NUMBER} → no triage plan, skipping` and exit cleanly. The wrapper will pick this up next run after triage covers it.
   - If body is `QA: triage — skipped: ...` → print `PR #${PR_NUMBER} → triage skipped (<reason>)` and exit cleanly.
   - Otherwise: parse the plan's `What changed`, `What could break`, `What's been tested`, `How to verify`, `Backstop` fields.

3. **Fork check.** `gh pr view ${PR_NUMBER} --json isCrossRepository --jq '.isCrossRepository'`. If `true`, apply `ralphie:qa-fail` with the v1-fork-limitation comment per the rubric, print the summary line, and exit.

4. **Check out the PR's branch.** `gh pr checkout ${PR_NUMBER}` from the qa worktree. If `pnpm-lock.yaml` changed in the diff (`gh pr diff ${PR_NUMBER} --name-only | grep pnpm-lock.yaml`): `pnpm install` from the repo root. Else skip.

5. **Run the verification from the plan's "How to verify" section.** Two cases:
   - **Litmus test passes — author's testing covers it.** Independently reproduce the load-bearing piece of the author's exercise — run their curl, hand-roll their fixture, drive the same UI path. Confirm it actually covers what the plan claimed and that the kind of verification matches the kind of risk (per the rubric's pitfalls). If it doesn't (the plan was wrong), write a quick verification yourself — note the deviation in the qa-pass / qa-fail comment.
   - **Explicit verification steps.** Carry out what the plan describes. The means is whatever the plan named:
     - **Driving UI** → use Playwright MCP tools per `.dev/exercising-the-ui.md`. For any artifacts you create (streams, tasks, uploads), use stream slug `qa-bespoke-${PR_NUMBER}`.
     - **API probe** → curl per CLAUDE.md "Using HappyHQ's API for verification".
     - **Changelog read** → `gh release view <tag> --repo <upstream>` or fetch the upstream's release notes; probe the specific semantics that shifted.
     - **Log inspection** → `npx tsx scripts/read-logs.ts --event=...` per CLAUDE.md "Debugging Q".
     - **Targeted unit test** → `pnpm test <path>` from `happyhq/`.

   Capture evidence as you go: screenshots into `/tmp/qa-bespoke-${PR_NUMBER}/`, log excerpts in working memory, command output in working memory. You'll cite all of it in the comment.

6. **Run smoke as backstop** — unless the plan's `Backstop:` is `skip`. From `happyhq/`: `pnpm smoke:e2e`. Capture full output (stdout + stderr) — you'll quote the last 30 lines on failure.

7. **Apply the litmus test one final time.** _Are you satisfied with what's been tested?_ If yes → pass. If no (verification failed, smoke failed, or the verification's kind didn't match the risk's kind after all) → fail.

8. **Workspace cleanup** if you used the `qa-bespoke-${PR_NUMBER}` stream slug:
   - `rm -rf ~/HappyHQ/qa-bespoke-${PR_NUMBER}`. Best-effort — note any failure under an "Artifacts" line in the comment, but don't let cleanup failure change the verdict.

9. **Apply the terminal label and post the comment** per the rubric's "Comment shape":
   - On pass: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-pass"` + `gh pr comment ${PR_NUMBER} --body "..."` using the qa-pass shape. Cite the verification evidence and the smoke result (or `skipped — non-code`).
   - On fail: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-fail"` + qa-fail comment. Quote the failing step (last 30 log lines on smoke fail). Link the preserved smoke root (`/tmp/happyhq-smoke-*`). Embed any failure screenshot via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <dir>`.

   The triage comment stays untouched. If you deviated from the plan, name the deviation in your own qa-pass / qa-fail comment.

10. **Print the summary line and exit:**

    ```
    PR #${PR_NUMBER} → <qa-pass | qa-fail | skipped>
    ```

    The wrapper handles inter-PR cleanup (return to `${BASE_BRANCH}`, stop dev server) before firing the next PR.

**${OVERRIDE_NOTE}**

**[1]** ONE PR per session. Read its triage plan, run the verification, smoke as backstop, apply the litmus test, label, comment, summarize, exit.
**[2]** Hard constraints from @qa-rubric.md are non-negotiable: never auto-merge, never push to a PR's branch, never apply both `qa-pass` and `qa-fail` to the same PR, never QA fork PRs (apply `qa-fail` with v1-limitation comment), only operate in the qa worktree.
**[3]** Cite evidence in every comment — quote smoke output, link the smoke root on failure, embed screenshot URLs (upload via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <dir>`). Comments are the artifact future-readers consume; they need to stand alone.
**[4]** Don't return to `${BASE_BRANCH}` or stop the dev server before exiting — the wrapper does both before the next PR.
**[5]** Bespoke workspace cleanup (`rm -rf ~/HappyHQ/qa-bespoke-${PR_NUMBER}`) IS your job — the wrapper doesn't know what stream slug you used. Run it after any UI-driving verification, even on failure. Best-effort: cleanup failure doesn't change the verdict.
**[6]** Preserve the smoke root on failure — never delete `/tmp/happyhq-smoke-*` directories yourself.
**[7]** Don't edit the `QA: triage` comment — it's triage's record. Note any deviation in your own `QA: pass` / `QA: fail` comment.
**[8]** AI disclosure not required on QA comments. The PR body's existing AI disclosure stands.
