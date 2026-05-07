# QA Rubric

Source of truth for how Ralphie acts as the QA gate on PRs marked `ralphie:ready-to-merge` (loop-driven, e.g. dependency upgrades) or `needs-qa` (maintainer-flagged). Both `PROMPT_qa_triage.md` and `PROMPT_qa_execute.md` load this file. Edit here, not in the prompts.

## Queue contract

- The queue is: GitHub PRs that are `state:open`, labeled `ralphie:ready-to-merge` OR `needs-qa`, and have neither `ralphie:qa-pass` nor `ralphie:qa-fail`. The two entry labels are equivalent for queueing — `ralphie:ready-to-merge` comes from the dependency/bugs loops, `needs-qa` is a manual maintainer flag for any other PR worth running through.
- `ralphie:qa-pass` and `ralphie:qa-fail` are terminal — Ralphie never re-evaluates a labeled PR. The maintainer removes the label to re-queue (e.g., after rebasing past a fix).
- One outcome per PR per session. Cohorts (multi-PR test units) may produce multiple terminal labels in a single execute pass.

## What this rubric is not

The QA loop is not "run smoke on every PR." A static gate doing that would catch a slice of regressions and miss the more interesting ones — integration failures across a queue, judgment calls about whether the author's Exercise evidence already covers the surface, decisions about batching that need diff-level reading. This rubric encodes the engineering judgment a senior reviewer would apply, not a substitute for it.

The author of the PR (whether human or an upstream Ralphie loop) has already done their own work — `pnpm test`, `pnpm lint`, `pnpm check-types`, and an Exercise step that drove the user-visible surface and embedded evidence in the PR body. The QA loop reads all of that as context. It's the _second_ pair of eyes, not the first.

## Phases

The loop runs in two phases, like the other Ralphie loops:

- **Phase 1 — Triage.** Reads the queue, reads diffs and PR bodies, decides cohort policy. Output is a markdown plan listing test units in execute order. Triage never writes code, never labels, never comments. Just plans.
- **Phase 2 — Execute.** Reads the triage plan, runs each test unit in order, applies terminal labels and explanatory comments.

Triage and execute share this rubric. Triage uses it to decide what to test and how to group; execute uses it to decide what counts as evidence and what counts as failure.

## Critical path

Whether a PR's diff touches the **critical path** is the central question. Critical-path PRs require _actual verification_ (smoke, bespoke driving, or both). Non-critical-path PRs can be passed on Exercise evidence alone, or passed as trivial when the diff is purely cosmetic.

A PR is **critical-path** if its diff touches any of:

| Surface                                                                             | Why                                                              |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `lib/agents/`                                                                       | Agent config, prompt assembly, env spread to spawned SDK         |
| `lib/run/`                                                                          | Run loop state machine                                           |
| `lib/fs/`                                                                           | Filesystem helpers, path resolution, read/write boundaries       |
| `lib/actions/`                                                                      | Server actions (`createTask`, `ingestTaskInput`, etc.)           |
| `app/api/run/`                                                                      | Run start / active / stream endpoints                            |
| `app/api/fs/`                                                                       | Filesystem APIs powering the UI                                  |
| `app/api/auth/` or `lib/accounts/auth.server.ts`                                    | Auth resolution                                                  |
| `lib/file-types.ts`                                                                 | Input format gating                                              |
| `lib/config/`                                                                       | Config defaults the loop reads                                   |
| `components/features/tasks/`                                                        | Task UI: create dialog, file staging, panel                      |
| `components/features/chat/`                                                         | Chat composer: drag/drop, file upload                            |
| `components/features/desktop/hooks/use-run-activity.ts`                             | SSE subscription to the run stream                               |
| `package.json` / `pnpm-lock.yaml` bumping any of:                                   | These shift runtime semantics in ways tests don't always observe |
| &nbsp;&nbsp;&nbsp;`@anthropic-ai/claude-agent-sdk`                                  |                                                                  |
| &nbsp;&nbsp;&nbsp;`@anthropic-ai/sdk`                                               |                                                                  |
| &nbsp;&nbsp;&nbsp;`next`, `react`, `react-dom`                                      |                                                                  |
| &nbsp;&nbsp;&nbsp;`playwright` (smoke-e2e depends on it)                            |                                                                  |
| &nbsp;&nbsp;&nbsp;Any auth/billing primitive (`stripe`, `instantdb`, JWT/OIDC libs) |                                                                  |

