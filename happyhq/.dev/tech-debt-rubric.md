# Tech-Debt Rubric

Source of truth for how the loop judges open `tech-debt`-labeled issues. Both `PROMPT_tech_debt_triage.md` and `PROMPT_tech_debt_fix.md` load this file. Edit here, not in the prompts.

## Queue contract

- The queue is: GitHub issues that are `state:open`, labeled `tech-debt`, and have no label starting with `ralphie:`.
- A `ralphie:*` label is terminal — the loop never re-evaluates a labeled issue. The human removes the label to re-queue.
- One outcome per session (a label, a comment, or a PR + label). No chaining.

## What this rubric is not

A tech-debt issue body is a hypothesis from the author about what should change and how. It is **not** a script to execute. The fix session reads the body for intent, reads the actual code, and forms its own opinion. Sometimes the body is right; sometimes the body is half-right and the fix deviates with documented reasoning; sometimes the body is wrong and the loop pushes back via `ralphie:skip-needs-rescope` instead of shipping a thoughtless implementation. This rubric encodes the gates around that engineering judgment, not a substitute for it.

## Phase 1 — Triage rubric (evaluable from issue text alone)

Apply in order — bail at the earliest stop.

| #   | Condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Label applied                 | What unblocks it                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1   | Issue body isn't an unambiguous directive to act. Includes: decision requests ("delete or wire up?"), decision requests with a "default option" the maintainer hasn't explicitly confirmed in a comment, unresolved questions for the maintainer ("should we do A or B?", "@user thoughts?"), open-ended audits ("audit every code path that..."), "let's discuss" framing, tracking issues with no concrete unit of work, or any body where the loop has to guess what the maintainer wants done. | `ralphie:skip-not-actionable` | Maintainer leaves a comment confirming the path forward (or rewrites the body with concrete scope), removes label |
| 2   | Body proposes a fix that would touch `happyhq/ee/`, `.github/`, CI workflows, lockfiles beyond a focused change, or licensing files                                                                                                                                                                                                                                                                                                                                                                | `ralphie:skip-out-of-scope`   | Maintainer scopes manually or decouples the protected-path piece, removes label                                   |
| 3   | Pre-stale: a quick look at the cited file(s) shows the directive is already done (e.g., `'rule': 'off'` line is already removed; named symbol no longer exists)                                                                                                                                                                                                                                                                                                                                    | `ralphie:skip-stale`          | Maintainer closes the issue, or rewrites the body around what's still outstanding                                 |

Phase 1 is read-only on the repo, write-only on GitHub metadata (labels + comments). No branches, no commits, no PRs.

## Phase 2 — Fix-time rubric (evaluable only after engaging seriously)

| #   | Condition                                                                                                                                                                     | Label applied                      | What unblocks it                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------- |
| 4   | After opening the cited files: sites listed in the body have significantly drifted (more than a couple already gone) and what's left isn't enough to anchor the change        | `ralphie:skip-stale`               | Maintainer refreshes the body or closes                  |
| 5   | After reading the code: the body's proposed approach is wrong (smaller fix exists, deeper fix needed, the buckets are mis-assigned). Loop comments with the alternative shape | `ralphie:skip-needs-rescope`       | Maintainer reads the comment, updates the body or closes |
| 6   | `pnpm format` / `pnpm lint` / `pnpm check-types` / `pnpm --filter=happyhq test` failed twice                                                                                  | `ralphie:skip-verification-failed` | Maintainer reads the comment Ralphie left, fixes locally |
| 7   | Risk gate trips (see "Risk gate" below): diff is over threshold AND high-risk                                                                                                 | `ralphie:split-into-children`      | Children land — when all close, parent closes too        |
| 8   | Fix shipped (under threshold, OR over threshold but low-risk and noted in PR body)                                                                                            | `ralphie:fixed-in-pr`              | Terminal — the linked PR closes the loop                 |

## Risk gate (replaces a raw size cap)

Size is a proxy for **review risk**, and the proxy is wrong in both directions: a 12-file mechanical rename is lower risk than a 30-line edit in `lib/run/loop.server.ts`. The gate assesses risk explicitly, post-fix, with the actual diff in hand.

**Threshold (the same numbers bugs.sh uses today):** more than 10 files changed OR more than 300 net lines added, excluding `*.md` and `*.mdx`.

**Low risk** (proceed even if over threshold):

