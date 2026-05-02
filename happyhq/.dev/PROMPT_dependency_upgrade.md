0a. Read @dependency-rules.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rules.
0c. The PR you are working: #${PR_NUMBER}. Read it: `gh pr view ${PR_NUMBER} --comments`. Phase 2 only processes Dependabot PRs that passed triage (no `ralphie:*` label).

1. **Checkout the PR branch.** From `main`: `git checkout main && git pull`. Then: `gh pr checkout ${PR_NUMBER}`. Capture the branch name (`git branch --show-current`) for later reference; you'll need it if you fall through to Path B.

2. **Install.** From the repo root: `pnpm install --frozen-lockfile`. If it fails because the lockfile drifted, run `pnpm install` (no frozen) and treat any unexpected lockfile diff beyond what Dependabot already wrote as a signal to investigate before continuing.

3. **Verify.** From `happyhq/`:
   - `pnpm format`
   - `pnpm lint`
   - `pnpm check-types`
   - `pnpm --filter=happyhq test`
   - `npx tsx scripts/smoke-test.ts` — needs a dev server. Use a non-default port (3000 may collide with another worktree). Recipe:
     1. Start the server in the background: `(cd ../happyhq && PORT=3456 pnpm dev > /tmp/dev-3456.log 2>&1 &)` — or use the Bash tool's `run_in_background: true` with the same command (preferred — gives you a task ID to stop cleanly).
     2. Wait for ready: poll `until curl -sf http://localhost:3456/api/auth/status > /dev/null 2>&1; do sleep 2; done` with the Monitor tool, OR manually re-curl every few seconds. Don't blind-`sleep 30`.
     3. Run the test: `PORT=3456 npx tsx scripts/smoke-test.ts`.
     4. Kill the server: TaskStop on the background task ID, or `pkill -f "next dev"` as a fallback.

