# Bug Rubric

Source of truth for how Ralphie judges open `bug`-labeled issues. Both `PROMPT_bugs_triage.md` and `PROMPT_bugs_fix.md` load this file. Edit here, not in the prompts.

## Queue contract

- The queue is: GitHub issues that are `state:open`, labeled `bug`, and have no label starting with `ralphie:`.
- A `ralphie:*` label is terminal — Ralphie never re-evaluates a labeled issue. The human removes the label to re-queue.
- One outcome per session (a label, a comment, a PR, or a rephrased child issue). No chaining.

## What this rubric is not

A bug report is the user's best guess at what's wrong and where. It is **not** a script to execute. The fix session reproduces the report, reads the code path, traces symptom to cause, and forms its own opinion. Sometimes the report is right; sometimes the report describes a real symptom but the user's hypothesis about the cause is wrong (the actual fix lives somewhere else); sometimes the report describes intentional behavior the user has mistaken for a bug. When the loop disagrees with the framing, it doesn't ship a wrong-shape fix — it files a rephrased issue with the correct framing and exits via `ralphie:skip-needs-rescope`. This rubric encodes the gates around that engineering judgment, not a substitute for it.

## Rubric

Apply in order — bail at the earliest stop. The first six are evaluable from the issue text alone (Phase 1 — triage). The rest only show up after attempting a fix (Phase 2).

