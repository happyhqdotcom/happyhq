0a. Read @bugs-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. The issue you are working: #${ISSUE_NUMBER}. Read it: `gh issue view ${ISSUE_NUMBER} --comments`.

1. **Reproduce.** Establish the bug locally — write a failing test, or run the steps in the issue and confirm the failure mode. If repro cannot be established from the issue + linked logs + a focused investigation, apply `ralphie:skip-not-reproducible` (rubric rule 7), post the rubric-shaped comment, exit. Use `~/HappyHQ/.logs/$(date +%Y-%m-%d).jsonl` and `npx tsx scripts/read-logs.ts` for runtime logs (see @CLAUDE.md "Debugging Q").

2. **Understand and form an opinion.** Before branching: trace the symptom to the cause. Read the relevant code paths. Build a mental model of what's actually happening. Then ask honest questions:
   - Is the report's framing right? Is the cause where the user thinks it is, or somewhere else?
   - Is this really a bug, or is it intentional behavior the user has mistaken for a bug?
   - If the fix would be a constraint (cap, limit, truncate, hide), the unbounded behavior has a cause — find it and fix the cause, even when it lives in nearby code. Scope follows the cause: touch nearby code when it's the cause, leave it when it's just adjacent and looks improvable.
   - Is this one bug, or part of a pattern that should be surfaced separately?

   **If the framing is wrong** (the symptom has a different cause than the report assumes; or the described behavior is intentional) → take the **Rescope path** (rubric Path / "Rescope path" section): file a rephrased child issue with what the loop saw, comment on the original with a link and clear undo instructions, apply `ralphie:skip-needs-rescope` to the original, exit. Do NOT branch or write code.

3. **Branch.** Once you've confirmed the framing and the cause: `git checkout ${BASE_BRANCH} && git checkout -b fix/${ISSUE_NUMBER}-<short-slug>`. The slug is 2–4 hyphenated words derived from the issue title.

4. **Fix + regression test.** Implement the smallest change that fixes the cause you identified in step 2. Add a regression test that fails before the fix and passes after, **only if there's a behavior contract worth pinning** (see note [3]). Tests verify behavior, not implementation (see @CLAUDE.md). Use Sonnet subagents for parallel reads/searches; use Opus for debugging or architectural calls.

5. **Verify.** From the `happyhq/` directory, run `pnpm format`, `pnpm lint`, `pnpm check-types`, `pnpm --filter=happyhq test`. If any fail, fix and re-run. If they fail twice, apply `ralphie:skip-verification-failed` (rubric rule 9), post the rubric-shaped comment with the failing output included, exit.

5b. **Exercise.** Try the change end-to-end the way a real user would experience it, before opening the PR. Code-only checks (lint/types/test) prove the plumbing; this step proves the behavior. Apply this to every fix — pick the right tool for the surface, don't skip because "it's not a UI change."

- **Exercise the contract the issue describes, at the surface it describes.** If the issue says "user sees X," drive the surface and watch for X. Unit tests below the surface complement the Exercise; they don't replace it.
- **Read [@.dev/exercising-the-ui.md](.dev/exercising-the-ui.md) first.** It owns the UI-driving knowledge: helpers (`scripts/dev-server.ts`, Playwright MCP), pitfalls (`networkidle` lies in dev mode, hotkeys need focus, dynamic button labels, slow first-compile, route-gated menu items, env-specific slugs), and the routing cheat-sheet. Saves you rediscovering them.
- Pick the right tool for the surface:
  - **UI-visible** — Playwright MCP tools to drive the affected screen. Capture screenshots.
  - **Server-only** — drive the API per [CLAUDE.md](CLAUDE.md) "Using HappyHQ's API for verification". Capture the relevant log excerpt or API response.
  - **Mixed** (server change with a UI surface, e.g. a toast triggered by a server event) — both.
