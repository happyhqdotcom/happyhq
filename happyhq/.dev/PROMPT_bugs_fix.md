0a. Read @bugs-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. The issue you are working: #${ISSUE_NUMBER}. Read it: `gh issue view ${ISSUE_NUMBER} --comments`.
0d. ${DRY_RUN_NOTE}
0e. ${OVERRIDE_NOTE}

1. **Reproduce.** Establish the bug locally — write a failing test, or run the steps in the issue and confirm the failure mode. If repro cannot be established from the issue + linked logs + a focused investigation, apply `ralphie:skip-not-reproducible`, post the rubric-shaped comment, exit. Use `~/HappyHQ/.logs/$(date +%Y-%m-%d).jsonl` and `npx tsx scripts/read-logs.ts` for runtime logs (see @CLAUDE.md "Debugging Q").

2. **Understand and form an opinion.** Before branching: trace the symptom to the cause and judge whether the report's framing is right. If the framing is wrong → take the rubric's Rescope outcome: file a rephrased child issue, comment on the original with a link and clear undo instructions, apply `ralphie:skip-needs-rescope`, exit. Do NOT branch or write code.

3. **Branch.** Once you've confirmed the framing and the cause: `git checkout ${BASE_BRANCH} && git checkout -b fix/${ISSUE_NUMBER}-<short-slug>`. The slug is 2–4 hyphenated words derived from the issue title.

4. **Fix + regression test.** Implement the fix. Add a regression test that fails before the fix and passes after, only if there's a behavior contract worth pinning per the rubric's "Tests defend behavior, not lines" principle (and see @testing.md). Use Sonnet subagents for parallel reads/searches; use Opus for debugging or architectural calls.

5. **Verify.** From the `happyhq/` directory, run `pnpm format`, `pnpm lint`, `pnpm check-types`, `pnpm --filter=happyhq test`. If any fail, fix and re-run. If they fail twice, apply `ralphie:skip-verification-failed`, post the rubric-shaped comment with the failing output included, exit.

5b. **Validate.** Drive the surface before opening the PR.

- **Read [@.dev/exercising-the-ui.md](.dev/exercising-the-ui.md) first.** It owns the UI-driving knowledge: helpers (`scripts/dev-server.ts`, Playwright MCP), pitfalls (`networkidle` lies in dev mode, hotkeys need focus, dynamic button labels, slow first-compile, route-gated menu items, env-specific slugs), and the routing cheat-sheet. Saves you rediscovering them.
- Pick the right tool for the surface:
  - **UI-visible** — Playwright MCP tools to drive the affected screen. Capture screenshots.
  - **Server-only** — drive the API per [CLAUDE.md](CLAUDE.md) "Using HappyHQ's API for verification". Capture the relevant log excerpt or API response.
  - **Mixed** (server change with a UI surface, e.g. a toast triggered by a server event) — both.
- **A synthetic trigger that hits the same code path is fine.** You're verifying the contract, not the cause. If the natural failure mode is hard to set up, trigger an equivalent one — a `throw` early in the same path, a bogus env var on the spawned process (`FOO= some-command`), a named file moved aside. Cheaper to set up wins.
- **Restore what you touch.** Three rules:
  - **Named allowlist.** Touch only what you set out to touch.
  - **Atomic restore + watchdog.** `trap 'mv ~/.x.bak ~/.x' EXIT INT TERM` for the foreground, plus a `nohup bash -c 'sleep 600 && [ -f ~/.x.bak ] && mv ~/.x.bak ~/.x' &` watchdog so an abandoned session still restores. For source edits, `git checkout -- <file>` and `git status --short` to confirm clean. Verify the restore before reporting done.
  - **Never touch:** shell/git config, `~/.ssh`, `~/.aws`, `~/.gnupg`, the macOS keychain, anything needing `sudo` / Touch ID. No `rm -rf` in $HOME.
