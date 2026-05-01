# Dependency Rules

Source of truth for how the deps loop processes open Dependabot PRs. Both `PROMPT_dependency_triage.md` and `PROMPT_dependency_upgrade.md` load this file. Edit here, not in the prompts.

## Queue contract

- The queue is: open PRs authored by `app/dependabot` with no label starting with `ralphie:`.
- A `ralphie:*` label is terminal for that phase: triage labels mark the PR as classified; Phase 2 advances tier-labeled PRs to a final state (merged, replaced, or skip).
- One outcome per session.

## Triage tiers (Phase 1)

Apply in order — first match wins. Bail at the earliest stop.

| #   | Condition                                                                                                                                                    | Label applied               | Phase 2 picks up?       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------- |
| 1   | PR diff would touch `happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, or licensing files                                                            | `ralphie:skip-out-of-scope` | No — human only         |
| 2   | CI on the PR is red and the failure is unrelated to the version bump (infra flake, lint config drift, network timeout, etc.)                                 | `ralphie:skip-ci-red`       | No — human investigates |
| 3   | Update is a major bump on a framework runtime (`next`, `react`, `react-dom`) — should have been ignored upstream by `dependabot.yml` but slipped through     | `ralphie:tier-3-manual`     | No — human upgrades     |
| 4   | Update is a major bump on a security-sensitive runtime dep (auth, crypto, billing primitives — e.g., `stripe` ≥2 majors at once, `instantdb`, JWT/OIDC libs) | `ralphie:tier-3-manual`     | No                      |
| 5   | Update is a pre-1.0 → 1.0 jump on a runtime dep (`dependencies`, not `devDependencies`)                                                                      | `ralphie:tier-3-manual`     | No                      |
| 6   | Update is a major bump on a runtime dep (single-major, in `dependencies`) where the changelog identifies discrete breaking changes                           | `ralphie:tier-2-adapt`      | Yes — attempts fixups   |
| 7   | Update is a major bump on a dev/types/tooling dep (`@types/*`, dev-only ESLint plugins, etc.)                                                                | `ralphie:tier-1-safe`       | Yes — verify and merge  |
| 8   | Update is from an official-publisher GitHub Action (`actions/*`, `github/*`, `pnpm/*`, `docker/*`) with no input renames in the changelog                    | `ralphie:tier-1-safe`       | Yes                     |
| 9   | Update is a minor/patch group PR with green CI                                                                                                               | `ralphie:tier-1-safe`       | Yes                     |
| 10  | Anything else                                                                                                                                                | `ralphie:tier-2-adapt`      | Yes — best-effort       |

When the rules are ambiguous about a PR's tier, lean toward the higher tier (more human review). False tier-3 is cheaper than false tier-1.

## Phase 2 outcomes

| Condition                                                                                                                                                        | Final state                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Install + verify (`lint`, `check-types`, `test`) + smoke clean → merge Dependabot PR as-is                                                                       | PR merged; `ralphie:merged`                       |
| Tier 2: verification fails. Breaking changes cited from changelog, fixups applied from a fresh `chore/upgrade-<pkg>-vN` branch off `main`, replacement PR opened | Original closed; `ralphie:replaced-by-#<new>`     |
| Tier 2: fixups would exceed 10 files / 300 lines net added (`*.md`/`*.mdx` and lockfile/package.json excluded from the count)                                    | `ralphie:skip-too-big` on original PR             |
| Verification (`pnpm format` / `lint` / `check-types` / `--filter=happyhq test` / `scripts/smoke-test.ts`) failed twice                                           | `ralphie:skip-verification-failed` on original PR |
| Fixups would touch protected paths (`happyhq/ee/`, `.github/`, CI workflows, `dependabot.yml`, licensing)                                                        | `ralphie:skip-out-of-scope` on original PR        |

## Comment shape (skips)

```
Ralphie skipped this for: <rule name>

What I saw: <1–3 sentences — the specific evidence that triggered the rule>

What would unblock it: <1 sentence — concrete action for the human>
```

## Comment shape (tier classifications, posted in triage)

```
Ralphie classified this as: <tier name>

Update: <package> <from> → <to> (<dep type: runtime / dev / types / actions>, <semver category: major / minor / patch / group>)

Changelog highlights: <2–4 bullets from the upstream changelog with links — only if relevant to behavior>

Plan: <one sentence — what Phase 2 will do, or what the human should do for tier-3>
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

These tune _how_ allowed work gets done.

**Cite the changelog.** Every Tier 2 fixup PR description must link to the upstream release notes / migration guide and quote the relevant breaking-change item(s). The reviewer should be able to trace each diff line back to a documented change. If the changelog doesn't mention something the fixup is reacting to, that's a signal to stop and skip.

**Smallest fixup that compiles + passes tests + smoke-tests clean.** Don't refactor adjacent code. Don't take on tech-debt cleanup. Don't update unrelated callers. Surface drift via comments in the PR body, not by widening the diff.

**Stop when surprised.** If a test failure isn't predicted by the changelog, or you can't trace a diff line to a documented change, apply `ralphie:skip-verification-failed` with the failure output included. Don't speculate — the human takes it from there.

**Look around.** Before writing a fixup, search for prior usage of the changed APIs across the repo. Most "we keep fixing this" pain comes from rederiving in isolation when a reference exists.

**The PR is the gate.** Replacement PRs go to `main` for human review — they are not auto-merged. The loop's job is to put a complete, well-documented upgrade in front of the maintainer; the maintainer's job is to click merge.

## Tuning signal

When the loop gets it wrong — labels something `tier-1-safe` that should have been `tier-3-manual`, opens a replacement PR with bad fixups, misses a protected-path edit — that's a rule-tuning signal, not a one-off correction. Edit this file. The next run will pick up the change.
