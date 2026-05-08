# QA Rubric

Source of truth for how Ralphie acts as the QA gate on PRs marked `ralphie:ready-to-merge` (loop-driven, e.g. dependency upgrades) or `needs-qa` (maintainer-flagged). Both `PROMPT_qa_triage.md` and `PROMPT_qa_execute.md` load this file. Edit here, not in the prompts.

## What QA does

The author has already run unit tests, lint, types, and an Exercise step that drove the user-visible surface and embedded evidence in the PR body. Our job is the second pair of eyes — verify what specifically changed didn't break what could break, and backstop with the smoke harness.

## The four steps

For every PR:

1. **Read the diff.** What specifically changed?
2. **Identify what could break.** What surface, semantic, or data path is at risk if the change is wrong?
3. **Verify it didn't.** By whatever means makes sense for this change.
4. **Smoke as backstop.** Run `pnpm smoke:e2e` to catch build / golden-path regressions independent of step 3.

For pure non-code PRs — docs only, CSS only, string-literal copy in `.tsx` (no logic change), dev-only deps — the build can't regress and the author's Exercise evidence covers the user-visible surface. Skip steps 2–4. Trust the embedded evidence and label.

For code PRs where the author's Exercise evidence already concretely covers what changed: skip step 3. Step 4 (smoke) still runs — it catches build regressions the author's surface verification doesn't.

Otherwise: triage writes the verification, execute carries it out, then smokes.

## What "verify" looks like

The verification is whatever the change calls for. Examples:

- **UI surface change** → drive it in dev with the Playwright MCP tools (per [.dev/exercising-the-ui.md](exercising-the-ui.md)).
- **API change** → hit the endpoint with curl, inspect the response (per CLAUDE.md "Using HappyHQ's API for verification").
- **SDK / framework bump** → read the upstream changelog for what shifted between versions, probe those specific semantics.
- **Server-side behaviour change** → trigger the code path, read structured logs (per CLAUDE.md "Debugging Q").
- **Internal-only change** → run the targeted unit test that covers the changed code path.
- **Combination** as the change demands.

There's no enum to pick from. Triage describes the verification in prose; execute follows it.

## What counts as sufficient author evidence

The author's Exercise step is upstream defense. It's sufficient when:

- The PR body has concrete embedded evidence — screenshots, log excerpts, API responses — for the changed surface.
- The driven scenario matches what would break if the change is wrong (upload bug fix → exercised an upload; chat composer change → sent a message).
- The "what was exercised" claim is verifiable against the embedded evidence — not "I tested it thoroughly."

If any of those is missing or thin, author evidence is not sufficient: triage writes an explicit verification.

## Phases

- **Triage.** Walks the queue, reads each PR's diff and body, writes a per-PR verification plan to `~/.cache/qa/triage-<timestamp>.md`. The plan is prose: what changed, what could break, how to verify (or "trust author's evidence"). Triage never labels, never comments, never runs smoke.
- **Execute.** The wrapper fans out one fresh agent session per unit. Each session reads its assigned unit from the plan, runs the verification, runs smoke if applicable, labels, comments, exits. Inter-unit hygiene — return to base branch, stop dev server — is the wrapper's job.

One unit = one PR. No batching in v1.

## Bespoke driving — workspace hygiene

When verification involves driving the actual UI, the agent uses the maintainer's `~/HappyHQ/` workspace. Discipline:

- Use a uniquely-named stream slug for any artifacts created: `qa-bespoke-${PR_NUMBER}` (or similar). Don't write into existing user streams.
- After verification completes — pass or fail — `rm -rf ~/HappyHQ/qa-bespoke-${PR_NUMBER}`. Best-effort: cleanup failure doesn't change the verdict, but note it in the comment.

## Comment shapes

### qa-pass

```
QA: pass

What was checked: <one or two sentences — the verification done, or "trusted author's evidence on <surface>">

Evidence: <link to screenshots / log excerpts / smoke output / cited author evidence>

Backstop: <smoke PASS in Xs | skipped — non-code PR>
```

### qa-fail

```
QA: fail

What broke: <one or two sentences — failure mode, where it surfaced (verification step or smoke backstop)>

Evidence: <last 30 lines of relevant log / link to preserved smoke root / screenshots>

What unblocks it: <one sentence — what the maintainer or upstream loop should fix>
```

## Hard constraints (never violate)

- **Never auto-merge.** The QA loop only labels and comments. The maintainer is always the merge gate.
- **Never modify a PR's branch.** No `git push` to the head, no force-push, no commits on the PR's behalf.
- **Never apply both `ralphie:qa-pass` and `ralphie:qa-fail` to the same PR.** Terminal-label rule.
- **Never QA a PR from a fork** (v1 limitation — `gh pr checkout` permissions complexity not solved). Apply `ralphie:qa-fail` with a "v1 doesn't support fork PRs" comment and surface for manual review.
- **Only operate in `../happyhq-qa`.** Never run smoke against a PR's branch in the maintainer's primary checkout.
- **Never delete or close a PR.** Labels and comments only.

## Principles

These tune _how_ QA runs. Not gates.

**Judgment is load-bearing.** The whole point of having an agent rather than a static GH Action is reasoning per-PR about what could break and how to check. Path-rules can't tell UI copy from logic.

**Verify what changed, not the same thing every time.** Smoke is the backstop, not the verification. If a PR changed the chat composer, drive the chat composer. If a PR bumped the SDK, probe the semantics that shifted.

**Cite evidence, always.** Every comment links or quotes specific artifacts. "QA: pass — looked fine" is never the comment; "QA: pass — drove learning-mode entry, observed brief ack; smoke PASS in 78s" is.

**Trust but verify Exercise.** When the author claims Exercise covered the surface, look at the embedded evidence and judge. The Exercise step is upstream defense, not blank trust.

**A pass isn't just the label.** The comment is the artifact a future reader uses to understand what was verified. Write it like that — with enough detail that someone reading the PR a month later understands what evidence the QA loop saw.

## Tuning signal

When the QA loop gets it wrong — passes a PR that broke main, fails a PR that was actually fine — that's a rubric-tuning signal, not a one-off correction. Edit this file. The next run picks up the change.