4. **Branch on the result:**

   **Path A — clean (verification passed):**
   - **Skim the upstream changelog / release notes** for the version delta. Note any of:
     - Ownership change (different maintainer or org publishing the release)
     - Secrets / auth / token handling refactor
     - Security advisory referenced in the release
     - Deprecation we might hit
     - Breaking API change that the test suite might not cover
   - **If nothing in the skim raises a flag**, jump to "Post the comment" below.
   - **If something is flagged, do NOT immediately skip — investigate the impact for our codebase before deciding.** This is the loop's job, not the human's. For each flag:
     - Read the linked PR / issue / migration note for the specific change. Understand what concretely changed (file paths, behavior, defaults, env vars, etc.).
     - Search the repo for any code, workflow, or config that depends on the affected behavior. Use grep, file reads, and Sonnet subagents in parallel for breadth.
     - Form a concrete impact verdict, with evidence:
       - **"Doesn't affect our usage"** — cite the specific evidence (e.g., "grep finds no caller of `db.transact()` with a callback signature; the v6 API change to that signature can't bite us"). Proceed to ready-to-merge.
       - **"Affects our usage and the change is benign / a clear improvement"** — cite the evidence and reason it's safe (e.g., "we use `actions/checkout` with default `persist-credentials: true`; the new `$RUNNER_TEMP` storage location is functionally equivalent and doesn't break any subsequent step in our workflows"). Proceed to ready-to-merge.
       - **"Affects our usage and impact is unclear after investigation, OR the change introduces real risk we can't size from the available info"** — apply `ralphie:skip-needs-review` with a comment that includes (a) what the change is, (b) what you investigated, (c) what's still unclear and why a human needs to weigh in. Return to main, exit.
   - **Post the comment** on the PR using the rules-shape `ready-to-merge` format. The comment MUST include a `Changelog watch-list` section that documents the verdict for **each** watch item — ownership, auth/secrets, security advisory, deprecations, breaking API — even when the verdict is "none" or "no change". This is an audit trail for future readers; "didn't mention it" and "checked and found nothing" are not the same. For any item where the skim flagged something, include a one-line summary of what was investigated and the impact verdict.
   - **Apply the label**: `gh pr edit ${PR_NUMBER} --add-label "ralphie:ready-to-merge"`.
   - Return to main: `git checkout main && git pull`.
   - Exit. **Do not merge. The human reviews the comment and clicks merge.**

   **Path B — verification failed (breaking-change fixups):**
   - **Plan from the changelog first.** Read the upstream release notes / migration guide for the version delta. Identify which breaking change(s) caused the failures. Quote the relevant entries in the work plan. If the failure mode isn't predicted by the changelog, **stop**: apply `ralphie:skip-verification-failed` to the original PR with the failure output included, return to main, exit.
   - Return to main: `git checkout main`. Note Dependabot's branch name from step 1 — you'll need to read files from it.
   - Create a fresh branch: `git checkout -b chore/upgrade-<package>-v<major>` (use the package name and target major, e.g., `chore/upgrade-stripe-v22`).
   - Apply the version bump from the Dependabot branch to your fresh branch:
     ```
     git checkout <dependabot-branch-name> -- happyhq/package.json pnpm-lock.yaml
     pnpm install
     ```
     (Adjust paths if the Dependabot PR also touched the root `package.json` or other workspace `package.json` files.)
   - Apply the smallest set of fixups required to pass verification. Cite the changelog item that justifies each fixup in commit messages — the diff and the changelog should map 1:1.
   - Re-run verification (step 3). If it fails, fix and re-run. If it fails twice, apply `ralphie:skip-verification-failed` to the original PR with the failing output. Push nothing. Return to main. Exit.
   - **Size gate.** `git diff --stat main...HEAD -- ':!happyhq/package.json' ':!package.json' ':!pnpm-lock.yaml' ':!*.md' ':!*.mdx'`. If >10 files changed or >300 lines net added, apply `ralphie:skip-too-big` to the original PR with a summary of what the fixup would have entailed. Leave the local branch in place (do not push). Return to main. Exit.
   - Commit: `git add -A && git commit -m "chore: upgrade <package> to v<major>"` (one commit per discrete fixup is also fine; cite the changelog item in each commit body).
   - Push: `git push -u origin chore/upgrade-<package>-v<major>`.
   - Open replacement PR: `gh pr create --base main --assignee @me --title "chore: upgrade <package> to v<major>" --body "..."`. PR body MUST include:
     - `Replaces #${PR_NUMBER}`
     - One paragraph identifying the breaking changes that required fixups
     - Quoted excerpts from the upstream changelog with links
     - One bullet per fixup, mapping diff to changelog item (e.g., `- lib/billing.ts:42 — renamed stripe.charges.create → stripe.payments.create per migration guide`)
     - Verification summary (lint/types/test/smoke output, all green)
     - AI-assistance disclosure per @CONTRIBUTING.md (e.g., "Authored by Ralphie, the autonomous dependency-upgrade loop. Reviewed by maintainer before merge.")
   - Capture the new PR number from the create output. Create the dynamic label if it doesn't exist: `gh label create "ralphie:replaced-by-#<new>" --color "5319E7" --description "Ralphie closed this in favor of replacement PR #<new>"` (ignore "already exists" errors).
   - Close the original Dependabot PR with the rules-shape replacement comment, label it `ralphie:replaced-by-#<new>`, then close: `gh pr edit ${PR_NUMBER} --add-label "ralphie:replaced-by-#<new>"`, `gh pr comment ${PR_NUMBER} --body "..."`, `gh pr close ${PR_NUMBER}` (label + comment go on first; closing is the last write).
   - Return to main: `git checkout main`.
   - Exit.

5. ${DRY_RUN_NOTE}

6. ${OVERRIDE_NOTE}

7. Exit.

**[1]** ONE PR per session. Do not pick up other PRs, do not chain. The orchestrator handles the next one.
**[2]** Hard constraints from @dependency-rules.md are non-negotiable: never push to `main`, never push to a Dependabot branch, never merge a Dependabot PR (the human is the gate, always), never modify `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files. If the fixup would require any of these, apply `ralphie:skip-out-of-scope` and exit.
**[3]** Cite the changelog. Every fixup commit message and the replacement PR body must reference the upstream changelog / migration guide entry that justifies the change. If you can't find a changelog entry for what you're fixing, you've drifted off the rails — stop and skip with `ralphie:skip-verification-failed`.
**[4]** Smallest fixup. Don't refactor adjacent code. Don't update unrelated callers. Surface drift via PR-body comments, not by widening the diff.
**[5]** Stop when surprised. If a test failure isn't predicted by the changelog, or you can't trace a diff line to a documented change, apply `ralphie:skip-verification-failed` and let the human take it.
**[6]** AI disclosure in the replacement PR body is required by @CONTRIBUTING.md.
**[7]** Always end on `main` with a clean working tree, even on skip paths.
**[8]** Nothing the loop touches gets auto-merged. Path A ends at `ralphie:ready-to-merge` (label + summary comment); Path B ends at "replacement PR open." In both cases the merge button is the maintainer's.
