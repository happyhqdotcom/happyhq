# Bug Rubric

Source of truth for how Ralphie judges open `bug`-labeled issues. Both `PROMPT_bugs_triage.md` and `PROMPT_bugs_fix.md` load this file. Edit here, not in the prompts.

## Queue contract

- The queue is: GitHub issues that are `state:open`, labeled `bug`, and have no label starting with `ralphie:`.
- A `ralphie:*` label is terminal — Ralphie never re-evaluates a labeled issue. The human removes the label to re-queue.
- One outcome per session (a label, a comment, or a PR). No chaining.

## Rubric

Apply in order — bail at the earliest stop. The first six are evaluable from the issue text alone (Phase 1 — triage). The last three only show up after attempting a fix (Phase 2).

| #   | Condition                                                                                              | Label applied                      | What unblocks it                                                      |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------------------- |
| 1   | Fix would touch `happyhq/ee/`                                                                          | `ralphie:skip-ee`                  | Maintainer decides whether to take it on; remove label after deciding |
| 2   | Author is not OWNER/MEMBER and the report lacks repro details a third party would need to provide      | `ralphie:skip-third-party-unclear` | Add repro details or escalate; remove label                           |
| 3   | Issue body or comments contain unresolved questions for the maintainer                                 | `ralphie:skip-needs-decision`      | Answer the question in a comment, remove label                        |
| 4   | Requires a schema migration, new env var, new dependency, or `.github/`/CI/workflow change             | `ralphie:skip-out-of-scope`        | Maintainer scopes and does it; remove label if the work was decoupled |
| 5   | No reasonable repro can be inferred from issue + linked logs                                           | `ralphie:skip-not-reproducible`    | Reporter or maintainer adds repro/logs, remove label                  |
| 6   | Estimated >10 files or >300 LoC after a quick code search                                              | `ralphie:skip-too-big`             | Scope it down (split issue) or do it manually                         |
| 7   | (Phase 2) Repro could not be established locally                                                       | `ralphie:skip-not-reproducible`    | Same as #5                                                            |
| 8   | (Phase 2) `pnpm format` / `pnpm lint` / `pnpm check-types` / `pnpm --filter=happyhq test` failed twice | `ralphie:skip-verification-failed` | Read the comment Ralphie left; fix locally                            |
| 9   | (Phase 2) Fix shipped                                                                                  | `ralphie:fixed-in-pr`              | Terminal — the linked PR closes the loop                              |

## Comment shape (for skips)

Every skip writes one comment, in this shape:

```
Ralphie skipped this for: <rubric reason name>

What I saw: <1–3 sentences — the specific evidence in the issue/code that triggered the rule>

What would unblock it: <1 sentence — the concrete action that lets the next Ralphie run pick this up>
```

Comments are for the human reading the queue. The label is for the next Ralphie.

## Hard constraints (never violate, regardless of rubric)

- Never push to `main`. Never force-push. Never `--no-verify`.
- Never modify files under `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what a focused fix demands), or licensing files.
- PRs always target `main`, branch from `main`, use the `fix/` prefix, and include `Closes #<issue>` plus an AI-assistance disclosure (per `CONTRIBUTING.md`).
- One outcome per session. After labeling or opening a PR, exit.

## Tuning signal

When Ralphie gets it wrong — labels something `skip-too-big` that wasn't, opens a PR that shouldn't have been opened, misses an `ee/` touch — that's a rubric-tuning signal, not a one-off correction. Edit this file. The next run will pick up the change.
