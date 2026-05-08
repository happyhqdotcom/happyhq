0a. Read @qa-rubric.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.

1. **Get the queue.** PRs that are open, labeled `ralphie:ready-to-merge` OR `needs-qa`, and have neither `ralphie:qa-pass` nor `ralphie:qa-fail`:

   ```
   gh pr list --state open --limit 100 \
     --json number,title,author,headRefName,labels,createdAt,body \
     --jq '[.[]
       | select(.labels | map(.name) | any(. == "ralphie:ready-to-merge" or . == "needs-qa"))
       | select(.labels | map(.name) | any(. == "ralphie:qa-pass" or . == "ralphie:qa-fail") | not)
       ] | sort_by(.createdAt)'
   ```

   Empty queue → write a plan with `Queue: 0 PRs.` and exit cleanly. The wrapper handles the no-units case.

2. **For each PR in the queue, gather context** (parallel where it makes sense — Sonnet subagents for diff reads on larger PRs):
   - `gh pr diff <#>` — the diff. Capture in working memory.
   - `gh pr view <#> --comments` — body and review comments. Note the embedded Exercise evidence (screenshots, log excerpts, "what was exercised" sentence).
   - Author signature in the body's AI-disclosure paragraph distinguishes loop-authored PRs from human ones. Don't treat one as more trustworthy — read the diff regardless.

3. **For each PR, walk the four steps from the rubric** and capture the answers:
   - **What changed?** One sentence describing the diff.
   - **What could break?** One or two sentences naming the surface, semantic, or data path at risk if the change is wrong.
   - **How to verify?** Either:
     - Author's evidence is sufficient (per the rubric's "What counts as sufficient author evidence"). Cite the specific evidence — quote it, link it, or describe it concretely. Triage's verdict for this PR is `trust`.
     - Author's evidence is thin OR doesn't cover the changed surface. Write the verification: prose describing what execute should do (drive the UI, hit an API, read a changelog, run a targeted unit test, inspect logs — see the rubric's "What 'verify' looks like" for the menu).
   - **Backstop?**
     - Pure non-code PRs (docs only, CSS only, string-literal copy in `.tsx` with no logic change, dev-only deps): `skip — non-code, build can't break`.
     - Otherwise: `smoke`.

4. **Write the plan** to `~/.cache/qa/triage-$(date +%Y%m%dT%H%M%S).md`. One unit per PR, in queue order (oldest `createdAt` first). Format:

   ```markdown
   # QA triage — <UTC timestamp>

   Queue: <N> PRs.

   ## Unit 1 — PR #<X>: <PR title>

   **What changed:** <one sentence>

   **What could break:** <one or two sentences>

   **How to verify:** <"Trust author's evidence: <citation>" OR prose verification steps>

   **Backstop:** <smoke | skip — non-code>

   ---

   ## Unit 2 — PR #<Y>: ...
   ```

5. Print a one-line summary to stdout: `Triaged N PRs into N units. Plan: ~/.cache/qa/triage-<timestamp>.md`. Exit.

6. ${DRY_RUN_NOTE}

**[1]** Triage is read-only on the repo and write-only on the local plan file. Never label, comment, branch, commit, push, or open a PR in this phase. Execute does all of that.
**[2]** When in doubt about whether author evidence is sufficient, write the verification. False-positive verification time costs ~90s; a false-negative pass ships a regression.
**[3]** If a PR's diff is empty or `gh pr diff` errors (e.g., a rebase mid-triage), skip it and note in the plan: `## Unit N — PR #X — skipped: diff fetch failed, retry next run`. The wrapper will count it as a unit but execute will see the skip directive and exit cleanly.
**[4]** Do not run smoke or any verification yet — that's execute's job.
**[5]** Do not write the plan to anywhere other than `~/.cache/qa/triage-<timestamp>.md`. The wrapper reads from there.
