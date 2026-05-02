# Dependency Rules

Source of truth for how the deps loop processes open Dependabot PRs. Both `PROMPT_dependency_triage.md` and `PROMPT_dependency_upgrade.md` load this file. Edit here, not in the prompts.

## Queue contract

- The queue is: open PRs authored by `app/dependabot` with no label starting with `ralphie:`.
- A `ralphie:*` label is terminal — Ralphie never re-evaluates a labeled PR. The human removes the label to re-queue.
- One outcome per session (a label or a replacement PR). **Ralphie never merges. The human is the gate.**

## Rules

Apply in order — bail at the earliest stop. The first three are evaluable from the PR text alone (Phase 1 — triage). The last five only show up after attempting an upgrade (Phase 2).

| #   | Condition                                                                                                                                                                                                                                                                                                                            | Label applied                      | What unblocks it                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | PR diff would touch `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files — **except** PRs from the `dependabot/github_actions/*` branch family where the diff is limited to `uses:` line changes in workflow files (those are mechanical version pins, not authored CI edits, and are eligible for Phase 2) | `ralphie:skip-out-of-scope`        | Maintainer scopes the change; remove label                                            |
| 2   | CI on the PR is red and the failure is unrelated to the version bump (infra flake, lint config drift, network timeout, etc.)                                                                                                                                                                                                         | `ralphie:skip-ci-red`              | Investigate the CI failure; remove label                                              |
| 3   | Update is one of: framework major (`next`, `react`, `react-dom`); security-sensitive runtime major (auth, crypto, billing — e.g., `stripe` ≥2 majors at once, `instantdb`, JWT/OIDC libs); pre-1.0 → 1.0 jump on a runtime dep                                                                                                       | `ralphie:skip-manual-upgrade`      | Maintainer upgrades and reviews; remove label                                         |
| 4   | (Phase 2) Verification clean (lint/types/test/smoke) **and** changelog skim reveals nothing concerning                                                                                                                                                                                                                               | `ralphie:ready-to-merge`           | Maintainer reads Ralphie's summary comment, clicks merge                              |
| 5   | (Phase 2) Changelog skim flags an item AND impact investigation reveals genuine concern for our codebase (or impact is unclear after investigation)                                                                                                                                                                                  | `ralphie:skip-needs-review`        | Maintainer reads Ralphie's investigation summary; decides to merge, replace, or close |
| 6   | (Phase 2) `pnpm format` / `pnpm lint` / `pnpm check-types` / `pnpm --filter=happyhq test` / `npx tsx scripts/smoke-test.ts` failed twice                                                                                                                                                                                             | `ralphie:skip-verification-failed` | Read Ralphie's comment; fix locally                                                   |
| 7   | (Phase 2) Fixups would exceed 10 files or 300 lines net added (`*.md`/`*.mdx` and lockfile/package.json excluded from the count)                                                                                                                                                                                                     | `ralphie:skip-too-big`             | Scope it down or do it manually                                                       |
| 8   | (Phase 2) Replacement PR shipped (breaking-change fixups path)                                                                                                                                                                                                                                                                       | `ralphie:replaced-by-#<new>`       | Terminal — the linked replacement PR closes the loop                                  |

A PR that passes rules 1–3 is **eligible** — it stays unlabeled and Phase 2 picks it up. Phase 2 takes one of two paths:

- **Path A — verify and signal.** Install + run lint/types/test/smoke. If clean, skim the upstream changelog. If the changelog is also clean, post a verification + changelog summary comment and apply `ralphie:ready-to-merge`. The human reads the comment and decides whether to click merge.
- **Path B — fixups.** When verification fails because of a breaking change, generate the smallest changelog-cited fixups on a fresh `chore/upgrade-<pkg>-vN` branch off `main` and open a replacement PR for human review.

Ralphie never merges. The merge button is the maintainer's. Always.

## Comment shape (skips)

Every skip writes one comment, in this shape:

```
Ralphie skipped this for: <rule name>

What I saw: <1–3 sentences — the specific evidence that triggered the rule>

What would unblock it: <1 sentence — concrete action for the human>
```

## Comment shape (Path A success — `ready-to-merge`)

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
(Include this section only if the changelog skim flagged anything. Otherwise omit.)
- Flag: <e.g., "credential-persistence refactor at <link>">
- What I checked: <e.g., "grep'd ci.yml and codeql.yml for any step depending on persisted git creds; none">
- Verdict: <one sentence — why the flag doesn't bite us>

### Recommendation
<one or two sentences — why this looks safe to merge for our usage>
```

## Comment shape (Path A skip — `skip-needs-review`)

Used when investigation reveals genuine concern or unclear impact. Goes beyond the generic skip shape to surface the work already done.

```
Ralphie skipped this for: needs-review

What I saw: <1–2 sentences — the changelog item that triggered investigation, with link>

What I investigated: <2–4 bullets — the specific code/workflows/configs you checked, and what you found>

What's still unclear: <1–2 sentences — why the human needs to weigh in: ambiguous impact, ownership change risk, deprecation timeline, etc.>

What would unblock it: <1 sentence — concrete action for the maintainer>
```

## Comment shape (replacement, posted on the original Dependabot PR)

```
Ralphie replaced this with #<new>.

Why: <one sentence — what breaking change(s) the bump required fixups for>

Changelog: <link>

Replacement: <link to new PR>
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

**Cite the changelog.** Every replacement PR description must link to the upstream release notes / migration guide and quote the relevant breaking-change item(s). The reviewer should be able to trace each diff line back to a documented change. If the changelog doesn't mention something the fixup is reacting to, that's a signal to stop and skip with `ralphie:skip-verification-failed`.

**Smallest fixup that compiles + passes tests + smoke-tests clean.** Don't refactor adjacent code. Don't take on tech-debt cleanup. Don't update unrelated callers. Surface drift via comments in the PR body, not by widening the diff.

**Stop when surprised.** If a test failure isn't predicted by the changelog, or you can't trace a diff line to a documented change, apply `ralphie:skip-verification-failed` with the failure output included. Don't speculate — the human takes it from there.

**Look around.** Before writing a fixup, search for prior usage of the changed APIs across the repo. Most "we keep fixing this" pain comes from rederiving in isolation when a reference exists.

**The human is the gate, always.** Ralphie never merges — not Dependabot's PRs, not replacement PRs. Path A's job is "verify, summarize, label `ready-to-merge`." Path B's job is "open a replacement PR with the breaking-change fixups documented." In both cases the merge button is the maintainer's. The loop's value is the verification work and the documentation, not the merge click.

**Skim the changelog even when verification is clean, then investigate before deciding.** Green CI doesn't catch supply-chain risk (maintainer compromise, ownership change, hostile release). It doesn't catch behavior changes that won't bite until production load. A 60-second changelog skim catches a lot of that at near-zero cost.

**But the skim is a trigger to investigate, not a trigger to bail.** When the skim flags something — ownership change, secrets/auth handling refactor, security advisory, deprecation, breaking API change — read the linked PR/migration note, search the repo for usage of the affected behavior, and form a concrete impact verdict. The loop's value is the work; punting every flagged change to the human just shifts the same investigation onto them. Skip with `ralphie:skip-needs-review` only when the investigation reveals genuine concern or the impact is unclear after a real attempt — not as a default response to flagged keywords.

Concrete shape: changelog mentions a credential-storage refactor → grep workflows for steps that depend on credential storage location → if no consumer, comment the impact assessment and recommend merge; if there's a consumer and the change is benign, same; if there's a consumer and the impact is ambiguous, skip with the specific concern.

## Tuning signal

When the loop gets it wrong — labels something `skip-manual-upgrade` that wasn't, opens a replacement PR with bad fixups, misses a protected-path edit — that's a rule-tuning signal, not a one-off correction. Edit this file. The next run will pick up the change.
