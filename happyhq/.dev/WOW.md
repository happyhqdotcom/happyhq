# Ways of Working

How we use the Ralph Wiggum loop to build Q.

## The Rhythm

```
specs → full plan → branch → scoped plan → build → merge → repeat
```

## Phase 1: Write Specs (Human + LLM)

Not the loop. This is you having conversations (in Claude Code or here) to produce `specs/*.md` files. One file per topic of concern. Specs are source of truth — plans are disposable.

**Scope test:** Can you describe the topic in one sentence without "and"?

## Phase 2: Full Plan (Optional, Recommended First Time)

```bash
./loop.sh plan
```

Ralph reads all specs, examines code, produces `IMPLEMENTATION_PLAN.md`. This is a bird's-eye sanity check — "does Ralph understand what I'm asking for?" Review it. Don't build from it directly.

## Phase 3: Branch + Scoped Plan

```bash
git checkout -b ralph/chat-interface
./loop.sh plan-work "build the chat interface for sending messages and streaming agent responses"
```

This creates a **scoped** `IMPLEMENTATION_PLAN.md` on the branch. Ralph still reads everything (specs, code) for context, but the plan only contains tasks relevant to the scope description.

**Key principle: Scope at plan creation, not at task selection.** Don't give Ralph a big plan and hope it filters at runtime — that's 70-80% reliable. A scoped plan means there's nothing to drift toward.

## Phase 4: Build

```bash
./loop.sh 20
```

Ralph picks one task per iteration from the scoped plan, implements it, commits, exits. Loop restarts fresh. The `20` is max iterations (safety net for cost/runaway).

When all implementation tasks are complete, Ralph enters close-out: compares what was built against specs, updates specs to match reality, verifies acceptance criteria, and polishes. CTRL+C when you're satisfied.

**Your job:** Sit on the loop, not in it. Watch commits land. When Ralph fails in specific ways, add signs:

- Prompt guardrails → update `PROMPT_build.md`
- Code patterns → add to `lib/`
- Operational notes → update `CLAUDE.md`

## Phase 5: Merge + Next Branch

```bash
git checkout main
git merge ralph/chat-interface
git checkout -b ralph/next-thing
./loop.sh plan-work "next scope description"
```

Each new branch starts from a richer main. Ralph reads the merged code and builds on top of it.

## Ralphie does bugs

Different shape from the build loop. Reads GitHub issues, opens PRs.

```bash
./bugs.sh                  # triage everything, then fix up to 3 eligible bugs
./bugs.sh --triage-only    # just label/comment, don't touch code
./bugs.sh --issue 42       # skip triage, attempt one fix on #42
./bugs.sh --dry-run        # Phase 1 preview only (no writes); add --issue <#> to preview a fix
```

Two phases, one command:

- **Phase 1 — Triage.** One session reads every open `bug` issue with no `ralphie:*` label and applies `bugs-rubric.md`. For each rule trip, it writes a `ralphie:skip-*` label + a comment explaining what it saw and what would unblock it. Eligible issues stay unlabeled.
- **Phase 2 — Fix.** Loops one fix-session per bug: pick the oldest unlabeled `bug`, reproduce, branch `fix/<#>-...`, fix, regression test, verify, PR. Late-stage rubric checks (not-reproducible, verification-failed, too-big) can still skip a bug here. Stops when the queue is empty or `--max-bugs` is hit.

The breadcrumbs (labels + comments) are how Ralphie talks to itself across runs and how you manage the loop. A `ralphie:*` label is terminal — Ralphie never re-evaluates a labeled issue. **You unblock by removing the label.**

Edit `bugs-rubric.md` when Ralphie misjudges. Same model as `specs/` for the build loop: the spec is the source of truth, the prompts stay thin.

## Quick Reference

| Command                             | What it does                              |
| ----------------------------------- | ----------------------------------------- |
| `./loop.sh plan`                    | Full plan across all specs (sanity check) |
| `./loop.sh plan-work "description"` | Scoped plan for a branch                  |
| `./loop.sh`                         | Build mode, unlimited iterations          |
| `./loop.sh 20`                      | Build mode, max 20 iterations             |
| `./bugs.sh`                         | Triage + fix up to 3 bugs                 |
| `./bugs.sh --triage-only`           | Just triage, no code                      |
| `./bugs.sh --issue <#>`             | Fix one specific issue                    |
| `./bugs.sh --dry-run`               | Phase 1 preview only, no writes           |

## When Things Go Wrong

- **Plan is wrong →** Delete `IMPLEMENTATION_PLAN.md`, re-run planning. Plans are disposable.
- **Branch is a mess →** Throw the branch away. Main still has clean merged work.
- **Ralph keeps making the same mistake →** Add a sign. Pattern in `lib/`, note in `CLAUDE.md`, guardrail in the prompt.
- **Spec is underspecified →** Ralph will tell you in the plan (gap analysis). Or you'll see it in bad output. Update the spec, re-plan.

## What Lives Where

- `specs/*.md` — Source of truth. What to build.
- `IMPLEMENTATION_PLAN.md` — Disposable coordination state. Generated by Ralph.
- `CLAUDE.md` — Operational guide. How to build/run/test. Auto-injected by Claude Code.
- `testing.md` — Testing gotchas and patterns. Referenced from `CLAUDE.md`.
- `PROMPT_plan.md` — Planning prompt. Includes ULTIMATE GOAL.
- `PROMPT_build.md` — Build prompt. One task per iteration.
- `PROMPT_plan_work.md` — Scoped planning prompt. Uses `${WORK_SCOPE}`.
- `bugs-rubric.md` — Source of truth for bug triage/fix judgment. Loaded by both bug prompts.
- `PROMPT_bugs_triage.md` — Phase 1 prompt. Reads `bugs-rubric.md`, walks the queue, labels.
- `PROMPT_bugs_fix.md` — Phase 2 prompt. One bug per session. Uses `${ISSUE_NUMBER}`.
- `lib/` — Standard library. Steer Ralph through code, not just prompts.
