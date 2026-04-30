0a. Read @bugs-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.

1. Get the queue: `gh issue list --label bug --state open --limit 100 --json number,title,author,labels,body,createdAt --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)]'`. Empty → exit cleanly.

2. For each issue in the queue (oldest first), in parallel where it makes sense (use Sonnet subagents for reads/searches), evaluate against rubric rules 1–6 (the Phase 1 entries). Read the issue body, ALL comments (`gh issue view <#> --comments`), and any linked logs. For rule 2 (third-party), fetch the author association: `gh api repos/:owner/:repo/issues/<#> --jq '.author_association'` — values OWNER and MEMBER are insiders, anything else (CONTRIBUTOR, FIRST_TIMER, NONE, etc.) is third-party. For rule 6 (size estimate), do a focused code search for the symbols/files the issue mentions before deciding.

3. For each issue, choose ONE outcome:
   - **Skip** (matches a rubric rule): apply the matching `ralphie:skip-*` label and post the comment in the rubric's "Comment shape" format. Use `gh issue edit <#> --add-label "<label>"` and `gh issue comment <#> --body "..."`.
   - **Eligible** (passes rules 1–6): leave the issue untouched. Unlabeled = queued for Phase 2.

4. ${DRY_RUN_NOTE}

5. When the queue is exhausted, print a one-line summary: `Triaged N issues: X skipped, Y eligible.` Exit.

**[1]** Apply the rubric in order. Bail at the earliest stop — don't evaluate rule 6 if rule 1 already trips.
**[2]** Never write code in this phase. Never branch, commit, push, or open a PR. Triage is read-only on the repo and write-only on GitHub metadata (labels + comments).
**[3]** A skip comment is for the human, the label is for the next Ralphie. Both are required for a skip.
**[4]** If the rubric is ambiguous about an issue, lean toward eligible — Phase 2 has its own gates (rules 7–9). False eligibility is cheaper than false skip.
**[5]** Never apply two `ralphie:*` labels to the same issue. First match wins.
**[6]** If `gh` returns an empty queue, exit 0 silently. No error, no comment.