| #   | Condition                                                                                                                                                                                                                            | Label applied                      | What unblocks it                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Fix would touch `happyhq/ee/`                                                                                                                                                                                                        | `ralphie:skip-ee`                  | Maintainer decides whether to take it on; remove label after deciding                                                                                |
| 2   | Author is not OWNER/MEMBER and the report lacks repro details a third party would need to provide                                                                                                                                    | `ralphie:skip-third-party-unclear` | Add repro details or escalate; remove label                                                                                                          |
| 3   | Issue body or comments contain unresolved questions for the maintainer                                                                                                                                                               | `ralphie:skip-needs-decision`      | Answer the question in a comment, remove label                                                                                                       |
| 4   | Requires a schema migration, new env var, new dependency, or `.github/`/CI/workflow change                                                                                                                                           | `ralphie:skip-out-of-scope`        | Maintainer scopes and does it; remove label if the work was decoupled                                                                                |
| 5   | No reasonable repro can be inferred from issue + linked logs                                                                                                                                                                         | `ralphie:skip-not-reproducible`    | Reporter or maintainer adds repro/logs, remove label                                                                                                 |
| 6   | Estimated >10 files or >300 LoC after a quick code search (excludes `*.md`/`*.mdx` — spec/doc updates don't count toward the cap)                                                                                                    | `ralphie:skip-too-big`             | Scope it down (split issue) or do it manually                                                                                                        |
| 7   | (Phase 2) Repro could not be established locally                                                                                                                                                                                     | `ralphie:skip-not-reproducible`    | Same as #5                                                                                                                                           |
| 8   | (Phase 2) After reading the code: the framing is wrong (the symptom has a different cause than the report assumes; or the described behavior is intentional, not a bug). Loop files a rephrased child issue with the correct framing | `ralphie:skip-needs-rescope`       | Maintainer reviews the child issue; if the rephrasing is right the queue picks it up next iteration; if wrong, close the child and remove this label |
| 9   | (Phase 2) `pnpm format` / `pnpm lint` / `pnpm check-types` / `pnpm --filter=happyhq test` failed twice                                                                                                                               | `ralphie:skip-verification-failed` | Read the comment Ralphie left; fix locally                                                                                                           |
| 10  | (Phase 2) Risk gate trips (see "Risk gate" below): diff is over threshold AND high-risk                                                                                                                                              | `ralphie:split-into-children`      | Children land — when all close, parent closes too                                                                                                    |
| 11  | (Phase 2) Fix shipped (under threshold, OR over threshold but low-risk and noted in PR body)                                                                                                                                         | `ralphie:fixed-in-pr`              | Terminal — the linked PR closes the loop                                                                                                             |

## Risk gate (replaces the post-fix "too-big" cap)

Size is a proxy for **review risk**, and the proxy is wrong in both directions: a 12-file mechanical fix is lower risk than a 30-line edit in `lib/run/loop.server.ts`. Phase 1 rule 6's pre-engagement size estimate stays as a coarse "is this clearly enormous" pre-screen — but post-fix, with the actual diff in hand, the gate assesses risk explicitly.

**Threshold:** more than 10 files changed OR more than 300 net lines added, excluding `*.md` and `*.mdx`.

**Low risk** (proceed even if over threshold):

- Change is mechanical: rename, codemod-shaped, uniform fix applied across many sites.
- Touched files have test coverage that exercises the change, OR the change is provably behavior-preserving.
- No runtime behavior change, OR the change is the explicit goal and tests pin it.
- Files cluster outside critical surfaces.

**High risk** (do not ship as one PR):

- Touches critical surfaces: `lib/run/`, `lib/database/`, `lib/fs/`, `lib/actions.ts`, server actions, agent orchestration, auth, billing.
- Mixes unrelated concerns (refactor + behavior fix; multiple separable bugs collapsed into one PR).
- Behavior change without test coverage that pins it.
- Per-site decisions diverge meaningfully and warrant separate review.

**Decision tree** (applied post-fix, with the actual diff in hand):

1. Diff under threshold → ship.
2. Diff over threshold AND low risk → ship; add a "Why this is over threshold but low risk" section to the PR body with a one-paragraph rationale.
3. Diff over threshold AND high risk → split (Path B below). Do not push the over-size PR.

## Split path (Path B)

When the risk gate trips, the loop creates child bug issues instead of one giant PR. The split itself is a low-risk action: only GitHub metadata writes, no code.

1. **Identify the split axis** from the diff. For most bugs the axis is "fix the immediate symptom" vs "fix the underlying cause" (when the cause refactor is bigger than the bug warrants), or "fix per surface" (when one bug shows up in multiple unrelated places that warrant separate reviews).
2. **For each child group:** `gh issue create --label bug --title "<parent title> — <axis slice>" --body "..."`. Body must include `Split from #<parent>.`, the scope of this child, and the reproduction steps narrowed to that scope.
3. **Comment on parent** listing the children: "Split into #X, #Y by <axis>. This parent stays open until all children close."
4. **Apply `ralphie:split-into-children` to parent.**
5. **Revert the working branch.** Push nothing. Exit. Next loop iteration picks up the children naturally.

## Rescope path (rule 8)

When the loop reads the code and concludes the bug's framing is wrong — either the symptom has a different cause than the report assumes, or the described behavior is intentional and not a bug — the loop **files a rephrased child issue** rather than just commenting and skipping. The rephrasing is the loop's value-add: it converts a misframed report into a workable issue.

1. Open a new bug issue: `gh issue create --label bug --title "<rephrased title>" --body "..."`. Body must include:
   - `Rephrased from #<original>` with link.
   - **What the report described:** quote the symptom from the original.
   - **What the loop saw:** file:line evidence for the actual cause (or evidence that the behavior is intentional).
   - **Why the framings differ:** one paragraph mapping the user's hypothesis to the loop's reading.
   - **Suggested fix** (if applicable): 2–3 bullets — the smallest change that would address the actual cause.
2. **Comment on original** with link to the new issue and a clear undo path: "Filed #<new> with what I think is the correct framing. If I got this wrong, close #<new> and remove the `ralphie:skip-needs-rescope` label here to put this back in the queue."
3. **Apply `ralphie:skip-needs-rescope` to original.** Revert any working branch. Exit.

If the original is purely "this isn't a bug, it's intentional," the new issue is optional — sometimes the right outcome is just the comment + label. Use judgment: if there's a real underlying concern worth tracking, file the rephrased issue; if the report is just wrong, comment-and-skip is enough.

## Comment shape (for skips)

Every skip writes one comment, in this shape:

```
Ralphie skipped this for: <rubric reason name>

What I saw: <1–3 sentences — the specific evidence in the issue/code that triggered the rule>

What would unblock it: <1 sentence — the concrete action that lets the next Ralphie run pick this up>
```

For `ralphie:skip-needs-rescope`, the comment additionally links to the new (rephrased) issue. See "Rescope path" above.

For `ralphie:split-into-children`, the parent comment lists the children instead of following this shape — see "Split path".

Comments are for the human reading the queue. The label is for the next Ralphie.

## Hard constraints (never violate, regardless of rubric)

- Never push to `main`. Never force-push. Never `--no-verify`.
- Never modify files under `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what a focused fix demands), or licensing files.
- PRs always target `main`, branch from `main`, use the `fix/` prefix, and include `Closes #<issue>` plus an AI-assistance disclosure (per `CONTRIBUTING.md`).
- One outcome per session. After labeling, opening a PR, splitting into children, or filing a rephrased child issue, exit.

## Principles

These are guidance, not gates. The rubric above is pass/fail; these tune _how_ the allowed work gets done.

**Look around before you write.** Before drafting a fix or skip, scan for prior art on the concern: existing consumers/handlers of the same data shape, recent open/closed issues with the same shape, in-flight PRs touching the same surface, specs documenting the affected behavior. Anchor the work to what's already there. Most "we keep fixing this" pain comes from rederiving in isolation when a reference exists that would have constrained the fix.

**Pattern fit, not pattern match.** Think about the most appropriate decision factoring in the user experience and the developer experience. Simple, maintainable, understandable. If prior art fits, follow it. If it doesn't, don't scope-creep to make it fit — do the right thing for the context.

**A fix isn't just the diff.** Leave the surrounding system coherent. If the fix changes documented behavior, update the spec/doc in the same PR. If you notice a pattern that spans multiple recent issues, surface it for the maintainer rather than fixing one instance silently. If you skip, leave a rationale specific enough that a human can act on it without re-investigating.

**Tests defend behavior, not lines.** Apply `testing.md`'s litmus test before adding a regression test: "what bug would this catch?" If the only answer is "someone reverted this exact line" — asserting a hardcoded asset path, a class name, copy text, or that a specific element exists — it's a vanity test that locks in implementation. Skip it. Asset swaps, copy tweaks, and CSS-only fixes are visually verified, not test-locked. A good regression test would still catch the bug under any reasonable reimplementation; a vanity test only catches the literal revert.

## Tuning signal

When Ralphie gets it wrong — labels something `skip-too-big` that wasn't, opens a PR that shouldn't have been opened, misses an `ee/` touch — that's a rubric-tuning signal, not a one-off correction. Edit this file. The next run will pick up the change.
