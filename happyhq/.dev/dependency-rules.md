# Dependency Rules

Source of truth for how the deps loop processes open Dependabot PRs and Dependabot security alerts. Both `PROMPT_dependency_triage.md` and `PROMPT_dependency_upgrade.md` load this file. Edit here, not in the prompts.

## PR queue

The queue is open PRs that are either:

- authored by `app/dependabot` (Dependabot version bumps), **or**
- on a branch matching `chore/security-*` (override PRs Ralphie opened in response to a Dependabot alert during the alert sweep — see "Alert queue" below).

…with no label starting with `ralphie:`.

Both kinds flow through Phase 1 (Rule 1 protected-paths check) and Phase 2 (verify + investigate) identically. The advisory plays the role the changelog plays — same investigation, same `ralphie:ready-to-merge` outcome when clean.

- A `ralphie:*` label is terminal — Ralphie never re-evaluates a labeled PR. The human removes the label to re-queue.
- One outcome per session (a label or a replacement PR). **Ralphie never merges. The human is the gate.**

## Alert queue

Open Dependabot **alerts** are the second input. They cover transitive vulnerabilities Dependabot won't open a PR for (the fix is a `pnpm.overrides` edit, which Dependabot doesn't author), plus direct-dep vulns where the alert arrives before the PR.

- The queue is: open alerts from `gh api repos/:owner/:repo/dependabot/alerts --paginate --jq '[.[] | select(.state=="open")]'`.
- Alerts don't carry labels. Dedup is by **GHSA/CVE ID** — if any open or recently-merged PR or issue references the advisory's `ghsa_id` or `cve_id` in title or body, the alert is already in flight; skip. (Both IDs are always cited in the override PR title and the issue body, so dedup is free.)
- The alert sweep produces either an override PR (which then enters the PR queue above) or an issue tagged `security` for human attention. **Ralphie never dismisses alerts.**

## Rules

Apply in order — bail at the earliest stop. Phase 1 (triage) decides only one thing: would the loop touch protected paths? Everything else flows to Phase 2, which does the substantive work — verify, investigate, then decide.

The loop's value is the verification + investigation work. We don't punt PRs to the human based on metadata-only categorizations (e.g., "this is a major bump, your turn"). We attempt them and produce evidence-cited verdicts. Skips at Phase 2 are reserved for cases where investigation reveals genuine concern or the work exceeds the loop's scope.