- For a **behavior fix**: induce the failure mode the issue describes and confirm the new state appears.
- For a **behavior-preserving fix**: drive the happy path on each surface you touched and confirm nothing visible regressed.
- Look at the evidence. Does the issue's user-visible contract actually hold? Sweep for adjacent regressions — the symptom you fixed is one part; "did anything else break" is the other.
- **A synthetic trigger that hits the same code path is fine.** You're verifying the contract, not the cause. If the natural failure mode is hard to set up, trigger an equivalent one — a `throw` early in the same path, a bogus env var on the spawned process (`FOO= some-command`), a named file moved aside. Cheaper to set up wins.
- **Restore what you touch.** Three rules:
  - **Named allowlist.** Touch only what you set out to touch.
  - **Atomic restore + watchdog.** `trap 'mv ~/.x.bak ~/.x' EXIT INT TERM` for the foreground, plus a `nohup bash -c 'sleep 600 && [ -f ~/.x.bak ] && mv ~/.x.bak ~/.x' &` watchdog so an abandoned session still restores. For source edits, `git checkout -- <file>` and `git status --short` to confirm clean. Verify the restore before reporting done.
  - **Never touch:** shell/git config, `~/.ssh`, `~/.aws`, `~/.gnupg`, the macOS keychain, anything needing `sudo` / Touch ID. No `rm -rf` in $HOME.
- **If it doesn't work:** rework once. If still broken on the second attempt, apply `ralphie:skip-cannot-verify` (rubric rule 10) with evidence showing what you saw vs. what was expected, stop the dev server, exit.
- **If you can't reach the surface:** name the tactics you tried and what each produced before applying `ralphie:skip-cannot-verify`. "Moved `~/.x` aside, run completed normally — failure didn't trigger" counts. "Couldn't reach the surface" with no attempt described doesn't. The trail goes in the skip-comment.
- **If it works:** keep the evidence path(s) — they go in the PR body in step 8. Always stop the dev server when done: `npx tsx scripts/dev-server.ts stop`.

6. **Risk gate.** With the diff in hand, apply the rubric's "Risk gate" decision tree:
   - Run `git diff --stat origin/main...HEAD -- ':!*.md' ':!*.mdx'`. (Use `origin/main`, not the local `main` ref — when running from a worktree the local `main` may be stale.) Spec/doc updates (`*.md`/`*.mdx`) are excluded from the count — they don't carry the same review burden as code, and bundling them with the fix keeps design and implementation in sync.
   - If under threshold (≤10 files AND ≤300 net lines added) → proceed to step 7.
   - If over threshold AND low-risk per the rubric's criteria → proceed to step 7 with a "Why this is over threshold but low risk" section in the PR body.
   - If over threshold AND high-risk per the rubric's criteria → take the **Split path** (rubric Path B): create child issues, comment on parent, apply `ralphie:split-into-children`, revert the branch (`git checkout ${BASE_BRANCH} && git branch -D fix/${ISSUE_NUMBER}-<slug>`), exit. Do not push.

7. **Commit.** `git add -A && git commit -m "fix: <one-line summary>\n\nCloses #${ISSUE_NUMBER}"`.