A PR that _only_ touches:

- `*.md` and `*.mdx` (docs and specs)
- `*.css` and Tailwind config
- Files outside `lib/`, `app/`, `components/`, root package.json
- String-literal copy changes in `.tsx` files (no logic change, no prop change, no handler change — judged by reading the diff)

is **not critical-path**.

When the diff straddles the line — e.g., a TSX file with both a copy change and a new conditional — treat as critical-path. The diff-reading judgment is conservative: when in doubt, smoke.

## Triage outcomes (Phase 1)

Triage groups the queue into **test units**, each a list of one or more PRs and a strategy. The plan is written to `~/.cache/qa/triage-<timestamp>.md` so the maintainer can eyeball it before execute kicks off.

For each test unit, the strategy is one of:

- **`evidence-sufficient`** (1 PR, non-critical-path). Diff is cosmetic / docs / clearly-trivial. Execute passes on Exercise evidence (or the trivial nature itself) without running smoke.
- **`smoke-isolated`** (1 PR, critical-path). Smoke runs against this PR alone.
- **`smoke-bespoke`** (1 PR, critical-path with a specific surface the smoke doesn't cover). Smoke runs as sanity, plus a bespoke Playwright scenario the triage flagged.
- **`smoke-batched`** (N PRs, none critical-path _or_ all touching disjoint non-overlapping surfaces with low integration risk). Smoke runs once against the integrated branch.

### Cohort policy

Triage decides batching circumstantially. Heuristics:

**Batch (`smoke-batched`) when:**

- All PRs in the batch are non-critical-path, OR
- Multiple PRs all touch the _same_ low-risk surface (e.g., three Tailwind tweaks in different components — integration is unlikely to surprise), OR
- All PRs are mechanical / codemod-shaped (e.g., a sweep of `displayTitle` rename across many call-sites).

**Isolate (`smoke-isolated`) when:**

- PR touches critical path AND another PR in the queue also touches critical path (different code paths under the same critical surface = real integration risk).
- PR is large (>10 files or >300 lines, excluding `*.md`/`*.mdx`).
- PR is a dep bump in the elevated-scrutiny list (agent SDK, framework, playwright).
- PR's diff straddles two distant areas of the codebase that don't normally co-evolve.

**Order:** within a single execute run, riskier units first (`smoke-isolated` and `smoke-bespoke` before `smoke-batched` and `evidence-sufficient`). If a high-risk unit fails, the maintainer sees it before the low-risk batch consumes attention.

## Execute outcomes (Phase 2)

For each test unit in plan order:

| Outcome             | Label applied                                                | Comment                                                                                                       |
| ------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Evidence sufficient | `ralphie:qa-pass` per PR                                     | Cite the Exercise evidence relied on; explain why it covers the changed surface                               |
| Smoke pass          | `ralphie:qa-pass` per PR                                     | Cite the smoke run output (timing, scenarios run); link to logs / screenshots if bespoke driving produced any |
| Batch pass          | `ralphie:qa-pass` per PR                                     | Note batch context (which PRs were tested together) and the smoke result                                      |
| Bespoke pass        | `ralphie:qa-pass` per PR                                     | Describe the bespoke scenario driven (what was clicked, what was asserted), link to evidence                  |
| Smoke fail (single) | `ralphie:qa-fail` per PR                                     | Quote the failure (last 30 log lines), link the smoke root path / preserved screenshots                       |
| Batch fail → bisect | `ralphie:qa-fail` on culprit; `ralphie:qa-pass` on innocents | Comment on each PR explaining the bisect path; only the culprit gets the failure detail                       |
| Bisect non-converge | `ralphie:qa-fail` on all                                     | Note that bisect couldn't isolate (likely flake / env drift); recommend manual investigation                  |

### What makes Exercise evidence sufficient

For `evidence-sufficient` units, the agent reads the PR body and judges whether the author's Exercise step adequately covers the changed surface. Sufficient if:

- The PR body has a "Visual evidence" or equivalent section with embedded screenshots / log excerpts.
- The driven scenario matches what a senior reviewer's first concern would be — for a file-upload bug fix, the Exercise drove a file upload; for a chat composer change, the Exercise sent a message.
- For server-only changes, the cited log excerpt or API response demonstrates the expected behavior on the actual code path.
- The "what was exercised" sentence in the PR body is concrete enough that a reader can verify the claim against the embedded evidence (not "I tested it thoroughly").

If any of those is missing or thin, the unit is not `evidence-sufficient` even if the diff looks small. Reclassify as `smoke-bespoke` (or escalate to maintainer with a `qa-fail` if smoke is also unable to verify the surface in question).

### Bisect on batch failure

When a `smoke-batched` unit fails:

1. The current integration branch contains all PRs in the batch.
2. Drop one PR (drop the riskiest first — the one closest to critical path or the largest diff). Re-run smoke against the smaller integration.
3. If the smaller integration **passes**: the dropped PR is the culprit. Label it `ralphie:qa-fail`; label the rest `ralphie:qa-pass`.
4. If the smaller integration **fails**: the dropped PR is innocent. Re-add it; drop the next-riskiest. Repeat.
5. **Halving heuristic for cohorts ≥ 4:** instead of dropping one at a time, drop half. Identifies the culprit in `log2(N)` smoke runs.
6. **Cost cap:** 6 additional smoke runs (~10 min). Beyond that, abandon bisect, label all `ralphie:qa-fail` with a "bisect non-converge" comment.

### Comment shape (qa-pass)

```
QA: pass — <evidence-sufficient | smoke | bespoke | batched>

What was checked: <1–2 sentences — the surface, the scenario, what evidence was relied on>

Evidence: <link to screenshots / log excerpts / smoke output>

<For batched: list the other PRs tested in the same integration>
```

### Comment shape (qa-fail)

```
QA: fail — <smoke | bespoke | bisect-converged-here | bisect-non-converge>

What broke: <1–2 sentences — the failure mode, where it surfaced>

Evidence: <last 30 lines of relevant log; link to preserved smoke root or screenshots>

<For bisect-converged: which other PRs were innocent and got qa-pass>
<For bisect-non-converge: what was tried, why it didn't isolate>

What unblocks it: <one sentence — what the maintainer or upstream loop should fix>
```

## Hard constraints (never violate)

- **Never auto-merge.** The QA loop only labels and comments. The maintainer is always the merge gate.
- **Never modify a PR's branch.** No `git push` to the PR's head. No force-push. No commits made on the PR's behalf.
- **Never apply both `ralphie:qa-pass` and `ralphie:qa-fail` to the same PR.** Terminal-label rule.
- **Never QA a PR from a fork** (v1 limitation — `gh pr checkout` permissions complexity not solved yet). Apply `ralphie:qa-fail` with a "v1 doesn't support fork PRs" comment and surface for manual review.
- **Never run smoke against a PR's branch in the maintainer's primary checkout** — only in `../happyhq-qa`.
- **Never delete or close a PR.** Labels and comments only.

## Principles

These tune _how_ the allowed work gets done. Not gates.

**Judgment is the load-bearing thing.** The reason this loop exists rather than a static GH Action is that path-rules can't tell UI copy from logic. When the rubric is ambiguous about whether to smoke, lean toward smoking — false positive smoke runs cost ~90s; false negative passes ship regressions.

**Cite evidence, always.** Every comment links or quotes specific artifacts. "QA: pass — looked fine" is never the comment; "QA: pass — smoke ran in 78s, plan.md and outputs/haiku.md both produced; preserved at /tmp/...." is the comment.

**Trust but verify Exercise.** When the author claims Exercise covered the surface, look at the embedded evidence and judge for yourself. The Exercise step is upstream defense, not blank trust.

**Smaller cohorts when uncertain.** Batching saves smoke runs but multiplies failure ambiguity. When unsure whether two PRs interact, isolate.

**Bisect cheaply, escalate fast.** When bisect hits the cost cap, surface the situation rather than burning more runs. The maintainer's time is more valuable than another 10 minutes of smoke.

**A pass isn't just the label.** The comment is the artifact a future reader uses to understand what was verified. Write it like that — with enough detail that someone reading the PR a month later understands what evidence the QA loop saw.

## Tuning signal

When the QA loop gets it wrong — passes a PR that broke main, fails a PR that was actually fine, batches things it shouldn't have — that's a rubric-tuning signal, not a one-off correction. Edit this file. The next run picks up the change.
