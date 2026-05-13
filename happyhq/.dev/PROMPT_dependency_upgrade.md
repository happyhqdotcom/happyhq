0a. Read @dependency-rules.md — this is the spec. Apply it literally.
0b. Read @CLAUDE.md and @CONTRIBUTING.md (repo root) for repo conventions referenced by the rules.
0c. The PR you are working: #${PR_NUMBER}. Read it: `gh pr view ${PR_NUMBER} --comments`. Phase 2 processes both Dependabot PRs and `chore/security-*` override PRs Ralphie opened during the alert sweep — both passed Rule 1 (no `ralphie:*` label) to be in this queue. For `chore/security-*` PRs, the security advisory plays the role of the changelog: read it from the linked GHSA page, treat it the same way you'd treat upstream release notes for investigation purposes.
0d. **Classify upfront for elevated scrutiny.** Identify whether this PR is one of:

- **Framework major** — `next`, `react`, `react-dom`, or similar coordinate-the-stack packages
- **Security-sensitive runtime major** — auth, crypto, billing primitives (e.g., `stripe`, `instantdb`, JWT/OIDC libs)
- **Pre-1.0 → 1.0 jump on a runtime dep** (in `dependencies`, not `devDependencies`)
- **Multi-major bump** — e.g., `stripe` v20 → v22, skipping v21
- **Agent / AI SDK bump (ANY version delta, including patch)** — `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, or any similar LLM client. Tests can't observe LLM behavior changes; patch bumps can still shift tool schemas, default model params, retry semantics, prompt caching, or streaming format. Investigation must read the SDK's release notes for the version delta and check for shifts in defaults / schemas / runtime semantics — not just check for breaking type changes.

If yes, this session uses **elevated scrutiny**: investigation needs to be thorough, the bar for "doesn't affect us" is higher, and skip outcomes (`skip-needs-review` or `skip-manual-upgrade`) are correct when investigation can't be exhaustive.

1. **Checkout the PR branch.** The wrapper has already snapped `${BASE_BRANCH}` to latest `origin/main`. From `${BASE_BRANCH}`: `gh pr checkout ${PR_NUMBER}`. Capture the branch name (`git branch --show-current`) for later reference; you'll need it if you fall through to Path B. Capture the head SHA too for the replacement-PR description if needed.

2. **Install.** From the repo root: `pnpm install --frozen-lockfile`.
   - **If install succeeds:** continue to step 3.
   - **If install fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` / `ERR_PNPM_OUTDATED_LOCKFILE` / similar tooling-state mismatch:** this is a known Dependabot/pnpm interaction quirk (e.g., Dependabot bumped a `pnpm.overrides` value in `package.json` but didn't re-resolve the lockfile's overrides snapshot). Run `pnpm install` (no frozen) to regenerate the lockfile. **Mark this session as `LOCKFILE_REGENERATED=true`** — you'll need the regenerated lockfile for the replacement PR in step 4 Path B. If no-frozen install also fails, that's a real install failure — apply `ralphie:skip-verification-failed` with the install output and exit.
   - **If install succeeds but the lockfile diff is larger than what Dependabot's PR contained:** stop and investigate before continuing — there may be transitive resolution drift the agent should not paper over.

