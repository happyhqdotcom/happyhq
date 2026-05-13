0a. Read @bugs-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. ${DRY_RUN_NOTE}

1. Get the queue: `gh issue list --label bug --state open --limit 100 --json number,title,author,labels,body,createdAt --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)]'`. Empty → exit 0 silently.

2. Walk the queue oldest first. For each issue:
   - Read the issue body, ALL comments (`gh issue view <#> --comments`), and any linked logs.
   - Evaluate against the rubric's Skip conditions in order. Bail at the earliest match.
   - When a condition depends on author association, fetch it: `gh api repos/:owner/:repo/issues/<#> --jq '.author_association'`.
   - When a condition depends on size, do a focused code search for the symbols/files the issue mentions first.

   Use Sonnet subagents for reads/searches that can run in parallel.

3. For each issue, one outcome:
   - **Skip** (a Skip condition matched): `gh issue edit <#> --add-label "<label>"` plus `gh issue comment <#> --body "..."` in the rubric's "Comment shape" format.
   - **Eligible** (no Skip condition matched): leave it untouched. Unlabeled = queued for the fix loop.

4. When the queue is exhausted, print: `Triaged N issues: X skipped, Y eligible.` Exit.

**[1]** Never write code in this phase. Never branch, commit, push, or open a PR. Triage is read-only on the repo and write-only on GitHub metadata (labels + comments).
**[2]** First match wins — never apply two `ralphie:*` labels to the same issue.
