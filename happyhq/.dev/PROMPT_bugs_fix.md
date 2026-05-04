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
   - AI-assistance disclosure per @CONTRIBUTING.md (e.g., "Authored by Ralphie, the autonomous bug-fix loop. Reviewed by maintainer before merge.")

9. **Label.** `gh issue edit ${ISSUE_NUMBER} --add-label "ralphie:fixed-in-pr"`. The PR's `Closes #` is the rest of the breadcrumb.

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
