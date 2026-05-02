0a. Read @dependency-rules.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rules.

1. Get the queue: `gh pr list --author "app/dependabot" --state open --limit 100 --json number,title,headRefName,labels,createdAt --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)] | sort_by(.createdAt)'`. Empty → exit cleanly.

2. For each PR in the queue (oldest first), in parallel where it makes sense (use Sonnet subagents for diff reads), evaluate **only Rule 1** (the protected-paths check). Don't classify by major-version category, don't try to predict CI outcomes, don't read changelogs — Phase 2 does all of that. Triage's only job is to keep the loop out of files it shouldn't touch. For each PR:
   - Read the diff: `gh pr diff <#>`.
   - Confirm whether it touches `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files.
   - Apply the GH-Actions exception: PRs from `dependabot/github_actions/*` with diffs limited to `uses:` line changes are eligible (mechanical version pins, not authored CI edits).

3. For each PR, choose ONE outcome:
   - **Skip** (matches Rule 1): apply `ralphie:skip-out-of-scope` and post the rules-shape skip comment. Use `gh pr edit <#> --add-label "ralphie:skip-out-of-scope"` and `gh pr comment <#> --body "..."`.
   - **Eligible** (passes Rule 1): leave the PR untouched. Unlabeled = queued for Phase 2.

4. ${DRY_RUN_NOTE}

5. When the queue is exhausted, print a one-line summary: `Triaged N PRs: X skipped, Y eligible.` Exit.

**[1]** Triage's job is narrow: protected-paths gating only. Everything else — CI red, framework/security-sensitive/pre-1.0 majors, changelog flags — is Phase 2's responsibility. Don't try to short-circuit by skipping at triage based on metadata; that punts work to the human that the loop should do.
**[2]** Never write code in this phase. Never branch, commit, push, merge, or open a PR. Triage is read-only on the repo and write-only on GitHub metadata (labels + comments).
**[3]** A skip comment is for the human; the label is for the next Ralphie. Both are required for a skip.
**[4]** If Rule 1 is ambiguous, lean toward eligible — Phase 2 has its own gates and produces evidence-cited verdicts. False eligibility is cheaper than false skip.
**[5]** Never apply two `ralphie:*` labels to the same PR. First match wins (in practice this means: if you apply skip-out-of-scope, you're done with that PR).
**[6]** If `gh` returns an empty queue, exit 0 silently. No error, no comment.