- Change is mechanical: rename, codemod-shaped, uniform per-site application of a published rubric (e.g., "fix / per-line-disable / refactor" applied consistently).
- Touched files have test coverage that exercises the change, OR the change is provably behavior-preserving (compiler-checked rename, lint rule fix that doesn't change runtime semantics).
- No runtime behavior change, OR the change is the explicit goal and tests pin it.
- Files cluster outside critical surfaces.

**High risk** (do not ship as one PR):

- Touches critical surfaces: `lib/run/`, `lib/database/`, `lib/fs/`, `lib/actions.ts`, server actions, agent orchestration, auth, billing.
- Mixes unrelated concerns (refactor + behavior fix; multiple separable issues collapsed into one PR).
- Behavior change without test coverage that pins it.
- Per-site decisions diverge meaningfully (some sites "fix", others "refactor", others "disable") AND the diverging decisions warrant separate review.

**Decision tree:**

1. Diff under threshold → proceed (Path A — ship).
2. Diff over threshold AND low risk → proceed; add a section to the PR body titled "Why this is over threshold but low risk" with a one-paragraph rationale (Path A — ship with note).
3. Diff over threshold AND high risk → split (Path B below). Do not push the over-size PR.

## Split path (Path B)

When the risk gate trips, the loop creates child issues instead of one giant PR. The split itself is a low-risk action: only GitHub metadata writes, no code.

1. **Identify the split axis** from the parent body. For ESLint rule re-enablement issues, the natural axis is files (one PR per file) or buckets (one PR for the "fix in place" sites, one for the "per-line-disable" sites). For other shapes, the body usually telegraphs the axis. Pick the axis that produces 2–4 children of comparable size.
2. **For each child group:** `gh issue create --label tech-debt --title "<parent title> — <axis slice>" --body "..."`. Body must include:
   - `Split from #<parent>.`
   - One paragraph stating the scope of this child (which files/sites/buckets).
   - A copy of the parent's per-site decision rubric, narrowed to the child's scope.
   - The terminal action for the child (e.g., "Once these N sites are fixed, do NOT remove the `'rule': 'off'` line — that's the parent's terminal action, after all children close.").
3. **Comment on parent** listing the children: "Split into #X, #Y, #Z by <axis>. This parent stays open until all children close, at which point I (or the next loop iteration) can do the terminal action."
4. **Apply `ralphie:split-into-children` to parent.**
5. **Revert the working branch:** `git checkout ${BASE_BRANCH} && git branch -D chore/<slug>`. Push nothing.
6. Exit. Next loop iteration picks up the children naturally — they're unlabeled `tech-debt` issues like any other.

## Comment shape (for skips and rescope)

Every skip — and every rescope — writes one comment, in this shape:

```
Loop skipped this for: <rubric reason name>

What I saw: <1–3 sentences — the specific evidence in the issue/code that triggered the rule>

What would unblock it: <1 sentence — the concrete action that lets the next loop run pick this up>
```

For `ralphie:skip-needs-rescope`, the "What I saw" section IS the alternative shape — describe the better approach concretely enough that the maintainer can decide whether to update the body.

For `ralphie:split-into-children`, the comment on the parent doesn't follow this shape — it lists the children instead (see Split path step 3).

Comments are for the human reading the queue. The label is for the next loop run.

## Hard constraints (never violate, regardless of rubric)

- Never push to `main`. Never force-push. Never `--no-verify`.
- Never modify files under `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what a focused fix demands), or licensing files. If the fix would require any of these, apply `ralphie:skip-out-of-scope` and exit.
- PRs always target `main`, branch from `${BASE_BRANCH}`, use the `chore/` prefix, and include `Closes #<issue>` plus an AI-assistance disclosure (per `CONTRIBUTING.md`).
- One outcome per session. After labeling or opening a PR (or splitting into children), exit.

## Principles

These are guidance, not gates. The rubric above is pass/fail; these tune _how_ the allowed work gets done.

**Engage seriously, don't follow blindly.** A good engineer reads the issue, reads the code, and forms an opinion before changing anything. The body is a hypothesis. If the proposed approach is wrong on inspection, push back via `ralphie:skip-needs-rescope`. If it's partially right, deviate with documented reasoning in the PR body. The loop's job is to do the engineering, not type out what the issue says.

**A fix isn't just the diff.** Leave the surrounding system coherent. If the change moves documented behavior, update the spec/doc in the same PR. If you notice the same anti-pattern in nearby files that aren't listed in the issue, mention it in the PR body — but don't widen the diff to cover them (that's a separate issue).

**Tests defend behavior, not lines.** Tech-debt fixes that don't change runtime behavior usually don't need new tests; existing tests passing is the contract. Tech-debt fixes that DO change behavior (because the old behavior was wrong) need tests that pin the new behavior. Apply the litmus test from `testing.md`: "what bug would this catch?" If the answer is "someone reverted this exact line," it's a vanity test — skip it.

## Tuning signal

When the loop gets it wrong — labels something `not-actionable` that wasn't, ships a PR that should have been a rescope, splits when a single PR would have been fine — that's a rubric-tuning signal, not a one-off correction. Edit this file. The next run will pick up the change.
