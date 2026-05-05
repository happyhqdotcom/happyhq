0a. Read @tech-debt-rubric.md — this is the spec. Apply Phase 2 literally; the engineering-judgment framing in "What this rubric is not" is load-bearing.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rubric.
0c. The issue you are working: #${ISSUE_NUMBER}. Read it: `gh issue view ${ISSUE_NUMBER} --comments`.

1. **Read for intent.** What's the underlying concern in this issue? Who benefits from the change? Treat the body as a hypothesis from the author about what should change and how, not as a script. The named files, sites, and per-site decisions are the author's best guess — your job is to read them, read the actual code, and decide whether they're still right.

2. **Verify the situation.** Open every named file/symbol/site. For each:
   - Does it still exist?
   - Does it still exhibit the issue described?
   - Has the terminal action (e.g., a `'rule': 'off'` line) already been done?
   - Has someone else already addressed part of it?

   **Drift handling:**
   - If the directive is fully obsolete (terminal action done, all sites cleared) → apply `ralphie:skip-stale` (rubric rule 4), post the rubric-shaped comment, exit.
   - If significantly drifted but salvageable → proceed with what's left, note the drift in the PR body's "Verification" section.
   - If under-drifted → continue.

3. **Form an opinion.** Walk each proposed change site and ask honest questions:
   - **Does this change improve the code?** This is the anchor. Each site falls into one of three buckets:
     - **Real bug fixed** — the directive caught something genuinely wrong; the change makes the code correct where it was broken.
     - **Improvement** — not a bug, but the new form is genuinely cleaner (dead code removed, clearer pattern, simpler control flow) on its own merits.
     - **Directive-conformance only** — the code was correct; the change exists solely to satisfy a heuristic (linter false positive, type-checker contortion, awkward migration target, style-rule conformance) without making the code better.
   - Is the body's approach still the right shape for _this_ site? Sometimes a site listed as "fix in place" is actually the kind of pattern the body's "refactor" bucket covers, or vice versa.
   - Is there a smaller fix? A deeper one? Does the issue describe a symptom whose root cause lives one layer up?
   - Are there sites the body missed that fall under the same rule? (Note them in the PR body but don't widen the diff to cover them — that's a separate issue.)
   - **Adjacent latent issues.** While reading the code to make this change, did you notice an unrelated bug nearby (a leak, a stale closure, a missing guard, a TODO that's actually live)? If surgical (one or two lines) → fix in this PR and document in the PR body. If larger → file a follow-up `tech-debt` issue and link it. Don't walk past a real bug just because it's not in the directive.
   - **Same shape across sites = duplication signal.** Two ways this shows up:
     - **Same fix applied twice** — you find yourself applying near-identical changes to ≥2 sites (same control flow, mostly same code, same patch).
     - **Same pre-fix shape across sites** — ≥2 sites have the same anti-pattern + same context (e.g., "reset child state when X changes" effect inside a dialog), even when you choose a per-line disable for both. The shape being patched is duplicated, regardless of whether the patch differs.

     Either way, the structural problem isn't the rule, it's that the logic is duplicated. Don't widen this PR to refactor (out of scope), but file a follow-up `tech-debt` issue describing the shape and pointing at the sites. The pain of editing the parallel code — or the consistency of choosing the same hedge for it — is the signal worth capturing for the next reader.

   **If the body is wrong** (the proposed approach won't produce a good outcome on inspection) → apply `ralphie:skip-needs-rescope` (rubric rule 5), post the rubric-shaped comment with the alternative shape concrete enough that the maintainer can decide whether to update the body, exit. **Do not ship a thoughtless implementation** just because the loop reached this issue.

   **If a meaningful fraction of sites are "directive-conformance only"** — the directive itself doesn't fit this codebase. Re-enabling a linter rule that flags a recurring legitimate pattern, completing a migration whose target doesn't fit how the codebase uses the source, enforcing a style rule that hurts readability for some sites — these are rescope signals, not "fix harder" signals. Apply `ralphie:skip-needs-rescope` with the alternative ("leave rule off; audit pattern X first" / "scope migration to subset Y" / etc.). The "this change improves the code" anchor decides: if a non-trivial number of sites fail it, the directive is wrong, not the code.

4. **Branch.** The wrapper has already snapped `${BASE_BRANCH}` to latest `origin/main`. From `${BASE_BRANCH}`: `git checkout -b chore/${ISSUE_NUMBER}-<short-slug>`. The slug is 2–4 hyphenated words derived from the issue title (per [CLAUDE.md](CLAUDE.md) prefixes — `chore/`, not `fix/`).

5. **Implement.** Apply the change with judgment. Where you deviate from the body, document the deviation in the PR body — that's where reviewers will look for the reasoning. If the body lists per-site decisions ("decide one of: fix / disable / refactor"), apply the bucket guidance the body provides, but override the bucket per site when the code says you should.

5a. **Spec drift sweep.** Before you treat the implementation as done, grep `specs/` for the symbols/files you changed (`grep -rn "<Symbol>\|<filename>" happyhq/specs/`). For each hit:

- **Surgical drift** (a stale symbol name, a removed file path, a one-line description that no longer matches) → fix it in this PR. Spec edits are part of the change.
- **Broad drift** (the spec section describes a flow or component shape that no longer exists; multiple paragraphs would need rewriting) → file a separate `tech-debt` issue describing what's stale, link it from the PR's "Spec drift" section, and proceed. Don't widen this PR into a spec rewrite.
- **No drift** → no action.
  It is **not acceptable** to merge a fix that leaves a `specs/` file referencing the symbol you just removed without either updating the spec or filing the follow-up issue. "Noted, not fixed" only applies once a follow-up issue exists.

6. **Verify.** From the `happyhq/` directory: `pnpm format`, `pnpm lint`, `pnpm check-types`, `pnpm --filter=happyhq test`. If a re-enable step is in scope (an `'off'` line was removed in eslint.config.mjs), `pnpm lint` must pass with the rule active. If any check fails, fix and re-run. If they fail twice, apply `ralphie:skip-verification-failed` (rubric rule 6), post the rubric-shaped comment with the failing output included, exit.

6a. **Exercise.** Try the change end-to-end the way a real user would experience it, before opening the PR. Code-only checks (lint/types/test) prove the plumbing; this step proves nothing visible regressed. Tech-debt fixes are usually behavior-preserving, which is exactly when this matters most — the diff says "nothing should change," and you need to see that's true. Apply this to every fix — pick the right tool for the surface, don't skip because "it's just a refactor."

- **Read [@.dev/exercising-the-ui.md](.dev/exercising-the-ui.md) first.** It owns the UI-driving knowledge: helpers (`scripts/dev-server.ts`, Playwright MCP), pitfalls (`networkidle` lies in dev mode, hotkeys need focus, dynamic button labels, slow first-compile, route-gated menu items, env-specific slugs), and the routing cheat-sheet. Saves you rediscovering them.
- Pick the right tool for the surface(s) you touched in step 5:
  - **UI-visible** — Playwright MCP tools to drive each affected surface. Capture screenshots.
  - **Server-only** — drive the API per [CLAUDE.md](CLAUDE.md) "Using HappyHQ's API for verification". Capture the relevant log excerpt or API response.
  - **Mixed** (server change with a UI surface) — both.
- Drive the happy path on each surface in your per-site list from step 3. For each: does the surface still do what it did before? Sweep for adjacent regressions — the diff says nothing should change; the evidence has to confirm that.
- **If something is broken:** rework once. If still broken on the second attempt, apply `ralphie:skip-cannot-verify` (rubric rule 7) with evidence showing what you saw vs. what was expected, stop the dev server, exit.
- **If you can't reach a surface** (heavy seed state needed, environment can't be produced, etc.): apply `ralphie:skip-cannot-verify` with a one-paragraph note. Don't ship a refactor without evidence the touched surfaces still work.
- **If everything still works:** keep the evidence path(s) — they go in the PR body in step 9. Always stop the dev server when done: `npx tsx scripts/dev-server.ts stop`.

7. **Risk gate.** With the diff in hand, apply the rubric's "Risk gate" decision tree:
   - Run `git diff --stat origin/main...HEAD -- ':!*.md' ':!*.mdx'` to get the size.
   - If under threshold (≤10 files AND ≤300 net lines added) → proceed to step 8.
   - If over threshold AND low-risk per the rubric's criteria → proceed to step 8 with a "Why this is over threshold but low risk" section in the PR body.
   - If over threshold AND high-risk per the rubric's criteria → take the **Split path** (rubric Path B): create child issues, comment on parent, apply `ralphie:split-into-children`, revert the branch (`git checkout ${BASE_BRANCH} && git branch -D chore/${ISSUE_NUMBER}-<slug>`), exit. Do not push.

8. **Commit.** `git add -A && git commit -m "chore: <one-line summary>"`. Body should include `Closes #${ISSUE_NUMBER}` and a one-paragraph **why** for the change.

9. **Push + PR.** `git push -u origin chore/${ISSUE_NUMBER}-<slug>` then `gh pr create --base main --assignee @me --title "chore: <summary>" --body "..."`. The `--assignee @me` puts the PR in the maintainer's "Assigned to me" queue. PR body MUST include:
   - `Closes #${ISSUE_NUMBER}`
   - One-paragraph summary of what changed and why
   - **Per-site classification** — a short table or list with each changed site and its anchor verdict from step 3 (`Real bug fixed` / `Improvement` / `Directive-conformance only`). One-line rationale per site. Reviewers use this to see at a glance whether the loop did engineering or compliance.
   - **Adjacent latent issues** (if any) — what you noticed and fixed while editing the code, with one-line justification each.
   - **Adjacent follow-ups filed** (if any) — link follow-up issues you opened (duplication noticed, larger latent bugs, broad spec drift). Maintainer skim-reads these to see what the loop deferred and why.
   - **Deviations from the issue body** (if any) — what you did differently and why
   - **"Why this is over threshold but low risk"** section (if rule 8 sub-case applied)
   - Verification summary (lint/types/test all green; rule active if applicable)
   - **Visual evidence** — one sentence per surface exercised in step 6a, plus the screenshot(s) or log excerpt(s). For UI changes, upload screenshots via `npx tsx scripts/upload-evidence.ts ${PR_NUMBER} <screenshot-dir>` and embed the returned URLs as inline `![alt](url)` markdown. For server-only changes, paste the relevant log lines or API response in a fenced block.
   - AI-assistance disclosure per [CONTRIBUTING.md](CONTRIBUTING.md) (e.g., "Authored by the tech-debt loop. Reviewed by maintainer before merge.")

10. **Label.** `gh issue edit ${ISSUE_NUMBER} --add-label "ralphie:fixed-in-pr"`. The PR's `Closes #` is the rest of the breadcrumb.

11. **Return to base branch.** `git checkout ${BASE_BRANCH}`. Each session leaves the working tree on `${BASE_BRANCH}` so the next session (or the maintainer) starts from a clean baseline. Apply this on the skip paths too — if you abort and revert in step 6 of the guardrails, end on `${BASE_BRANCH}`.

12. ${DRY_RUN_NOTE}

13. ${OVERRIDE_NOTE}

14. Exit.

**[1]** ONE issue per session. Do not pick up other issues, do not chain. The orchestrator handles the next one.
**[2]** Hard constraints from @tech-debt-rubric.md are non-negotiable: never push to `main`, never modify `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what the focused fix demands), or licensing files. If the fix would require any of these, apply `ralphie:skip-out-of-scope` and exit.
**[3]** Engage seriously, don't follow blindly. The issue body is a hypothesis. Read the code, form your own opinion, deviate when warranted, push back via `ralphie:skip-needs-rescope` when the proposed approach is wrong on inspection. The loop's value comes from doing the engineering — if it just types out what the issue says, the maintainer would be better served reading the issue themselves.
**[4]** Tests defend behavior, not lines. Tech-debt fixes that don't change runtime behavior usually don't need new tests. Tech-debt fixes that DO change behavior need tests that pin the new behavior. Apply the litmus test from `testing.md`: "what bug would this catch?" If the answer is "someone reverted this exact line," skip the test. **Caveat:** when the implementation _pattern_ changes materially — new ref, new control flow, new teardown mechanism, swapped abstraction — even if the externally observable behavior is identical, a regression test pinning the teardown/boundary contract is in scope. The bug to catch is "someone refactors the new pattern and breaks the contract," which is not the same as "someone reverted a line." **Default to testable.** Before claiming a behavior can't be tested, enumerate the standard primitives: time → `vi.useFakeTimers()` + `vi.setSystemTime` + `vi.advanceTimersByTime`; network → `vi.mock` of `fetch` / SDK clients, or MSW; filesystem → `memfs` or tmpdir; DOM events → `@testing-library/react` + `userEvent`; randomness → seedable RNG or mocked `Math.random`. If a useful test is genuinely impractical even after that pass (e.g., real animation timing in JSDOM, true cross-process behavior), say so explicitly in the PR body — don't silently skip.
**[5]** Capture the **why** in the PR body and (if non-obvious) a code comment. Never narrate **what** in comments — well-named code does that. **Literals that encode policy decisions are non-obvious by default** — cadences, thresholds, timeouts, batch sizes, retry counts, debounce windows. Even when the number is round (`60_000`, `5`, `100`), the choice of _that particular number_ isn't visible from the call site. Either name the constant (`PERIOD_TICK_MS`, `MAX_RETRIES`) — preferably with a one-line `// Why this cadence/limit/threshold` comment — or comment the literal inline. The next reader shouldn't have to git-blame to learn why the number is what it is.
**[6]** If you discover the fix requires a schema migration / new env var / new dep / CI change mid-implementation, stop, revert your changes (`git checkout ${BASE_BRANCH} && git branch -D chore/${ISSUE_NUMBER}-...`), apply `ralphie:skip-out-of-scope`, exit.
**[7]** AI disclosure in the PR body is required by @CONTRIBUTING.md. Never omit it.
**[8]** When applying any `ralphie:skip-*` label, the comment uses the rubric's "Comment shape" format. Always.
**[9]** When taking the Split path, the children inherit the rubric — they're unlabeled `tech-debt` issues like any other. Don't pre-label them; let the next loop iteration triage them naturally.