3. **Verify.** From `happyhq/`:
   - `pnpm format`
   - `pnpm lint`
   - `pnpm check-types`
   - `pnpm --filter=happyhq test`
   - `npx tsx scripts/smoke-test.ts` — needs a dev server. **Use port `${SMOKE_PORT}` (set by the wrapper). Do not pick another port.** Port 3000 is reserved for the maintainer's own dev server and may also be in use by another worktree; an unrelated port risks EADDRINUSE failures or — worse — running the smoke test against an unrelated server. Recipe:
     1. Start the server in the background: `(cd ../happyhq && PORT=${SMOKE_PORT} pnpm dev > /tmp/dev-${SMOKE_PORT}.log 2>&1 &)` — or use the Bash tool's `run_in_background: true` with the same command (preferred — gives you a task ID to stop cleanly).
     2. Wait for ready: poll `until curl -sf http://localhost:${SMOKE_PORT}/api/auth/status > /dev/null 2>&1; do sleep 2; done` with the Monitor tool, OR manually re-curl every few seconds. Don't blind-`sleep 30`.
     3. Run the test: `PORT=${SMOKE_PORT} npx tsx scripts/smoke-test.ts`.
     4. Kill the server: TaskStop on the background task ID, or as a fallback `lsof -ti :${SMOKE_PORT} | xargs kill 2>/dev/null` (port-scoped — do NOT use `pkill -f "next dev"`, that kills the maintainer's own dev server too).

4. **Branch on the result:**

   **Path A — verification clean.** Three sub-cases depending on whether the lockfile was regenerated and whether the bump is in an elevated-scrutiny category.

   First, do the changelog skim and investigation regardless of sub-case:
   - **Skim the upstream changelog / release notes** for the version delta. Note any of:
     - Ownership change (different maintainer or org publishing the release)
     - Secrets / auth / token handling refactor
     - Security advisory referenced in the release
     - Deprecation we might hit
     - Breaking API change that the test suite might not cover
   - **For elevated-scrutiny PRs (per step 0d), investigate proactively** even if no specific changelog item flagged. Read the migration guide thoroughly, grep the repo for all call-sites of the affected APIs, look for behavior tests (not just type tests), think about runtime semantics (RSC boundaries, hydration timing, server actions, etc. for framework majors).
   - **For each flagged item or elevated-scrutiny concern, investigate the impact** for our codebase before deciding:
     - Read the linked PR / issue / migration note. Understand what concretely changed.
     - Search the repo for any code, workflow, or config that depends on the affected behavior. Use grep, file reads, and Sonnet subagents in parallel for breadth.
     - Form a concrete impact verdict, with evidence:
       - **"Doesn't affect our usage"** — cite the specific evidence. Proceed to ready-to-merge.
       - **"Affects our usage and the change is benign / a clear improvement"** — cite the evidence and reason it's safe. Proceed to ready-to-merge.
       - **"Affects our usage; impact is unclear after investigation OR introduces real risk we can't size from the available info"** — apply `ralphie:skip-needs-review` with the rules-shape comment (what investigated, what's still unclear). Return to `${BASE_BRANCH}`, exit.
       - **"Migration would clearly exceed the loop's size cap (multi-day refactor, multi-major stepping required, breaking API touches >10 call-sites)"** — apply `ralphie:skip-manual-upgrade` with cited reason. Return to `${BASE_BRANCH}`, exit.

   Then the sub-case decides what to do with the verdict:

   **Path A.1 — verification clean, install was clean (`LOCKFILE_REGENERATED=false`), investigation passed:**
   - **Post the comment** on the PR using the rules-shape `ready-to-merge` format. The comment MUST include an `### Investigation` section (use exactly that header) with one line for **each** of the five audit items — ownership, auth/secrets, security advisory, deprecations, breaking API — even when the verdict is "none" or "no change". For elevated-scrutiny PRs, the Investigation section should also explicitly note "Elevated scrutiny applied: <category>" and quote the specific evidence cleared.
   - **Apply the label**: `gh pr edit ${PR_NUMBER} --add-label "ralphie:ready-to-merge"`.
   - Return to `${BASE_BRANCH}`: `git checkout ${BASE_BRANCH}`.
   - Exit. **Do not merge. The human reviews and clicks merge.**

   **Path A.2 — verification clean, but lockfile was regenerated (`LOCKFILE_REGENERATED=true`):**
   - The Dependabot PR's committed lockfile is broken; we cannot just label `ready-to-merge` because CI will keep failing on Dependabot's branch. We need to push the regenerated lockfile via a replacement PR.
   - Skip ahead to **Path B.2 — lockfile-regeneration replacement** below.

   **Path B — verification failed.** Three sub-cases:

   **Path B.1 — unrelated CI / pre-existing main breakage.**
   - If the failure reproduces locally on a fresh `${BASE_BRANCH}` checkout (i.e., the same test or lint failure exists on main itself, not introduced by the bump), this is unrelated CI. Apply `ralphie:skip-ci-red` with the failure output and a one-line "verified by re-running the failing check on `${BASE_BRANCH}` clean checkout". Return to `${BASE_BRANCH}`, exit.

   **Path B.2 — lockfile-regeneration replacement (no behavioral change).**
   - Triggered when `LOCKFILE_REGENERATED=true` from step 2 AND verification (step 3) passed locally. This means the fix is "use the regenerated lockfile" — no code changes needed.
   - **Before regenerating, inspect Dependabot's diff to detect the case shape:**

     ```
     git diff origin/main...<dependabot-branch> --name-only
     git diff origin/main...<dependabot-branch> -- pnpm-lock.yaml | grep -E '^[+-] {2}[a-zA-Z@/-]+: \^?[0-9]' | head -20
     ```

     Three sub-shapes determine how to construct the replacement branch:

     **B.2.a — package.json + lockfile bumps (the typical case):**
     - Recipe: take both files from Dependabot's branch and re-run install:
       ```
       git checkout <dependabot-branch-name> -- happyhq/package.json package.json
       pnpm install   # regenerates pnpm-lock.yaml fresh
       ```

     **B.2.b — lockfile-only bumps (transitive deps; Dependabot didn't change package.json):**
     - Don't `pnpm install` from the current package.json — that re-resolves _current_ state and may reset transitive bumps Dependabot intended. Instead, take Dependabot's lockfile directly:
       ```
       git checkout <dependabot-branch-name> -- pnpm-lock.yaml
       pnpm install --frozen-lockfile   # verifies the lockfile is internally consistent against current package.json
       ```
     - If the frozen install fails, fall through to B.2.c — Dependabot's lockfile carries an override-floor change that needs a package.json reconciliation.

     **B.2.c — override-floor bump in lockfile (Dependabot raised `pnpm.overrides` snapshot in lockfile but didn't update `package.json`'s `pnpm.overrides`):**
     - Detect by: lockfile diff includes a change to the top-of-file `overrides:` section (e.g., `-  postcss: ^8.5.10` / `+  postcss: ^8.5.13`) **and** `git diff origin/main...<dependabot-branch> -- package.json` shows no matching `pnpm.overrides.<pkg>` change.
     - This is Dependabot's intent leaking through: it wanted to raise a security/policy floor on a transitive dep but its tooling only updated the lockfile snapshot, not the package.json source of truth.
     - **Do NOT** simply regenerate from current package.json — that silently undoes the floor bump and weakens the security guarantee.
     - Recipe:
       1. Read the lockfile-snapshot bump to identify the package and the new floor (e.g., `postcss: ^8.5.13`).
       2. Update `package.json`'s `pnpm.overrides.<pkg>` to the new floor:
          ```
          # Edit package.json: pnpm.overrides.postcss → "^8.5.13"
          ```
       3. Regenerate lockfile: `pnpm install`.
       4. Verify the resulting lockfile's `overrides:` snapshot matches Dependabot's.
     - Replacement PR body must call out the override floor change explicitly so the maintainer can sanity-check the security/policy intent.

   - Verify everything is consistent: `git status` should show `package.json` and/or `happyhq/package.json` and `pnpm-lock.yaml` modified — nothing else.
   - **Size gate** still applies: `git diff --stat origin/main...HEAD -- ':!happyhq/package.json' ':!package.json' ':!pnpm-lock.yaml' ':!*.md' ':!*.mdx'`. (Should be 0 changes — the regen path is supposed to be clean.) If somehow >10 files / >300 LoC, apply `ralphie:skip-too-big` with cited reason and exit.
   - Commit: `git add -A && git commit -m "chore: regenerate lockfile for <package or group> bump"` with a body that quotes the original `pnpm install --frozen-lockfile` error output. For B.2.c, the commit body must also state the override floor was raised and quote the lockfile snapshot diff.
   - Push: `git push -u origin chore/upgrade-<package>-lockfile-regen`.
   - Open replacement PR: `gh pr create --base main --assignee @me --title "chore: regenerate lockfile for <package or group> bump" --body "..."`. PR body MUST include:
     - `Replaces #${PR_NUMBER}`
     - One-paragraph explanation: Dependabot's PR had a `pnpm install --frozen-lockfile` mismatch (quote the original error). The fix is the regenerated lockfile; there is no behavioral change beyond the version bump itself.
     - Quote the original Dependabot PR's bumped versions for traceability.
     - Verification summary (lint/types/test/smoke output, all green).
     - AI-assistance disclosure per @CONTRIBUTING.md.
   - Capture the new PR number for the replacement comment. Create the generic label if it doesn't exist yet: `gh label create "ralphie:replaced-by-newer-pr" --color "5319E7" --description "Closed because the loop opened a replacement PR; the replacement's body links via 'Replaces #N'"` (ignore "already exists" errors).
   - Close the original Dependabot PR: `gh pr edit ${PR_NUMBER} --add-label "ralphie:replaced-by-newer-pr"`, `gh pr comment ${PR_NUMBER} --body "..."` (rules-shape replacement comment — the comment carries the link to the new PR; the label only signals "don't re-pick"), `gh pr close ${PR_NUMBER}`.
   - Return to `${BASE_BRANCH}`. Exit.

   **Path B.3 — breaking-change fixups.**
   - **Plan from the changelog first.** Read the upstream release notes / migration guide for the version delta. Identify which breaking change(s) caused the failures. Quote the relevant entries in the work plan. **If the failure mode isn't predicted by the changelog**, stop: apply `ralphie:skip-verification-failed` with the failure output included, return to `${BASE_BRANCH}`, exit.
   - Return to `${BASE_BRANCH}`: `git checkout ${BASE_BRANCH}`. Note Dependabot's branch name from step 1.
   - Create a fresh branch: `git checkout -b chore/upgrade-<package>-v<major>` (e.g., `chore/upgrade-stripe-v22`).
   - Apply the version bump from the Dependabot branch:
     ```
     git checkout <dependabot-branch-name> -- happyhq/package.json pnpm-lock.yaml
     pnpm install
     ```
     (Adjust paths if the Dependabot PR also touched the root `package.json` or other workspace `package.json` files.)
   - Apply the smallest set of fixups required to pass verification. Cite the changelog item that justifies each fixup in commit messages — the diff and the changelog should map 1:1.
   - Re-run verification (step 3). If it fails, fix and re-run. **If it fails twice**, apply `ralphie:skip-verification-failed` with the failing output. Push nothing. Return to `${BASE_BRANCH}`. Exit.
   - **Size gate.** `git diff --stat origin/main...HEAD -- ':!happyhq/package.json' ':!package.json' ':!pnpm-lock.yaml' ':!*.md' ':!*.mdx'`. (Use `origin/main`, not the local `main` ref — when running from a worktree the local `main` may be stale.) If >10 files changed or >300 lines net added, apply `ralphie:skip-too-big` with a summary of what the fixup would have entailed. Leave the local branch in place (do not push). Return to `${BASE_BRANCH}`. Exit.
   - Commit: `git add -A && git commit -m "chore: upgrade <package> to v<major>"` (one commit per discrete fixup is also fine; cite the changelog item in each commit body).
   - Push: `git push -u origin chore/upgrade-<package>-v<major>`.
   - Open replacement PR per the standard shape (see Path B.2 for label creation; PR body MUST include `Replaces #${PR_NUMBER}`, a paragraph identifying the breaking changes, quoted changelog excerpts with links, one bullet per fixup mapping diff to changelog item, verification summary, AI disclosure).
   - Close the original Dependabot PR with the rules-shape replacement comment and label.
   - Return to `${BASE_BRANCH}`. Exit.

5. ${DRY_RUN_NOTE}

6. ${OVERRIDE_NOTE}

7. Exit.

**[1]** ONE PR per session. Do not pick up other PRs, do not chain. The orchestrator handles the next one.
**[2]** Hard constraints from @dependency-rules.md are non-negotiable: never push to `main`, never push to a Dependabot branch, never merge a Dependabot PR (the human is the gate, always), never modify `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files. If the fixup would require any of these, apply `ralphie:skip-out-of-scope` and exit.
**[3]** Cite the changelog for breaking-change fixups (Path B.3). Lockfile-regeneration replacements (Path B.2) don't need changelog citation — they document the pnpm error output and the version bumps inherited from Dependabot.
**[4]** Smallest fixup. Don't refactor adjacent code. Don't update unrelated callers. Surface drift via PR-body comments, not by widening the diff.
**[5]** Stop when surprised. If a Path B.3 test failure isn't predicted by the changelog, or you can't trace a diff line to a documented change, apply `ralphie:skip-verification-failed` and let the human take it.
**[6]** AI disclosure in the replacement PR body is required by @CONTRIBUTING.md.
**[7]** Always end on `${BASE_BRANCH}` with a clean working tree, even on skip paths.
**[8]** Nothing the loop touches gets auto-merged. Path A ends at `ralphie:ready-to-merge` (label + summary comment); Paths B.2 and B.3 end at "replacement PR open." In all cases the merge button is the maintainer's.
**[9]** For elevated-scrutiny categories (framework majors, security-sensitive, pre-1.0 → 1.0, multi-major), the burden of proof for `ready-to-merge` is higher. When in doubt between `ready-to-merge` and a skip, choose the skip — but the skip comment must surface what was already investigated, not just say "your turn."
