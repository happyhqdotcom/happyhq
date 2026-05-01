0a. Read @dependency-rules.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rules.

1. Get the queue: `gh pr list --author "app/dependabot" --state open --limit 100 --json number,title,headRefName,labels,createdAt --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)] | sort_by(.createdAt)'`. Empty → exit cleanly.

2. For each PR in the queue (oldest first), in parallel where it makes sense (use Sonnet subagents for changelog reads / code searches), evaluate against tier rules 1–10. For each PR:
   - Read the PR body and labels: `gh pr view <#> --comments`.
   - Read the diff to confirm protected-path checks and the dep type (runtime vs dev vs types vs actions): `gh pr diff <#>`.
   - Check CI status: `gh pr checks <#>`.
   - Read the upstream changelog for the version delta. For npm packages: the package's GitHub releases page or the CHANGELOG.md in their repo (linked from the registry). For GitHub Actions: the action's release notes.
   - For runtime majors, grep the repo for callers of the changed APIs to gauge fixup surface.

3. For each PR, choose ONE outcome per the rules table:
   - **Skip** (matches a skip rule): apply the matching `ralphie:skip-*` label and post the rules-shape skip comment. Use `gh pr edit <#> --add-label "<label>"` and `gh pr comment <#> --body "..."`.
   - **Tier 1/2/3**: apply the matching `ralphie:tier-{1,2,3}-*` label and post the rules-shape classification comment. Both label and comment are required.

4. ${DRY_RUN_NOTE}

5. When the queue is exhausted, print a one-line summary: `Triaged N PRs: T1=<n> tier-1-safe, T2=<n> tier-2-adapt, T3=<n> tier-3-manual, S=<n> skipped.` Exit.

**[1]** Apply rules in order — first match wins. Don't evaluate later rules if an earlier one trips.
**[2]** Never write code in this phase. Never branch, commit, push, merge, or open a PR. Triage is read-only on the repo and write-only on GitHub metadata (labels + comments).
**[3]** A skip comment is for the human; the label is for the next run. Both are required for a skip.
**[4]** A tier comment is for the human reviewing the queue and for the Phase 2 session that picks up the PR. Both the comment and the label are required.
**[5]** Never apply two `ralphie:*` labels to the same PR. First match wins.
**[6]** If `gh` returns an empty queue, exit 0 silently. No error, no comment.
**[7]** When the rules are ambiguous about a PR's tier, lean toward the higher tier (more human review). False tier-3 is cheaper than false tier-1.
