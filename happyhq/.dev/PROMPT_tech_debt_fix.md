0a. Read @tech-debt-rubric.md — this is the spec. Apply Phase 2 literally; the engineering-judgment framing in "What this rubric is not" is load-bearing.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. The issue you are working: #${ISSUE_NUMBER}. Read it: `gh issue view ${ISSUE_NUMBER} --comments`.

1. **Read for intent.** What's the underlying concern in this issue? Who benefits from the change? Treat the body as a hypothesis from the author about what should change and how, not as a script. The named files, sites, and per-site decisions are the author's best guess — your job is to read them, read the actual code, and decide whether they're still right.

2. **Verify the situation.** Open every named file/symbol/site. For each:
   - Does it still exist?
   - Does it still exhibit the issue described?
   - Has the terminal action (e.g., a `'rule': 'off'` line) already been done?
   - Has someone else already addressed part of it?

   **Drift handling:**
   - If the directive is fully obsolete (terminal action done, all sites cleared) → apply `ralphie:skip-stale` (rubric rule 4), post the rubric-shaped comment, exit.
   - If significantly drifted but salvageable → proceed with what's left, note the drift in the PR body's "Verification" section.
   - If under-drifted → continue.

3. **Form an opinion.** Walk each proposed change site and ask honest questions:
   - Is the body's approach still the right shape for _this_ site? Sometimes a site listed as "fix in place" is actually the kind of pattern the body's "refactor" bucket covers, or vice versa.
   - Is there a smaller fix? A deeper one? Does the issue describe a symptom whose root cause lives one layer up?
   - Are there sites the body missed that fall under the same rule? (Note them in the PR body but don't widen the diff to cover them — that's a separate issue.)

   **If the body is wrong** (the proposed approach won't produce a good outcome on inspection) → apply `ralphie:skip-needs-rescope` (rubric rule 5), post the rubric-shaped comment with the alternative shape concrete enough that the maintainer can decide whether to update the body, exit. **Do not ship a thoughtless implementation** just because the loop reached this issue.

4. **Branch.** The wrapper has already snapped `${BASE_BRANCH}` to latest `origin/main`. From `${BASE_BRANCH}`: `git checkout -b chore/${ISSUE_NUMBER}-<short-slug>`. The slug is 2–4 hyphenated words derived from the issue title (per [CLAUDE.md](CLAUDE.md) prefixes — `chore/`, not `fix/`).

5. **Implement.** Apply the change with judgment. Where you deviate from the body, document the deviation in the PR body — that's where reviewers will look for the reasoning. If the body lists per-site decisions ("decide one of: fix / disable / refactor"), apply the bucket guidance the body provides, but override the bucket per site when the code says you should.

5a. **Spec drift sweep.** Before you treat the implementation as done, grep `specs/` for the symbols/files you changed (`grep -rn "<Symbol>\|<filename>" happyhq/specs/`). For each hit:

- **Surgical drift** (a stale symbol name, a removed file path, a one-line description that no longer matches) → fix it in this PR. Spec edits are part of the change.
- **Broad drift** (the spec section describes a flow or component shape that no longer exists; multiple paragraphs would need rewriting) → file a separate `tech-debt` issue describing what's stale, link it from the PR's "Spec drift" section, and proceed. Don't widen this PR into a spec rewrite.
- **No drift** → no action.
  It is **not acceptable** to merge a fix that leaves a `specs/` file referencing the symbol you just removed without either updating the spec or filing the follow-up issue. "Noted, not fixed" only applies once a follow-up issue exists.

6. **Verify.** From the `happyhq/` directory: `pnpm format`, `pnpm lint`, `pnpm check-types`, `pnpm --filter=happyhq test`. If a re-enable step is in scope (an `'off'` line was removed in eslint.config.mjs), `pnpm lint` must pass with the rule active. If any check fails, fix and re-run. If they fail twice, apply `ralphie:skip-verification-failed` (rubric rule 6), post the rubric-shaped comment with the failing output included, exit.

7. **Risk gate.** With the diff in hand, apply the rubric's "Risk gate" decision tree:
   - Run `git diff --stat origin/main...HEAD -- ':!*.md' ':!*.mdx'` to get the size.
   - If under threshold (≤10 files AND ≤300 net lines added) → proceed to step 8.
   - If over threshold AND low-risk per the rubric's criteria → proceed to step 8 with a "Why this is over threshold but low risk" section in the PR body.
   - If over threshold AND high-risk per the rubric's criteria → take the **Split path** (rubric Path B): create child issues, comment on parent, apply `ralphie:split-into-children`, revert the branch (`git checkout ${BASE_BRANCH} && git branch -D chore/${ISSUE_NUMBER}-<slug>`), exit. Do not push.

8. **Commit.** `git add -A && git commit -m "chore: <one-line summary>"`. Body should include `Closes #${ISSUE_NUMBER}` and a one-paragraph **why** for the change.

9. **Push + PR.** `git push -u origin chore/${ISSUE_NUMBER}-<slug>` then `gh pr create --base main --assignee @me --title "chore: <summary>" --body "..."`. The `--assignee @me` puts the PR in the maintainer's "Assigned to me" queue. PR body MUST include:
   - `Closes #${ISSUE_NUMBER}`
   - One-paragraph summary of what changed and why
   - **Deviations from the issue body** (if any) — what you did differently and why
   - **"Why this is over threshold but low risk"** section (if rule 8 sub-case applied)
   - Verification summary (lint/types/test all green; rule active if applicable)
   - AI-assistance disclosure per [CONTRIBUTING.md](CONTRIBUTING.md) (e.g., "Authored by the tech-debt loop. Reviewed by maintainer before merge.")

10. **Label.** `gh issue edit ${ISSUE_NUMBER} --add-label "ralphie:fixed-in-pr"`. The PR's `Closes #` is the rest of the breadcrumb.

11. **Return to base branch.** `git checkout ${BASE_BRANCH}`. Each session leaves the working tree on `${BASE_BRANCH}` so the next session (or the maintainer) starts from a clean baseline. Apply this on the skip paths too — if you abort and revert in step 6 of the guardrails, end on `${BASE_BRANCH}`.

12. ${DRY_RUN_NOTE}

13. ${OVERRIDE_NOTE}

14. Exit.

**[1]** ONE issue per session. Do not pick up other issues, do not chain. The orchestrator handles the next one.
**[2]** Hard constraints from @tech-debt-rubric.md are non-negotiable: never push to `main`, never modify `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what the focused fix demands), or licensing files. If the fix would require any of these, apply `ralphie:skip-out-of-scope` and exit.
**[3]** Engage seriously, don't follow blindly. The issue body is a hypothesis. Read the code, form your own opinion, deviate when warranted, push back via `ralphie:skip-needs-rescope` when the proposed approach is wrong on inspection. The loop's value comes from doing the engineering — if it just types out what the issue says, the maintainer would be better served reading the issue themselves.
**[4]** Tests defend behavior, not lines. Tech-debt fixes that don't change runtime behavior usually don't need new tests. Tech-debt fixes that DO change behavior need tests that pin the new behavior. Apply the litmus test from `testing.md`: "what bug would this catch?" If the answer is "someone reverted this exact line," skip the test.
**[5]** Capture the **why** in the PR body and (if non-obvious) a code comment. Never narrate **what** in comments — well-named code does that.
**[6]** If you discover the fix requires a schema migration / new env var / new dep / CI change mid-implementation, stop, revert your changes (`git checkout ${BASE_BRANCH} && git branch -D chore/${ISSUE_NUMBER}-...`), apply `ralphie:skip-out-of-scope`, exit.
**[7]** AI disclosure in the PR body is required by @CONTRIBUTING.md. Never omit it.
**[8]** When applying any `ralphie:skip-*` label, the comment uses the rubric's "Comment shape" format. Always.
**[9]** When taking the Split path, the children inherit the rubric — they're unlabeled `tech-debt` issues like any other. Don't pre-label them; let the next loop iteration triage them naturally.