8. **Push + PR.** `git push -u origin fix/${ISSUE_NUMBER}-<slug>` then `gh pr create --base main --assignee @me --title "fix: <summary>" --body "..."`. The `--assignee @me` puts the PR in the maintainer's "Assigned to me" queue — that's how Ralphie's PRs get reviewed (CODEOWNERS auto-request is blocked because `gh` is authenticated as the maintainer, so every PR is self-authored). PR body MUST include:
   - `Closes #${ISSUE_NUMBER}`
   - One-paragraph root-cause summary (the **why**)
   - **Deviations from the report's framing** (if any) — what you concluded was actually broken vs. what was reported
   - **"Why this is over threshold but low risk"** section (if rule 6 sub-case applied)
   - Link to the regression test (`<file>:<line>`) if one was written
   - **Visual evidence** — one sentence on what was exercised in step 5b, plus the screenshot(s) or log excerpt(s). For UI changes, upload screenshots via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <screenshot-dir>` and embed the returned URLs as inline `![alt](url)` markdown. For server-only changes, paste the relevant log lines or API response in a fenced block.
   - AI-assistance disclosure per @CONTRIBUTING.md (e.g., "Authored by Ralphie, the autonomous bug-fix loop. Reviewed by maintainer before merge.")

9. **Label.** Two labels — one on the PR, one on the issue:
   - `gh pr edit ${PR_NUMBER} --add-label "ralphie:ready-to-merge"` — puts the PR in the QA triage queue ([qa-rubric.md](qa-rubric.md), [PROMPT_qa_triage.md](PROMPT_qa_triage.md)). Without this the PR opens but QA never sees it.
   - `gh issue edit ${ISSUE_NUMBER} --add-label "ralphie:fixed-in-pr"` — prevents the bugs loop from re-picking the issue ([bugs.sh](bugs.sh) wrapper guard).

   The PR's `Closes #` is the rest of the breadcrumb.

10. **Return to base branch.** `git checkout ${BASE_BRANCH}`. Each session leaves the working tree on `${BASE_BRANCH}` so the next session (or the maintainer) starts from a clean baseline. Apply this on the skip paths too — if you abort and revert in step 6 of the guardrails, end on `${BASE_BRANCH}`.

11. ${DRY_RUN_NOTE}

12. ${OVERRIDE_NOTE}

13. Exit.

**[1]** ONE issue per session. Do not pick up other issues, do not chain. The orchestrator handles the next one.
**[2]** Hard constraints from @bugs-rubric.md are non-negotiable: never push to `main`, never modify `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what the focused fix demands), or licensing files. If the fix would require any of these, apply `ralphie:skip-out-of-scope` and exit.
**[3]** A regression test is required _when there is a behavior contract worth pinning_. Apply the litmus test from @testing.md before writing one: "what bug would this catch?" If the only answer is "someone reverted this exact line" (e.g. asserting an asset path equals `/brand/q.svg`, asserting a specific class name, asserting copy text), the test is a vanity test — don't write it. Asset swaps, copy tweaks, and CSS-only fixes are visually verified, not test-locked. If you cannot articulate a user-visible contract the test defends, the fix is either too trivial to need a test, or you haven't found the right contract yet — re-think before writing one.
**[4]** Tests verify behavior — what the system guarantees to the user. 50 different implementations should pass the same test. Test conditional rendering driven by state, input/output contracts, error paths, security boundaries. Never `toBeTruthy()`, snapshots, "renders without crashing", asserts on specific src/href/class/copy values, or "mock was called" (unless the call IS the contract).
**[5]** Capture the **why** in the PR body and (if non-obvious) a code comment. Never narrate **what** in comments — well-named code does that.
**[6]** If you discover the fix requires a schema migration / new env var / new dep / CI change mid-implementation, stop, revert your changes (`git checkout ${BASE_BRANCH} && git branch -D fix/${ISSUE_NUMBER}-...`), apply `ralphie:skip-out-of-scope`, exit.
**[7]** AI disclosure in the PR body is required by @CONTRIBUTING.md. Never omit it.
**[8]** When applying any `ralphie:skip-*` label, the comment uses the rubric's "Comment shape" format. Always.
**[9]** Engage seriously, don't follow the report blindly. A bug report is the user's best guess at what's wrong and where; your job is to read the code and decide whether the framing is right. The "Understand and form an opinion" step (2) is where the real engineering happens — if you skip it and jump straight to fixing, you'll end up fixing symptoms instead of causes. When the framing is wrong, file a rephrased child issue via the Rescope path rather than shipping a wrong-shape fix.
**[10]** If you're adding a new element to an existing UI surface, check it's distinguishable from neighbors of similar shape.