- **If it doesn't work:** rework once. If still broken on the second attempt, apply `ralphie:skip-cannot-verify` with evidence showing what you saw vs. what was expected, stop the dev server, exit.
- **If you can't reach the surface:** name the tactics you tried and what each produced before applying `ralphie:skip-cannot-verify`. "Moved `~/.x` aside, run completed normally — failure didn't trigger" counts. "Couldn't reach the surface" with no attempt described doesn't. The trail goes in the skip-comment.
- **If it works:** keep the evidence path(s) — they go in the PR body in step 8. Always stop the dev server when done: `npx tsx scripts/dev-server.ts stop`.

6. **Risk gate.** Apply the rubric's risk gate against the diff:
   - Run `git diff --stat origin/main...HEAD -- ':!*.md' ':!*.mdx'`. (Use `origin/main`, not the local `main` ref — when running from a worktree the local `main` may be stale.)
   - Ship → proceed to step 7. If the over-threshold-low-risk case applies, add a "Why this is over threshold but low risk" section to the PR body.
   - Split → take the rubric's Split outcome: create child issues, comment on parent, apply `ralphie:split-into-children`, revert the branch (`git checkout ${BASE_BRANCH} && git branch -D fix/${ISSUE_NUMBER}-<slug>`), exit. Do not push.

7. **Commit.** `git add -A && git commit -m "fix: <one-line summary>\n\nCloses #${ISSUE_NUMBER}"`.

8. **Push + PR.** `git push -u origin fix/${ISSUE_NUMBER}-<slug>` then `gh pr create --base main --assignee @me --title "fix: <summary>" --body "..."`. The `--assignee @me` puts the PR in the maintainer's "Assigned to me" queue — that's how Ralphie's PRs get reviewed (CODEOWNERS auto-request is blocked because `gh` is authenticated as the maintainer, so every PR is self-authored). PR body MUST include:
   - `Closes #${ISSUE_NUMBER}`
   - One-paragraph root-cause summary (the **why**)
   - **Deviations from the report's framing** (if any) — what you concluded was actually broken vs. what was reported
   - **"Why this is over threshold but low risk"** section (if that case applied at step 6)
   - Link to the regression test (`<file>:<line>`) if one was written
   - **Visual evidence** — one sentence on what was exercised in step 5b, plus the screenshot(s) or log excerpt(s). For UI changes, upload screenshots via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <screenshot-dir>` and embed the returned URLs as inline `![alt](url)` markdown. For server-only changes, paste the relevant log lines or API response in a fenced block.
   - AI-assistance disclosure per @CONTRIBUTING.md (e.g., "Authored by Ralphie, the autonomous bug-fix loop. Reviewed by maintainer before merge.")

9. **Label.** Two labels — one on the PR, one on the issue:
   - `gh pr edit ${PR_NUMBER} --add-label "ralphie:ready-to-merge"` — puts the PR in the QA triage queue ([qa-rubric.md](qa-rubric.md), [PROMPT_qa_triage.md](PROMPT_qa_triage.md)). Without this the PR opens but QA never sees it.
   - `gh issue edit ${ISSUE_NUMBER} --add-label "ralphie:fixed-in-pr"` — prevents the bugs loop from re-picking the issue ([bugs.sh](bugs.sh) wrapper guard).

   The PR's `Closes #` is the rest of the breadcrumb.

10. **Return to base branch.** `git checkout ${BASE_BRANCH}`. Each session leaves the working tree on `${BASE_BRANCH}` so the next session (or the maintainer) starts from a clean baseline. Apply this on the skip paths too — if you abort and revert in step 6, end on `${BASE_BRANCH}`.

11. Exit.

**[1]** Honor the rubric's Hard Constraints. If the fix would require modifying anything they forbid, take the Skip path with `ralphie:skip-out-of-scope`.
**[2]** If you discover mid-implementation that the fix requires a schema migration / new env var / new dep / CI change, stop, revert (`git checkout ${BASE_BRANCH} && git branch -D fix/${ISSUE_NUMBER}-...`), apply `ralphie:skip-out-of-scope`, exit.
**[3]** When applying any `ralphie:skip-*` label, the comment uses the rubric's "Comment shape" format. Always.
**[4]** If you're adding a new element to an existing UI surface, check it's distinguishable from neighbors of similar shape.
