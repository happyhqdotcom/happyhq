0a. Read @qa-rubric.md — this is the spec. Apply it literally. Note especially the litmus test (_Are you satisfied with what's been tested?_) and the pitfalls section.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.

1. **Get the queue.** If `${SINGLE_PR}` is set, skip the query — operate only on PR #${SINGLE_PR} (regardless of its labels). Otherwise, PRs that are open, labeled `ralphie:ready-to-merge` OR `needs-qa`, and have neither `ralphie:qa-pass` nor `ralphie:qa-fail`:

   ```
   gh pr list --state open --limit 100 \
     --json number,title,author,headRefName,labels,createdAt,body \
     --jq '[.[]
       | select(.labels | map(.name) | any(. == "ralphie:ready-to-merge" or . == "needs-qa"))
       | select(.labels | map(.name) | any(. == "ralphie:qa-pass" or . == "ralphie:qa-fail") | not)
       ] | sort_by(.createdAt)'
   ```

   Empty queue → print `Triaged 0 PRs.` and exit cleanly.

2. **For each PR, gather context** (parallel where it makes sense — Sonnet subagents for diff reads on larger PRs):
   - `gh pr diff <#>` — the diff. Capture in working memory.
   - `gh pr view <#> --comments` — body and review comments. Note the artifacts the author shipped showing (screenshots, log excerpts, "what was exercised" sentence).
   - Author signature in the body's AI-disclosure paragraph distinguishes loop-authored PRs from human ones. Don't treat one as more trustworthy — read the diff regardless.

3. **For each PR, answer the litmus test** by walking the rubric's six steps. Compose the answers as the PR's triage comment body:
   - **What changed?** One sentence.
   - **What could break?** Surface, behavior, data path, integration — name the real risks.
   - **What's been tested?** Quote or cite the author's testing concretely (the embedded screenshots, log excerpts, test results). Don't paraphrase claims you can't verify against artifacts.
   - **How to verify?** Two outcomes:
     - **Litmus test passes on the author's testing alone** — the testing matches the kind of every risk identified. Body reads: `Litmus test passes — author's testing covers <risk> via <evidence>.`
     - **There's a gap** — name what's not covered (which risk, why the existing testing doesn't match its kind), then describe what execute should do to close it (drive the UI, hit an API, read the changelog, run a targeted unit test, inspect logs — see the rubric's "What 'verify' looks like" for the menu).
   - **Backstop?** `smoke` for code PRs. `skip — non-code` for pure non-code (docs only, CSS only, string-literal copy in `.tsx` with no logic change, dev-only deps).

4. **Post or edit each PR's `QA: triage` comment** with the plan body. One comment per PR, edited if it exists, never accumulated.

   Comment body format:

   ```
   QA: triage

   **What changed:** <one sentence>

   **What could break:** <one or two sentences>

   **What's been tested:** <author's testing — quoted / cited concretely>

   **How to verify:** <"Litmus test passes — ..." OR prose verification, naming the gap>

   **Backstop:** <smoke | skip — non-code>
   ```

   Procedure:
   - Find an existing `QA: triage` comment on the PR:
     ```
     EXISTING_ID=$(gh pr view <#> --json comments --jq '.comments[] | select(.body | startswith("QA: triage")) | .id' | head -1)
     ```
   - If empty → create: `gh pr comment <#> --body "$BODY"`
   - If present → edit: `gh api -X PATCH "/repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/issues/comments/$EXISTING_ID" -f body="$BODY"`

   If a PR's diff fetch errored or the diff is empty (e.g., a rebase mid-triage), post / edit its `QA: triage` comment with body `QA: triage — skipped: diff fetch failed, retry next run`. Execute will see the skip directive and exit cleanly.

5. Print a one-line summary: `Triaged N PRs: #X, #Y, #Z`. Exit.

6. ${DRY_RUN_NOTE}

**[1]** Triage's writes are restricted to `gh pr comment` and `gh api PATCH` for `QA: triage` comments. Never label, never post other comments, never branch / commit / push, never edit a comment that isn't a `QA: triage` comment.
**[2]** When in doubt, write the verification. The litmus test should err toward dissatisfaction — a false-positive verification costs ~90s of execute time; a false-negative pass ships a regression to main.
**[3]** Reject these as evidence (per the rubric's pitfalls): contract-level checks of a behavioral risk, smoke as verification, prior `QA: pass` / `QA: fail` comments on this PR (they're previous verdicts, not the author's testing), "I tested it thoroughly" without artifacts.
**[4]** Do not run smoke or any verification yet — that's execute's job.
