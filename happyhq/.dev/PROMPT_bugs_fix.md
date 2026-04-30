0a. Read @bugs-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. The issue you are working: #${ISSUE_NUMBER}. Read it: `gh issue view ${ISSUE_NUMBER} --comments`.

1. **Reproduce.** Establish the bug locally — write a failing test, or run the steps in the issue and confirm the failure mode. If repro cannot be established from the issue + linked logs + a focused investigation, apply `ralphie:skip-not-reproducible` (rubric rule 7), post the rubric-shaped comment, exit. Use `~/HappyHQ/.logs/$(date +%Y-%m-%d).jsonl` and `npx tsx scripts/read-logs.ts` for runtime logs (see @CLAUDE.md "Debugging Q").

2. **Branch.** From `main`: `git checkout main && git pull && git checkout -b fix/${ISSUE_NUMBER}-<short-slug>`. The slug is 2–4 hyphenated words derived from the issue title.

3. **Fix + regression test.** Implement the smallest change that fixes the bug. Add a regression test that fails before the fix and passes after. Tests verify behavior, not implementation (see @CLAUDE.md). Use Sonnet subagents for parallel reads/searches; use Opus for debugging or architectural calls.

4. **Verify.** From the `happyhq/` directory, run `pnpm format`, `pnpm lint`, `pnpm check-types`, `pnpm --filter=happyhq test`. If any fail, fix and re-run. If they fail twice, apply `ralphie:skip-verification-failed` (rubric rule 8), post the rubric-shaped comment with the failing output included, exit.

5. **Size gate.** After the fix is in, check the diff: `git diff --stat main...HEAD -- ':!*.md' ':!*.mdx'`. If >10 files changed or >300 lines net added, apply `ralphie:skip-too-big` (rubric rule 6/9), post the rubric-shaped comment summarizing what the fix would have entailed, leave the branch in place (do not push), exit. Spec/doc updates (`*.md`/`*.mdx`) are excluded from the count — they don't carry the same review burden as code, and bundling them with the fix keeps design and implementation in sync.

6. **Commit.** `git add -A && git commit -m "fix: <one-line summary>\n\nCloses #${ISSUE_NUMBER}"`.

7. **Push + PR.** `git push -u origin fix/${ISSUE_NUMBER}-<slug>` then `gh pr create --base main --assignee @me --title "fix: <summary>" --body "..."`. The `--assignee @me` puts the PR in the maintainer's "Assigned to me" queue — that's how Ralphie's PRs get reviewed (CODEOWNERS auto-request is blocked because `gh` is authenticated as the maintainer, so every PR is self-authored). PR body MUST include:
   - `Closes #${ISSUE_NUMBER}`
   - One-paragraph root-cause summary (the **why**)
   - Link to the regression test (`<file>:<line>`)
   - AI-assistance disclosure per @CONTRIBUTING.md (e.g., "Authored by Ralphie, the autonomous bug-fix loop. Reviewed by maintainer before merge.")

8. **Label.** `gh issue edit ${ISSUE_NUMBER} --add-label "ralphie:fixed-in-pr"`. The PR's `Closes #` is the rest of the breadcrumb.

9. **Return to main.** `git checkout main`. Each session leaves the working tree on `main` so the next session (or the maintainer) starts from a clean baseline. Apply this on the skip paths too — if you abort and revert in step 6 of the guardrails, end on `main`.

10. ${DRY_RUN_NOTE}

11. ${OVERRIDE_NOTE}

12. Exit.

**[1]** ONE issue per session. Do not pick up other issues, do not chain. The orchestrator handles the next one.
**[2]** Hard constraints from @bugs-rubric.md are non-negotiable: never push to `main`, never modify `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what the focused fix demands), or licensing files. If the fix would require any of these, apply `ralphie:skip-out-of-scope` and exit.
**[3]** A regression test is required _when there is a behavior contract worth pinning_. Apply the litmus test from @testing.md before writing one: "what bug would this catch?" If the only answer is "someone reverted this exact line" (e.g. asserting an asset path equals `/brand/q.svg`, asserting a specific class name, asserting copy text), the test is a vanity test — don't write it. Asset swaps, copy tweaks, and CSS-only fixes are visually verified, not test-locked. If you cannot articulate a user-visible contract the test defends, the fix is either too trivial to need a test, or you haven't found the right contract yet — re-think before writing one.
**[4]** Tests verify behavior — what the system guarantees to the user. 50 different implementations should pass the same test. Test conditional rendering driven by state, input/output contracts, error paths, security boundaries. Never `toBeTruthy()`, snapshots, "renders without crashing", asserts on specific src/href/class/copy values, or "mock was called" (unless the call IS the contract).
**[5]** Capture the **why** in the PR body and (if non-obvious) a code comment. Never narrate **what** in comments — well-named code does that.
**[6]** If you discover the fix requires a schema migration / new env var / new dep / CI change mid-implementation, stop, revert your changes (`git checkout main && git branch -D fix/${ISSUE_NUMBER}-...`), apply `ralphie:skip-out-of-scope`, exit.
**[7]** AI disclosure in the PR body is required by @CONTRIBUTING.md. Never omit it.
**[8]** When applying any `ralphie:skip-*` label, the comment uses the rubric's "Comment shape" format. Always.
**[9]** Question the shape of the fix before committing to it. If the fix is purely a constraint (cap, limit, truncate, hide), the unbounded behavior has a cause — find it and fix it, even when it lives in nearby code. Scope follows the cause: touch nearby code when it's the cause, leave it when it's just adjacent and looks improvable. If you're adding a new element to an existing UI surface, check it's distinguishable from neighbors of similar shape.
