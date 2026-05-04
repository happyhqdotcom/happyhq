0a. Read @tech-debt-rubric.md — this is the spec. Apply Phase 1 literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.

1. Get the queue: `gh issue list --label tech-debt --state open --limit 100 --json number,title,author,labels,body,createdAt --jq '[.[] | select(.labels | map(.name) | any(startswith("ralphie:")) | not)]'`. Empty → exit cleanly.

2. For each issue in the queue (oldest first), in parallel where it makes sense (use Sonnet subagents for reads/searches), evaluate against Phase 1 rules 1–3. Read the issue body and ALL comments (`gh issue view <#> --comments`). For rule 3 (pre-stale), do a focused read of the cited file(s) — just enough to confirm whether the directive's terminal action is already done. **Do not read deeply** at triage time — that's Phase 2's job.

3. For each issue, choose ONE outcome:
   - **Skip** (matches a rubric rule): apply the matching `ralphie:skip-*` label and post the comment in the rubric's "Comment shape" format. Use `gh issue edit <#> --add-label "<label>"` and `gh issue comment <#> --body "..."`.
   - **Eligible** (passes rules 1–3): leave the issue untouched. Unlabeled = queued for Phase 2.

4. ${DRY_RUN_NOTE}

5. When the queue is exhausted, print a one-line summary: `Triaged N issues: X skipped, Y eligible.` Exit.

**[1]** Apply the rubric in order. Bail at the earliest stop.
**[2]** Never write code in this phase. Never branch, commit, push, or open a PR. Triage is read-only on the repo and write-only on GitHub metadata (labels + comments).
**[3]** A skip comment is for the human, the label is for the next loop run. Both are required for a skip.
**[4]** If a rule is genuinely ambiguous about an issue (not "the body has a default option I could lean on" — that's now an explicit rule 1 skip), lean toward eligible. Phase 2 has its own gates (rules 4–8), including the rescope path that lets the fix session push back when the body is wrong on closer inspection. False eligibility is cheaper than false skip.
**[5]** Never apply two `ralphie:*` labels to the same issue. First match wins.
**[6]** If `gh` returns an empty queue, exit 0 silently. No error, no comment.
**[7]** **Don't classify by sub-shape.** Triage's only job is to filter issues that aren't actionable as written, that touch protected paths, that need maintainer decisions, or that are pre-stale. Don't try to label issues as "ESLint cluster" or "rename cluster" or anything similar — the fix phase reads each issue on its own and forms its own opinion. Sub-classification at triage punts engineering judgment forward and gets stale fast.
