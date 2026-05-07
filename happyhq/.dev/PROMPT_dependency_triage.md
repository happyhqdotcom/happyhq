0a. Read @dependency-rules.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rules.

## Part 1 · Alert sweep

1. Sweep open Dependabot alerts: `gh api repos/:owner/:repo/dependabot/alerts --paginate --jq '[.[] | select(.state=="open")]'`. Empty → skip to Part 2.

2. Dedup by GHSA/CVE ID. For each alert, extract `security_advisory.ghsa_id` and `security_advisory.cve_id`. Search recent PRs and issues:
   - `gh search prs "<id> in:title,body" --state all --limit 5`
   - `gh search issues "<id> in:title,body" --state all --limit 5`

   If any open PR/issue references either ID, or any closed/merged one within the last 30 days does, treat the alert as **already in flight** and continue. (No comment, no action — the existing PR/issue is the audit trail.)

3. For each remaining alert, classify per the **Alert sweep outcomes** table in @dependency-rules.md (A1–A4) and take ONE action:
   - **A1** (an open Dependabot PR already covers the same package + patched version): leave alone.
   - **A2** (patched version exists, no covering PR): open the override PR. Mechanics:
     - `git checkout -b chore/security-<pkg>-<short-id>` off the current base branch
     - Edit `package.json`'s `pnpm.overrides.<pkg>` to `^<patched-version>` (add the entry if absent)
     - Run `pnpm install` from the repo root, then `pnpm format`
     - Read the advisory's affected-surfaces section + grep the repo for the affected APIs to write the exposure note
     - Commit, push, open the PR using the **PR shape (alert sweep override — rule A2)** in the rules file. Apply labels `dependencies` + `security` so it enters the PR queue alongside Dependabot's own PRs.
   - **A3** (no patch, exposure provably nil): open a `security`-labeled issue using the **Issue shape (alert dismiss-recommendation — rule A3)** in the rules file. Do not dismiss the alert.
   - **A4** (ambiguous): open a `security`-labeled issue using the **Issue shape (alert needs-review — rule A4)** in the rules file.

   One action per alert. After A2, the PR will be picked up by Part 2's queue in the same triage run — that's expected and fine; Rule 1 (protected paths) doesn't fire for `package.json` + lockfile edits.

## Part 2 · PR triage

4. Get the PR queue: `gh pr list --state open --limit 100 --json number,title,headRefName,labels,createdAt,author --jq '[.[] | select(.author.login == "app/dependabot" or (.headRefName | startswith("chore/security-"))) | select(.labels | map(.name) | any(startswith("ralphie:")) | not)] | sort_by(.createdAt)'`. Empty → skip to step 7.

5. For each PR in the queue (oldest first), in parallel where it makes sense (use Sonnet subagents for diff reads), evaluate **only Rule 1** (the protected-paths check). Don't classify by major-version category, don't try to predict CI outcomes, don't read changelogs — Phase 2 does all of that. Triage's only job here is to keep the loop out of files it shouldn't touch. For each PR:
   - Read the diff: `gh pr diff <#>`.
   - Confirm whether it touches `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files.
   - Apply the GH-Actions exception: PRs from `dependabot/github_actions/*` with diffs limited to `uses:` line changes are eligible (mechanical version pins, not authored CI edits).

6. For each PR, choose ONE outcome:
   - **Skip** (matches Rule 1): apply `ralphie:skip-out-of-scope` and post the rules-shape skip comment. Use `gh pr edit <#> --add-label "ralphie:skip-out-of-scope"` and `gh pr comment <#> --body "..."`.
   - **Eligible** (passes Rule 1): leave the PR untouched. Unlabeled = queued for Phase 2.

## Part 3 · Wrap-up

7. ${DRY_RUN_NOTE}

8. Print a one-line summary covering both parts: `Triaged N alerts (W ignored A1, X opened A2, Y opened A3/A4) and M PRs (P skipped, Q eligible).` Exit.

**[1]** PR triage's job is narrow: protected-paths gating only. Everything else — CI red, framework/security-sensitive/pre-1.0 majors, changelog flags — is Phase 2's responsibility. Don't try to short-circuit by skipping at triage based on metadata; that punts work to the human that the loop should do.
**[2]** PR triage (Part 2) is read-only on the repo and write-only on GitHub metadata (labels + comments). The **alert sweep** (Part 1) is the only step that opens PRs or issues — and only via the A2/A3/A4 paths exactly as described in the rules file. The same hard constraints from the rules file apply (no push to `main`, no edits to protected paths, no dismissing alerts).
**[3]** A skip comment is for the human; the label is for the next Ralphie. Both are required for a PR skip.
**[4]** If Rule 1 is ambiguous, lean toward eligible — Phase 2 has its own gates and produces evidence-cited verdicts. False eligibility is cheaper than false skip.
**[5]** Never apply two `ralphie:*` labels to the same PR. First match wins (in practice this means: if you apply skip-out-of-scope, you're done with that PR).
**[6]** If both queues are empty, exit 0 silently. No error, no comment.
**[7]** Alert dedup is by GHSA/CVE ID — never by package name alone. Two alerts on the same package can be different advisories.
