0a. Read @qa-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. Read [@.dev/exercising-the-ui.md](.dev/exercising-the-ui.md) — Playwright knowledge for any verification that involves driving the UI.
0d. **You are running unit ${UNIT_INDEX} of ${UNIT_TOTAL}.** The triage plan is at `${PLAN_FILE}`. Read it, find the section headed `## Unit ${UNIT_INDEX} — PR #...`, and operate only on that unit. Do not touch any other unit — the wrapper fires a fresh session per unit.

1. **Pre-flight.** Confirm `git rev-parse --show-toplevel` ends in `happyhq-qa`. Confirm `${BASE_BRANCH}` is set (the wrapper exports it). The wrapper has already snapped to a clean tree at `${BASE_BRANCH}` — don't reset again.

2. **Skip directive?** If your unit's heading is `## Unit ${UNIT_INDEX} — PR #X — skipped: ...`, print the per-unit summary line with `→ skipped` and exit. The wrapper will pick up the PR on the next run.

3. **Fork check.** `gh pr view ${PR_NUMBER} --json isCrossRepository --jq '.isCrossRepository'`. If `true`, apply `ralphie:qa-fail` with the v1-fork-limitation comment per the rubric, print the per-unit summary, and exit.

4. **Check out the PR's branch.** `gh pr checkout ${PR_NUMBER}` from the qa worktree. If `pnpm-lock.yaml` changed in the diff (`gh pr diff ${PR_NUMBER} --name-only | grep pnpm-lock.yaml`): `pnpm install` from the repo root. Else skip.

5. **Run the verification from the plan's "How to verify" section.** Two cases:
   - **Trust author's evidence.** Re-read the cited evidence in the PR body (`gh pr view ${PR_NUMBER} --comments`). Confirm it actually covers what the plan claimed. If it doesn't (the plan was wrong), write a quick verification yourself — note the deviation in the comment.
   - **Explicit verification steps.** Carry out what the plan describes. The means is whatever the plan named:
     - **Driving UI** → use Playwright MCP tools per `.dev/exercising-the-ui.md`. For any artifacts you create (streams, tasks, uploads), use stream slug `qa-bespoke-${PR_NUMBER}`.
     - **API probe** → curl per CLAUDE.md "Using HappyHQ's API for verification".
     - **Changelog read** → `gh release view <tag> --repo <upstream>` or fetch the upstream's release notes; probe the specific semantics that shifted.
     - **Log inspection** → `npx tsx scripts/read-logs.ts --event=...` per CLAUDE.md "Debugging Q".
     - **Targeted unit test** → `pnpm test <path>` from `happyhq/`.

   Capture evidence as you go: screenshots into `/tmp/qa-bespoke-${PR_NUMBER}/`, log excerpts in working memory, command output in working memory. You'll cite all of it in the comment.

6. **Run smoke as backstop** — unless the plan's `Backstop:` is `skip`. From `happyhq/`: `pnpm smoke:e2e`. Capture full output (stdout + stderr) — you'll quote the last 30 lines on failure.

7. **Decide the outcome:**
   - **Pass:** verification passed AND (smoke passed OR backstop was skipped).
   - **Fail:** verification failed OR smoke failed.

8. **Workspace cleanup** if you used the `qa-bespoke-${PR_NUMBER}` stream slug:
   - `rm -rf ~/HappyHQ/qa-bespoke-${PR_NUMBER}`. Best-effort — note any failure under an "Artifacts" line in the comment, but don't let cleanup failure change the verdict.

9. **Apply the terminal label and post the comment** per the rubric's "Comment shape":
   - On pass: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-pass"` + `gh pr comment ${PR_NUMBER} --body "..."` using the qa-pass shape. Cite the verification evidence and the smoke result (or "skipped — non-code").
   - On fail: `gh pr edit ${PR_NUMBER} --add-label "ralphie:qa-fail"` + qa-fail comment. Quote the failing step (last 30 log lines on smoke fail). Link the preserved smoke root (`/tmp/happyhq-smoke-*`). Embed any failure screenshot via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <dir>`.

10. **Print the per-unit summary and exit:**

    ```
    Unit ${UNIT_INDEX} of ${UNIT_TOTAL}: PR #${PR_NUMBER} → <qa-pass | qa-fail | skipped>
    ```

    The wrapper handles inter-unit cleanup (return to `${BASE_BRANCH}`, stop dev server) before firing the next unit.

**${OVERRIDE_NOTE}**

**[1]** ONE unit per session. Find unit `${UNIT_INDEX}`, run the verification the plan describes, smoke as backstop, label, comment, summarize, exit.
**[2]** Hard constraints from @qa-rubric.md are non-negotiable: never auto-merge, never push to a PR's branch, never apply both `qa-pass` and `qa-fail` to the same PR, never QA fork PRs (apply `qa-fail` with v1-limitation comment), only operate in the qa worktree.
**[3]** Cite evidence in every comment — quote smoke output, link the smoke root on failure, embed screenshot URLs (upload via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <dir>`). Comments are the artifact future-readers consume; they need to stand alone.
**[4]** Don't return to `${BASE_BRANCH}` or stop the dev server before exiting — the wrapper does both before the next unit.
**[5]** Bespoke workspace cleanup (`rm -rf ~/HappyHQ/qa-bespoke-${PR_NUMBER}`) IS your job — the wrapper doesn't know what stream slug you used. Run it after any UI-driving verification, even on failure. Best-effort: cleanup failure doesn't change the verdict.
**[6]** Preserve the smoke root on failure — never delete `/tmp/happyhq-smoke-*` directories yourself.
**[7]** AI disclosure not required on QA comments. The PR body's existing AI disclosure stands.
