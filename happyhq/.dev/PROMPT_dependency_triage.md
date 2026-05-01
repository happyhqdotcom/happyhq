0a. Read @dependency-rules.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rules.

1. Get the queue: `gh pr list --author "app/dependabot" --state open --limit 100 --json number,title,headRefName,labels,createdAt --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)] | sort_by(.createdAt)'`. Empty → exit cleanly.

2. For each PR in the queue (oldest first), in parallel where it makes sense (use Sonnet subagents for changelog reads / code searches), evaluate against rules 1–3 (the Phase 1 entries). For each PR:
   - Read the PR body and labels: `gh pr view <#> --comments`.
   - Read the diff to confirm protected-path checks: `gh pr diff <#>`.
   - Check CI status: `gh pr checks <#>`.
   - For runtime majors (rule 3), read the upstream changelog to confirm whether the bump fits the framework / security-sensitive / pre-1.0 → 1.0 categories.

3. For each PR, choose ONE outcome:
   - **Skip** (matches a rule): apply the matching `ralphie:skip-*` label and post the rules-shape skip comment. Use `gh pr edit <#> --add-label "<label>"` and `gh pr comment <#> --body "..."`.
   - **Eligible** (passes rules 1–3): leave the PR untouched. Unlabeled = queued for Phase 2.

4. ${DRY_RUN_NOTE}

5. When the queue is exhausted, print a one-line summary: `Triaged N PRs: X skipped, Y eligible.` Exit.

**[1]** Apply rules in order — first match wins. Don't evaluate rule 3 if rule 1 already trips.
**[2]** Never write code in this phase. Never branch, commit, push, merge, or open a PR. Triage is read-only on the repo and write-only on GitHub metadata (labels + comments).
**[3]** A skip comment is for the human; the label is for the next Ralphie. Both are required for a skip.
**[4]** If the rules are ambiguous about a PR, lean toward eligible — Phase 2 has its own gates (rules 4–5). False eligibility is cheaper than false skip.
**[5]** Never apply two `ralphie:*` labels to the same PR. First match wins.
**[6]** If `gh` returns an empty queue, exit 0 silently. No error, no comment.
