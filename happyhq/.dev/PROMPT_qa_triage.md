0a. Read @qa-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.

1. Get the queue: `gh pr list --state open --limit 100 --json number,title,author,headRefName,labels,createdAt,body --jq '[.[] | select(.labels | map(.name) | any(. == "ralphie:ready-to-merge" or . == "needs-qa")) | select(.labels | map(.name) | any(. == "ralphie:qa-pass" or . == "ralphie:qa-fail") | not)] | sort_by(.createdAt)'`. Empty → exit cleanly.

2. For each PR in the queue, in parallel where it makes sense (use Sonnet subagents for diff reads), gather context:
   - Read the diff: `gh pr diff <#>`. Capture the full diff in working memory; you'll classify against the rubric's critical-path table.
   - Read the body and comments: `gh pr view <#> --comments`. Note the **Exercise evidence** — embedded `![](...)` screenshot URLs, "Visual evidence" sections, log excerpts, the "what was exercised" sentence.
   - Note the author. PRs from the bugs / tech-debt / dependency loops will have a different author signature in the body's AI-disclosure paragraph than human-authored PRs. Don't treat one source as more trustworthy — read the diff regardless.

3. For each PR, classify against the rubric's **critical path** definition:
   - **Critical-path** if the diff touches any path in the rubric's table (lib/agents, lib/run, lib/fs, lib/actions, app/api/run, app/api/fs, lib/file-types.ts, components/features/tasks, components/features/chat, etc.) OR is a dep bump in the elevated-scrutiny list.
   - **Non-critical-path** if the diff is purely `*.md`/`*.mdx`, `*.css`, Tailwind, or string-literal copy changes in `.tsx` (no logic / prop / handler changes).
   - **Straddle case** (a TSX file with both copy and a new conditional, etc.): treat as critical-path. When in doubt, smoke.

4. **Decide cohort policy.** Apply the rubric's cohort heuristics (`Batch when` / `Isolate when`) to produce a list of **test units**. Each unit has:
   - One or more PRs (by number).
   - A strategy: `evidence-sufficient`, `smoke-isolated`, `smoke-bespoke`, or `smoke-batched`.
   - A one-paragraph reasoning.
   - For `smoke-bespoke` units: the specific surface or scenario the smoke wouldn't cover and that bespoke driving will exercise (e.g., "drive the chat composer's drag-and-drop with a docx").
   - For `smoke-batched` units: a one-line note on why these PRs are integration-safe to test together.

5. **Order the test units.** Riskier first — `smoke-isolated` and `smoke-bespoke` before `smoke-batched` and `evidence-sufficient`. Within a tier, follow the queue order (oldest createdAt first).

6. **Write the plan** to `~/.cache/qa/triage-$(date +%Y%m%dT%H%M%S).md`. Format:

   ```markdown
   # QA triage — <UTC timestamp>

   Queue: <N> PRs. Test units: <M>.

   ## Unit 1 — <strategy>: PR #X (and #Y, #Z if batched)

   **Reasoning:** <one paragraph — why this strategy fits, what surface to verify, what to look for>

   **Diff summary:** <one or two sentences — what changed>

   **Exercise evidence:** <link to or quote the embedded evidence; "none" if absent>

   **Bespoke scenario** (if smoke-bespoke): <one paragraph — the specific flow to drive, the assertion>

   **Batch context** (if smoke-batched): <why these are integration-safe together>

   ---

   ## Unit 2 — ...
   ```

7. Print a one-line summary to stdout: `Triaged N PRs into M test units. Plan: ~/.cache/qa/triage-<timestamp>.md`. Exit.

8. ${DRY_RUN_NOTE}

**[1]** Triage is read-only on the repo and write-only on the local plan file (`~/.cache/qa/triage-*.md`). Never label, comment, branch, commit, push, or open a PR in this phase. The execute phase does all of that.
**[2]** Apply the critical-path table literally. If the diff touches a path in the table, the PR is critical-path — don't talk yourself into "but it's a small change in `lib/run/`." The whole point of the table is to remove that judgment call.
**[3]** When the rubric is ambiguous about a PR, lean toward smoking. The cost of a false-positive smoke run is ~90s; the cost of a false-negative pass is a regression in main.
**[4]** If a PR's diff is empty or `gh pr diff` errors (e.g., the PR was just rebased mid-triage), skip it from this run — it'll be picked up on the next pass. Note in the plan: `Unit N — skipped: diff fetch failed, retry next run`.
**[5]** Do not run smoke yet. Triage produces a plan; execute is what actually drives the dev server.
**[6]** Do not write the plan to anywhere other than `~/.cache/qa/triage-<timestamp>.md`. The execute phase reads from there.
