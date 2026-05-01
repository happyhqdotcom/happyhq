# Dependency Rules

Source of truth for how the deps loop processes open Dependabot PRs. Both `PROMPT_dependency_triage.md` and `PROMPT_dependency_upgrade.md` load this file. Edit here, not in the prompts.

## Queue contract

- The queue is: open PRs authored by `app/dependabot` with no label starting with `ralphie:`.
- A `ralphie:*` label is terminal — Ralphie never re-evaluates a labeled PR. The human removes the label to re-queue.
- One outcome per session (a label, a merge, or a replacement PR).

## Rules

Apply in order — bail at the earliest stop. The first three are evaluable from the PR text alone (Phase 1 — triage). The last three only show up after attempting an upgrade (Phase 2).

| #   | Condition                                                                                                                                                                                                                      | Label applied                      | What unblocks it                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------- |
| 1   | PR diff would touch `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files                                                                                                                              | `ralphie:skip-out-of-scope`        | Maintainer scopes the change; remove label           |
| 2   | CI on the PR is red and the failure is unrelated to the version bump (infra flake, lint config drift, network timeout, etc.)                                                                                                   | `ralphie:skip-ci-red`              | Investigate the CI failure; remove label             |
| 3   | Update is one of: framework major (`next`, `react`, `react-dom`); security-sensitive runtime major (auth, crypto, billing — e.g., `stripe` ≥2 majors at once, `instantdb`, JWT/OIDC libs); pre-1.0 → 1.0 jump on a runtime dep | `ralphie:skip-manual-upgrade`      | Maintainer upgrades and reviews; remove label        |
| 4   | (Phase 2) Fixups would exceed 10 files or 300 lines net added (`*.md`/`*.mdx` and lockfile/package.json excluded from the count)                                                                                               | `ralphie:skip-too-big`             | Scope it down or do it manually                      |
| 5   | (Phase 2) `pnpm format` / `pnpm lint` / `pnpm check-types` / `pnpm --filter=happyhq test` / `npx tsx scripts/smoke-test.ts` failed twice                                                                                       | `ralphie:skip-verification-failed` | Read Ralphie's comment; fix locally                  |
| 6   | (Phase 2) Replacement PR shipped (Tier 2 / breaking-change fixups path)                                                                                                                                                        | `ralphie:replaced-by-#<new>`       | Terminal — the linked replacement PR closes the loop |

A PR that passes rules 1–3 is **eligible** — it stays unlabeled and Phase 2 picks it up. Phase 2 either merges Dependabot's PR as-is (Path A — install + verify clean) or, when the bump introduces breaking changes that prevent verification, generates the smallest changelog-cited fixups on a fresh `chore/upgrade-<pkg>-vN` branch off `main` and opens a replacement PR for human review (Path B).

## Comment shape (skips)

Every skip writes one comment, in this shape:

```
Ralphie skipped this for: <rule name>

What I saw: <1–3 sentences — the specific evidence that triggered the rule>

What would unblock it: <1 sentence — concrete action for the human>
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
- One outcome per session. After labeling, merging, or opening a replacement, exit.

## Principles

These are guidance, not gates. The rules above are pass/fail; these tune _how_ allowed work gets done.

**Cite the changelog.** Every replacement PR description must link to the upstream release notes / migration guide and quote the relevant breaking-change item(s). The reviewer should be able to trace each diff line back to a documented change. If the changelog doesn't mention something the fixup is reacting to, that's a signal to stop and skip with `ralphie:skip-verification-failed`.

**Smallest fixup that compiles + passes tests + smoke-tests clean.** Don't refactor adjacent code. Don't take on tech-debt cleanup. Don't update unrelated callers. Surface drift via comments in the PR body, not by widening the diff.

**Stop when surprised.** If a test failure isn't predicted by the changelog, or you can't trace a diff line to a documented change, apply `ralphie:skip-verification-failed` with the failure output included. Don't speculate — the human takes it from there.

**Look around.** Before writing a fixup, search for prior usage of the changed APIs across the repo. Most "we keep fixing this" pain comes from rederiving in isolation when a reference exists.

**The PR is the gate.** Replacement PRs go to `main` for human review — they are not auto-merged. The loop's job is to put a complete, well-documented upgrade in front of the maintainer; the maintainer's job is to click merge.

## Tuning signal

When the loop gets it wrong — labels something `skip-manual-upgrade` that wasn't, opens a replacement PR with bad fixups, misses a protected-path edit — that's a rule-tuning signal, not a one-off correction. Edit this file. The next run will pick up the change.
