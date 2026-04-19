# Evals

How Q's prompts are tested before changes reach users.

## Purpose

Define how prompt changes are evaluated. Q has three prompt types ([Learning](learning.md), [Planning](planning.md), [Working](working.md)) plus a Drafting subagent. Changes to any of these directly affect output quality, but the effects are non-deterministic and hard to predict. This spec defines a layered evaluation system — starting with planning mode, extending to working and learning — so prompt changes can be tested against real scenarios before shipping.

This spec owns the evaluation approach, scenario structure, and quality rubrics. It does not own the prompts themselves (see [Prompts](prompts.md)) or the behavioral contracts they implement (see the mode-specific specs).

## Why This Is Hard

Prompt evaluation differs from code testing in ways that shape every design choice here:

- **Non-deterministic.** Same prompt + same input produces different output each run. Single runs prove nothing; patterns emerge over multiple runs.
- **Quality is subjective.** "Better plan" resists programmatic definition. But behavioral properties ("did it read all inputs?", "did it surface assumptions?") are checkable.
- **Context-dependent.** A prompt that works for SOW writing might fail for research tasks. Scenarios must cover the range of real usage.
- **Expensive.** Each eval run costs real API calls. Evals are run intentionally, not on every commit.

The approach: layer cheap, fast checks (behavioral assertions) under expensive, rich checks (LLM-as-judge). Run the cheap layer often, the expensive layer before significant changes.

## Starting with Planning

Planning mode is the easiest to evaluate:

- **Single invocation** — one `query()` call, not a multi-turn conversation or iterative loop
- **Concrete output** — `plan.md` is a file you can read and score
- **Defined quality criteria** — [Planning](planning.md) already specifies what makes a good plan
- **No user interaction** — no `AskUserQuestion`, no conversation dynamics

Once planning evals work, the runner and judge infrastructure extends to working mode (iterative but isolated per iteration) and eventually learning mode (multi-turn, hardest).

## Scenarios

A scenario is a frozen stream state — a real directory structure with all the files Q would read during planning. Scenarios are the inputs to every eval layer.

### What a Scenario Contains

```
evals/scenarios/{scenario-name}/
  playbook.md                              # Stream playbook (or absent for new streams)
  specs/                                    # Stream specs
    sow.md
  samples/                                  # Stream samples
    client-a/
      INDEX.md
      extracted.md
    client-b/
      INDEX.md
      extracted.md
  tasks/{task-name}/                        # The task being planned
    inputs/
      brief/
        original.md
      context.md
```

This mirrors the real filesystem layout (see [Filesystem Layout](filesystem-layout.md)). The runner sets up a temp git repo from this directory so git commits work normally.

### What Makes a Good Scenario Set

Cover the range of real usage — not just the happy path:

- **Rich inputs** — multiple samples, detailed spec, full playbook. Tests thoroughness: does Q reference all inputs? Does the plan reflect the spec's workflow?
- **Minimal inputs** — just a task description, no samples. Tests assumption-surfacing: does Q flag what's missing? Does it make reasonable assumptions explicit?
- **Ambiguous inputs** — conflicting information, unclear scope. Tests judgment: does Q identify the conflicts? Does it flag choices for the user?
- **Established workflow** — playbook defines a clear multi-step process. Tests playbook adherence: does the plan follow the playbook's structure?

Start with 3-5 scenarios. Add scenarios when a real failure reveals a gap.

### Creating Scenarios from Real Streams

The best scenarios come from real usage. To create one:

1. Copy a stream directory (playbook, specs, samples, one task's inputs)
2. Strip anything unnecessary — the scenario should be minimal but representative
3. Name it descriptively (`rich-sow-inputs`, `minimal-blog-request`, `conflicting-scope`)

Scenarios are checked into the repo. They're small — text files, not binary assets.

## Layer 1: Behavioral Assertions

Programmatic checks on the SDK message trace. No LLM judge, no subjectivity. These catch structural regressions — the prompt stopped doing something it should always do.

### Planning Mode Assertions

| Assertion          | What it checks                                          | How                                                                            |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Plan created       | `plan.md` exists after the run                          | Check filesystem                                                               |
| Plan committed     | `plan.md` is tracked in git after the run               | `git status`                                                                   |
| Git commit made    | Working tree is clean after the run                     | `git status`                                                                   |
| All inputs read    | Every file in `inputs/` was passed to a Read tool call  | Parse message trace for Read tool uses, compare against scenario's input files |
| Specs read         | Every `.md` in `specs/` was read                        | Same trace parsing                                                             |
| Samples referenced | Sample `INDEX.md` files were read                       | Same trace parsing                                                             |
| Playbook read      | `playbook.md` was read (if it exists in the scenario)   | Same trace parsing                                                             |
| Budget respected   | Total cost stayed within `PLANNING_BUDGET_USD`          | SDK cost tracking                                                              |
| Steps are granular | No plan step contains nested sub-steps beyond one level | Parse `plan.md` structure                                                      |

### Working Mode Assertions (future)

Same pattern, different checks:

- One session completed per iteration (not zero, not multiple)
- `plan.md` updated with findings after each iteration
- Git commit per iteration
- Completion signal (`[done]`) in commit subject only when deliverables exist in `outputs/`
- Output files match what the plan specified

### What Assertions Don't Cover

Assertions check behavior, not quality. "Plan was created" says nothing about whether it's a good plan. That's what the judge is for.

## Layer 2: Manual Comparison

A structured way to run prompt variants against the same scenarios and review outputs side by side. No automation beyond the runner — you read the plans and decide.

### A/B Comparison Workflow

1. Create a variant prompt file (e.g., `prompts/planning-v2.md`)
2. Run both the current prompt and the variant against all scenarios
3. The runner saves outputs to separate directories:
   ```
   evals/results/{scenario}/
     {timestamp}-baseline/
       plan.md
       trace.json
     {timestamp}-variant/
       plan.md
       trace.json
   ```
4. Read both plans for each scenario. Note which is better and why.

This is the right tool for significant prompt changes — like removing the mandatory preamble (E4 in [Q Optimization](q-optimization.md)) where quality regression is the primary risk.

### When to Use Manual Comparison

- Before any prompt change that affects output quality (not just behavioral properties)
- When the LLM judge can't capture what you care about (tone, judgment quality, creative decisions)
- When you need to build intuition about how a prompt change affects different scenario types

## Layer 3: LLM-as-Judge

A separate LLM call that scores Q's output against defined criteria. Useful for comparing variants at scale — when you want numbers, not just impressions.

### Judge Design

The judge is a Sonnet call (cheap, fast) that receives:

- The scenario's input files (what Q had to work with)
- The generated `plan.md` (what Q produced)
- A scoring rubric

And returns structured scores.

### Planning Mode Rubric

Derived from what [Planning](planning.md) defines as a good plan and what [Prompts](prompts.md) defines as good prompt behavior:

| Criterion                | What the judge evaluates                                                                             | Score |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ----- |
| **Completeness**         | Does the plan address all inputs? Are any input files ignored?                                       | 1-5   |
| **Spec adherence**       | Does the plan reference specs and samples by name? Does it follow the workflow the playbook defines? | 1-5   |
| **Assumption surfacing** | Are gaps and choices made explicit? Does Q flag where it's filling in what the inputs don't cover?   | 1-5   |
| **Step granularity**     | Is each step completable in one working iteration? No steps that need decomposition?                 | 1-5   |
| **Actionability**        | Could a working agent execute this plan without ambiguity? Are steps concrete enough?                | 1-5   |

The judge prompt includes the rubric with examples of 1-score and 5-score outputs for each criterion. This anchors the scoring and reduces drift.

### Judge Calibration

Before trusting judge scores:

1. Run the judge on a plan you consider excellent — scores should be high
2. Run it on a deliberately poor plan (remove assumption surfacing, skip inputs) — scores should be low
3. If the judge can't distinguish good from bad, the rubric needs work

Recalibrate when the rubric changes or when judge scores stop matching your intuition.

### When to Use the Judge

- Comparing variants across many scenarios (more than you'd read manually)
- Tracking quality over time as prompts evolve
- Catching regressions that behavioral assertions miss (quality degradation without behavioral changes)

## The Runner

A CLI script that orchestrates evaluation. It calls `query()` directly — same as `loop.server.ts` — not through the HTTP layer. This isolates prompt evaluation from app concerns (routing, SSE, SWR).

### What the Runner Does

1. **Sets up the scenario** — copies the scenario directory to a temp location, initializes a git repo
2. **Builds the system prompt** — calls `planningPrompt()` (or a variant) with the scenario's stream/task names
3. **Runs the query** — calls `query()` with `planningAgentOptions`-equivalent config
4. **Captures the output** — saves `plan.md`, the full SDK message trace, and cost metrics
5. **Runs assertions** — behavioral checks against the trace
6. **Optionally runs the judge** — LLM-as-judge scoring if requested

### Usage

```bash
# Run planning eval against all scenarios (assertions only)
pnpm eval:planning

# Run with a variant prompt
pnpm eval:planning --variant prompts/planning-v2.md

# Run with LLM judge scoring
pnpm eval:planning --judge

# Run a specific scenario
pnpm eval:planning --scenario rich-sow-inputs

# Run N times per scenario (for non-determinism)
pnpm eval:planning --runs 3
```

### Multiple Runs

Non-determinism means single runs are unreliable. For significant changes, run 3-5 times per scenario and look at patterns:

- Assertions should pass consistently (flaky assertions indicate a prompt compliance issue)
- Judge scores should cluster (high variance indicates the prompt is underspecified)
- Compare median scores across variants, not individual runs

## Filesystem Layout

```
app/evals/
  run.ts                    # CLI runner
  assert.ts                 # Behavioral assertions
  judge.ts                  # LLM-as-judge orchestration
  prompts/
    plan-judge.md           # Judge system prompt for planning
  scenarios/
    rich-sow-inputs/        # Scenario directories
    minimal-blog-request/
    ...
  results/                  # Output (gitignored)
    {scenario}/
      {timestamp}-{label}/
        plan.md
        trace.json
        scores.json
```

`results/` is gitignored — eval outputs are ephemeral. Scenarios are checked in.

## Extending to Other Modes

### Working Mode

Same runner, different config:

- Use `workingAgentOptions` instead of `planningAgentOptions`
- Scenario includes `plan.md` (frozen mid-task state with some sessions marked complete)
- Run one iteration, not the full loop
- Assertions check single-step discipline, progress updates, git commits
- Judge evaluates the working artifact against the spec

### Learning Mode

Hardest — multi-turn conversation requires simulating user messages:

- Scenario includes a script of user messages (what the user would say)
- Runner feeds messages sequentially, handling `AskUserQuestion` responses
- Assertions check delegation patterns, artifact creation, propose-and-confirm style
- Judge evaluates the resulting playbook/spec quality

Learning mode evals are future work. The scenario and judge infrastructure built for planning carries over.

## Design Decisions

**Scenarios are frozen stream states, not mocks.** Real directory structures are more representative than mock data and easier to maintain. They also serve as documentation of what Q's input looks like in practice.

**Three layers, not one.** Behavioral assertions are cheap and catch the most dangerous regressions (broken completion signals, missing reads). Manual comparison catches quality issues automation misses. LLM-as-judge bridges the gap — automated quality scoring for variant comparison at scale. Each layer serves a different need.

**Runner calls `query()` directly.** Evals test the prompt and agent behavior, not the HTTP layer or UI. Going through the API would add noise (auth, SSE encoding, SWR) without adding signal.

**Planning first.** Single invocation, concrete output, defined criteria. Build confidence in the eval approach before tackling harder modes.

**Judge uses Sonnet, not Opus.** The judge needs to be cheaper than the thing it's judging. Sonnet is capable enough to score against a rubric. If scoring quality is insufficient, upgrade to Opus — but the rubric is usually the bottleneck, not the model.

**No automated scheduling.** Evals cost real money and take real time. They're run intentionally before prompt changes, not on every commit or in CI.

**Rubric derived from existing specs.** The planning spec and prompts spec already define what "good" looks like. The judge rubric translates those definitions into scoring criteria rather than inventing new ones.

## Acceptance Criteria

- [ ] `evals/scenarios/` contains at least 3 planning scenarios covering different input profiles
- [ ] Runner can execute a planning eval against a scenario and produce `plan.md` + `trace.json`
- [ ] Behavioral assertions run against the trace and report pass/fail per assertion
- [ ] Runner supports `--variant` flag for A/B comparison (two prompt files, same scenario)
- [ ] LLM-as-judge returns structured scores per criterion when `--judge` is passed
- [ ] Judge scores differentiate between a known-good and known-bad plan (calibration test)
- [ ] `results/` is gitignored
- [ ] `pnpm eval:planning` works as the entry point