| #   | Phase   | Condition                                                                                                                                                                                                                                                                                                                            | Label applied                      | What unblocks it                                                                      |
| --- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | Triage  | PR diff would touch `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files — **except** PRs from the `dependabot/github_actions/*` branch family where the diff is limited to `uses:` line changes in workflow files (those are mechanical version pins, not authored CI edits, and are eligible for Phase 2) | `ralphie:skip-out-of-scope`        | Maintainer scopes the change; remove label                                            |
| 2   | Phase 2 | Verification clean (lint/types/test/smoke) **and** changelog investigation finds no genuine concern                                                                                                                                                                                                                                  | `ralphie:ready-to-merge`           | Maintainer reads Ralphie's summary comment, clicks merge                              |
| 3   | Phase 2 | Investigation reveals genuine concern, or impact is unclear after a real attempt (changelog flag, ownership change, ambiguous deprecation, etc.)                                                                                                                                                                                     | `ralphie:skip-needs-review`        | Maintainer reads Ralphie's investigation summary; decides to merge, replace, or close |
| 4   | Phase 2 | Upgrade requires multi-step migration that exceeds the loop's scope (framework majors with multi-major stepping, e.g., `stripe` v20 → v22; pre-1.0 → 1.0 jumps that touch a large surface)                                                                                                                                           | `ralphie:skip-manual-upgrade`      | Maintainer steps the upgrade manually; remove label                                   |
| 5   | Phase 2 | `pnpm format` / `pnpm lint` / `pnpm check-types` / `pnpm --filter=happyhq test` / `npx tsx scripts/smoke-test.ts` failed twice on causes the agent can't trace                                                                                                                                                                       | `ralphie:skip-verification-failed` | Read Ralphie's comment with cited failure output; fix locally                         |
| 6   | Phase 2 | CI on the PR is red because of issues unrelated to the version bump (infra flake, lint config drift on main, pre-existing test failure that local verification reproduces)                                                                                                                                                           | `ralphie:skip-ci-red`              | Investigate the CI failure; remove label                                              |
| 7   | Phase 2 | Fixups would exceed 10 files or 300 lines net added (`*.md`/`*.mdx` and lockfile/package.json excluded from the count)                                                                                                                                                                                                               | `ralphie:skip-too-big`             | Scope it down or do it manually                                                       |
| 8   | Phase 2 | Replacement PR shipped (breaking-change fixups path, OR lockfile-regeneration path)                                                                                                                                                                                                                                                  | `ralphie:replaced-by-newer-pr`     | Terminal — the replacement PR's body links via "Replaces #N"                          |

A PR that passes Rule 1 is **eligible** — it stays unlabeled and Phase 2 picks it up. Phase 2 takes one of two paths:

- **Path A — verify and signal.** Install + run lint/types/test/smoke. Skim the upstream changelog (or the security advisory, for `chore/security-*` PRs). Investigate flagged items by reading linked PRs/notes and grepping the repo for affected behavior. Form an evidence-cited verdict. If clean, post the summary comment and apply `ralphie:ready-to-merge`. If concerning, apply `ralphie:skip-needs-review` with what was investigated and what's still unclear. The human reads and decides.
- **Path B — fixups.** When verification fails, generate the smallest changelog-cited fixups (or, for `pnpm install`-time errors like `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, regenerate the lockfile via no-frozen install) on a fresh `chore/upgrade-<pkg>-vN` branch off `main` and open a replacement PR for human review.

Ralphie never merges. The merge button is the maintainer's. Always.

## Alert sweep outcomes

Phase 1 sweeps alerts before the PR queue. After dedup by GHSA/CVE ID, each remaining alert gets exactly one outcome:

| #   | Condition                                                                                                                              | Action                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | An open Dependabot **PR** exists for the same package and covers the patched version range                                             | Leave alone. The PR flow handles it; the alert auto-dismisses on merge.                                                                                                                                                          |
| A2  | A patched version exists (transitive or direct, no covering PR)                                                                        | Open a `chore/security-<pkg>-<short-id>` PR off `main` adding/updating `pnpm.overrides.<pkg>`, with `dependencies` + `security` labels. The PR enters the PR queue and Phase 2 verifies + investigates it like any other dep PR. |
| A3  | No patched version is available (or one exists but doesn't apply), AND advisory + repo grep confirm zero exposure to the affected APIs | Open a `security`-labeled issue recommending dismiss-as-not-vulnerable with the evidence. Maintainer dismisses in GHAS.                                                                                                          |
| A4  | Ambiguous after investigation                                                                                                          | Open a `security`-labeled issue with the advisory link, what was investigated, and what's unclear.                                                                                                                               |

The bar for A3 (recommend-dismiss) is high: the advisory itself must spell out which surfaces are vulnerable, and a repo grep must confirm zero callers. When in doubt, prefer A2 (override) if a patched version exists — an override drops the alert deterministically without requiring the human to read advisory text. Reserve A3 for the case where there is no patch.

A2 PRs follow the same hard constraints as Path B replacement PRs (off `main`, `chore/` prefix, AI-assistance disclosure). Phase 1 stops at "open the PR" — Phase 2's standard verify-and-investigate flow takes it from there in the same loop iteration.

## Elevated scrutiny in Phase 2

Some bumps are inherently more delicate. The agent's investigation needs a **higher bar** before reaching `ready-to-merge` for any of these categories:

- **Framework majors** — `next`, `react`, `react-dom`. Coordinate-the-whole-stack changes; even when tests pass, the migration may have user-visible behavior shifts (RSC semantics, hydration timing, server actions).
- **Security-sensitive runtime majors** — auth, crypto, billing primitives. `stripe`, `instantdb`, JWT/OIDC libs, anything in the request-auth or payment path. Same package can have malicious-by-mistake API removals.
- **Pre-1.0 → 1.0 jumps on runtime deps** — by definition the upstream is signaling "this is the stable shape." Even when v1.0 is API-compatible, bundle structure / ESM / module-resolution changes can affect downstream tooling.
- **Multi-major bumps** — e.g., `stripe v20 → v22` skips v21. Each major may have its own breaking changes; assess both.
- **Agent / AI SDK bumps — _any_ version delta, including patch.** `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, or any similar LLM client. The test suite doesn't observe LLM behavior — patch bumps can shift tool schemas, default model params, retry semantics, prompt caching behavior, or streaming format without breaking a single test. These packages are excluded from the npm-minor-patch group in `dependabot.yml` so they always arrive as their own PR; the loop must read the SDK's release notes thoroughly and assess what behavioral defaults shifted.

For these categories, "doesn't affect us" requires more evidence than a quick grep. Read migration guides thoroughly, check all call-sites, look for behavior tests (not just type tests). Defaulting toward `skip-needs-review` (or `skip-manual-upgrade` when the migration would clearly exceed the loop's size cap) is correct here when the investigation is anything less than thorough.

## Comment shape (skips)

Most skips use this shape:

```
Ralphie skipped this for: <rule name>

What I saw: <1–3 sentences — the specific evidence that triggered the rule>

What would unblock it: <1 sentence — concrete action for the human>
```

## Comment shape (Path A success — `ready-to-merge`)

The `Investigation` section is **required, with a line for each of the five audit items, even when every item is null** — it's an audit trail proving the agent considered each. A "no" is signal too. For flagged items, add sub-bullets with depth (what was checked, what was found).

```
Ralphie verified this — ready to merge.

### Verification
- lint: ✓
- check-types: ✓
- test: ✓ (<N> tests)
- smoke: ✓

### Changelog highlights
- <bullet 1>
- <bullet 2>
- (link to upstream release notes)

### Investigation
- Ownership: <"same maintainer (@<handle>)" or "ownership change — investigated → <verdict>">
- Auth/secrets: <"none" or "<change> — investigated → <verdict, with link>">
  - <optional sub-bullet — what was checked / found, when there's depth>
- Security advisory: <"none referenced" or "<advisory> — investigated → <verdict>">
- Deprecations: <"none we'd hit" or "<deprecation> — investigated → <verdict>">
- Breaking API: <"none" or "<change> — investigated → <verdict>">

### Recommendation
<one or two sentences — why this looks safe to merge for our usage>
```

## Comment shape (Path A skip — `skip-needs-review`, `skip-manual-upgrade`, `skip-ci-red`)

Used when investigation reveals genuine concern, the migration exceeds loop scope, or CI is red for reasons unrelated to the bump. Surfaces the work already done.

```
Ralphie skipped this for: <rule name>

What I saw: <1–2 sentences — the changelog item, scope assessment, or CI failure that triggered the skip, with link/output>

What I investigated: <2–4 bullets — the specific code/workflows/configs/logs you checked, and what you found>

What's still unclear: <1–2 sentences — why the human needs to weigh in: ambiguous impact, multi-major step required, pre-existing main breakage, etc.>

What would unblock it: <1 sentence — concrete action for the maintainer>
```

## Comment shape (replacement, posted on the original Dependabot PR)

```
Ralphie replaced this with #<new>.

Why: <one sentence — what breaking change(s) or lockfile issue the bump required fixups for>

Changelog: <link, when applicable>

Replacement: <link to new PR>
```

## PR shape (alert sweep override — rule A2)

The override PR enters the standard PR queue, so its body should be the kind of thing Phase 2 expects to read. Cite the advisory like a changelog. Title: `chore(deps): override <pkg> to <patched-version>+ (<CVE or GHSA ID>)`.

```
## Summary

- Adds/updates `pnpm.overrides.<pkg>` to `^<patched-version>` to clear Dependabot alert #<N> ([advisory link]).
- Path into the tree: <output of `pnpm why <pkg> -r`, fenced>.
- Exposure: <one paragraph — do we call the affected APIs? Cite the advisory's affected-surfaces list and any repo grep results.>

## Test plan

- [x] `pnpm install` succeeds; lockfile updated
- [x] `pnpm why <pkg>` reports a version satisfying the patch
- [ ] CI green

<AI-assistance disclosure paragraph per CONTRIBUTING.md>
```

## Issue shape (alert dismiss-recommendation — rule A3)

Title: `security: recommend dismissing alert #<N> as not vulnerable (<CVE or GHSA ID>)`. Label: `security`.

```
Advisory: <link to GHSA page>

Why dismissal is appropriate:
- <bullet — what the advisory itself states about the vulnerable surfaces>
- <bullet — repo grep results showing we don't call those APIs>
- <bullet — any other relevant context (e.g., advisory's own dependent-analysis findings)>

Suggested GHAS dismissal reason: "Vulnerable code is not actually used."
```

## Issue shape (alert needs-review — rule A4)

Title: `security: alert #<N> needs review (<CVE or GHSA ID>)`. Label: `security`.

```
Advisory: <link to GHSA page>

What I investigated:
- <bullet — code/configs grepped, what was found>
- <bullet — advisory items checked>

What's unclear: <1–2 sentences — why this needs human judgment.>
```

## Hard constraints (never violate)

- Never push to `main`. Never force-push. Never `--no-verify`.
- Never modify files under `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files. If the fixup would require any of these, apply `ralphie:skip-out-of-scope` and exit.
- Never push to a Dependabot branch. Replacement work happens on a fresh `chore/upgrade-<pkg>-v<N>` branch off `main`.
- Replacement PRs target `main`, use the `chore/` prefix, and include `Replaces #<original>` plus an AI-assistance disclosure (per `CONTRIBUTING.md`).
- Never merge a Dependabot PR. The loop's job ends at `ralphie:ready-to-merge` (label + summary comment); the human clicks merge.
- One outcome per session. After labeling or opening a replacement, exit.

## Principles

These are guidance, not gates. The rules above are pass/fail; these tune _how_ allowed work gets done.

**Cite the changelog.** Every replacement PR description must link to the upstream release notes / migration guide and quote the relevant breaking-change item(s) — except for lockfile-regeneration replacements, which document the pnpm error output and the no-frozen-install diff instead. For breaking-change fixups, the reviewer should be able to trace each diff line back to a documented change. If the changelog doesn't mention something the fixup is reacting to, that's a signal to stop and skip with `ralphie:skip-verification-failed`.

**Smallest fixup that compiles + passes tests + smoke-tests clean.** Don't refactor adjacent code. Don't take on tech-debt cleanup. Don't update unrelated callers. Surface drift via comments in the PR body, not by widening the diff.

**Stop when surprised.** If a test failure isn't predicted by the changelog, or you can't trace a diff line to a documented change, apply `ralphie:skip-verification-failed` with the failure output included. Don't speculate — the human takes it from there.

**Look around.** Before writing a fixup, search for prior usage of the changed APIs across the repo. Most "we keep fixing this" pain comes from rederiving in isolation when a reference exists.

**The human is the gate, always.** Ralphie never merges — not Dependabot's PRs, not replacement PRs. Path A's job is "verify, summarize, label `ready-to-merge`." Path B's job is "open a replacement PR with the breaking-change fixups (or regenerated lockfile) documented." In both cases the merge button is the maintainer's. The loop's value is the verification work and the documentation, not the merge click.

**Skim the changelog even when verification is clean, then investigate before deciding.** Green CI doesn't catch supply-chain risk (maintainer compromise, ownership change, hostile release). It doesn't catch behavior changes that won't bite until production load. A 60-second changelog skim catches a lot of that at near-zero cost.

**The skim is a trigger to investigate, not a trigger to bail.** When the skim flags something — ownership change, secrets/auth handling refactor, security advisory, deprecation, breaking API change — read the linked PR/migration note, search the repo for usage of the affected behavior, and form a concrete impact verdict. The loop's value is the work; punting every flagged change to the human just shifts the same investigation onto them. Skip with `ralphie:skip-needs-review` only when the investigation reveals genuine concern or the impact is unclear after a real attempt — not as a default response to flagged keywords.

**Lockfile-time errors are regenerable, not failures — but preserve Dependabot's intent.** When `pnpm install --frozen-lockfile` fails with `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`, `ERR_PNPM_OUTDATED_LOCKFILE`, or similar tooling-state mismatches, that's a deterministic re-resolution — not a behavioral change. Run `pnpm install` (no frozen) to regenerate the lockfile, then proceed to verification. If verification is clean, open a replacement PR with the regenerated lockfile.

**But** Dependabot's PR may carry intent that simple regeneration discards. Three sub-shapes require different recipes (see Path B.2 in the upgrade prompt):

- **B.2.a — package.json + lockfile bumps (typical):** take both files from Dependabot's branch, re-run `pnpm install`.
- **B.2.b — lockfile-only bumps (transitive):** take Dependabot's lockfile directly (`git checkout <dep-branch> -- pnpm-lock.yaml`), verify with `pnpm install --frozen-lockfile`. Don't re-resolve from current package.json — it'll reset the transitive bumps Dependabot intended.
- **B.2.c — override-floor bump in lockfile (Dependabot raised `pnpm.overrides` snapshot but didn't update `package.json`):** read the lockfile diff to find the new floor, manually update `package.json`'s `pnpm.overrides.<pkg>` to match, then regenerate. Simply regenerating from current package.json silently undoes the floor and weakens security.

The general principle: **the regenerated lockfile is the fix for tooling-state mismatch; package.json edits are the fix for tooling-intent loss.** Both can apply in the same PR.

## Tuning signal

When the loop gets it wrong — labels something `skip-manual-upgrade` that wasn't, opens a replacement PR with bad fixups, misses a protected-path edit — that's a rule-tuning signal, not a one-off correction. Edit this file. The next run will pick up the change.
