# QA Rubric

Source of truth for how Ralphie acts as the QA gate on PRs marked `ralphie:ready-to-merge` (loop-driven, e.g. dependency upgrades) or `needs-qa` (maintainer-flagged). Both `PROMPT_qa_triage.md` and `PROMPT_qa_execute.md` load this file. Edit here, not in the prompts.

## The litmus test

Approach every PR as a senior QA engineer. Ask one question:

> **Are you satisfied with what's been tested?**

Everything else in this rubric is how to answer that honestly. The author has already run unit tests, lint, types, and an exercise step that drove the user-visible surface. We're the second pair of eyes.

## How to answer the litmus test

For every PR, walk these:

1. **What changed?** Read the diff.
2. **What could break?** Surface, behavior, data path, integration — name the real risks.
3. **What's been tested?** Read the PR body and the artifacts the author shipped (screenshots, log excerpts, test results, "what was exercised" sentence). Note what they actually did.
4. **Does the testing match the risks?** A behavioral risk needs behavioral testing. A contract risk is covered by a unit test asserting the contract. An integration risk needs an integration check. _The kind of verification has to match the kind of risk._
5. **If there's a gap, close it.** Drive the UI, hit the API, run the right test — whatever the gap calls for.
6. **Smoke as backstop.** Run `pnpm smoke:e2e` to catch build / golden-path regressions independent of step 5.

Then ask the litmus test again. Satisfied → label pass. Not satisfied → step 5.

## When to skip steps

- **Pure non-code PRs** (docs only, CSS only, string-literal copy in `.tsx` with no logic change, dev-only deps): the build can't regress and the author's exercise covers the user-visible change. Skip steps 4–6. Label pass and cite the author's testing.
- **Code PRs where the author's testing already covers what could break** (litmus test answers yes after step 3): skip step 5. Step 6 (smoke) still runs as build backstop — it catches build regressions the author's surface verification doesn't.

Otherwise: write the verification, run it, smoke.

## Pitfalls — things that look like verification but aren't

These are failure modes we've actually seen. Name them when they apply; reject them as evidence.

- **Contract-level verification of a behavioral risk.** "Unit test asserts the function returns X" doesn't cover "the agent still behaves correctly when context arrives via a different channel." A unit test pins a contract; behavior under integration is a separate risk. The kind has to match.
- **Smoke as verification.** Smoke is the backstop. It runs the golden path with one fixture; it doesn't verify what changed unless the change is on that exact path.
- **Prior QA comments as proof.** They're previous verdicts, possibly the verdict being re-evaluated. Read them for context, never count them as the author's testing.
- **"I tested it thoroughly" without artifacts.** The claim has to be verifiable against embedded evidence — screenshots, log excerpts, output. If it isn't, treat the surface as untested.
- **Author's exercise transcript as proof.** A curl, log excerpt, or screenshot pasted into the PR body is the author's claim, not your verification. If the PR body says "I ran X and got Y," you run X and confirm Y yourself, or you treat that surface as untested. Re-reading the transcript is not re-running it.

## What "verify" looks like

The verification is whatever the change calls for:

- **UI surface change** → drive it in dev with the Playwright MCP tools (per [.dev/exercising-the-ui.md](exercising-the-ui.md)).
- **API change** → curl the endpoint, inspect the response (per CLAUDE.md "Using HappyHQ's API for verification").
- **SDK / framework bump** → read the upstream changelog for what shifted, probe those specific semantics.
- **Server-side behavior** → trigger the code path, read structured logs (per CLAUDE.md "Debugging Q").
- **Internal-only change** → run the targeted unit test that covers the changed code path.
- **Combination** as the change demands.

There's no enum to dispatch on. Triage describes what to do in prose; execute follows it.

## Phases

- **Triage.** Walks the queue, reads each PR's diff and body, walks the six steps for each, and posts (or edits) a single `QA: triage` comment on each PR with the verification plan. Triage never labels, never posts other comments, never runs smoke. One `QA: triage` comment per PR — edited if it exists, never accumulated.
- **Execute.** The wrapper queries the queue itself and fans out one fresh agent session per PR. Each session reads its assigned PR's `QA: triage` comment, runs the verification, runs smoke if applicable, applies the litmus test, posts a `QA: pass` or `QA: fail` comment, labels, exits. Inter-PR hygiene — clean tree, dev-server stop — is the wrapper's job.

The triage comment is triage's record (the plan); the qa-pass / qa-fail comment is execute's record (the verdict). Execute never edits the triage comment — if it deviates from the plan, it notes the deviation in its own verdict comment.

## Workspace hygiene (when verification drives the UI)

The agent uses the maintainer's `~/HappyHQ/` workspace. Discipline:

- Use stream slug `qa-bespoke-${PR_NUMBER}` for any artifacts created (streams, tasks, uploads). Don't write into existing user streams.
- After verification — pass or fail — `rm -rf ~/HappyHQ/qa-bespoke-${PR_NUMBER}`. Best-effort: cleanup failure doesn't change the verdict, but note it in the comment.

## Comment shapes

### qa-pass

```
QA: pass

What was tested: <one or two sentences — the verification done and how it answered the litmus test>

Evidence: <links / screenshots / log excerpts / what the author tested that we relied on>

Backstop: <smoke PASS in Xs | skipped — non-code PR>
```

### qa-fail

```
QA: fail

What broke: <one or two sentences — failure mode, where it surfaced (verification or smoke)>

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

**Match the verification to the risk.** Smoke is the backstop, not the verification. If a PR changed the chat composer, drive the chat composer. If a PR bumped the SDK, probe the semantics that shifted. A contract test answers a contract risk; a behavioral test answers a behavioral risk.

**Cite evidence, always.** Every comment links or quotes specific artifacts. "QA: pass — looked fine" is never the comment; "QA: pass — drove learning-mode entry, observed brief ack and agent proceeding to learn; smoke PASS in 78s" is.

**Read the author's testing skeptically.** The author's exercise is upstream defense, not blank trust. Look at the embedded evidence and judge whether it covers what could break.

**First-hand or it didn't happen.** Every claim in your qa-pass comment must cite something you did — a file you read, a command you ran, a UI you drove. The author's evidence is upstream defense; your evidence is what makes the pass real. If your comment paraphrases the PR body, you haven't done QA.

**A pass isn't just the label.** The comment is the artifact a future reader uses to understand what was verified. Write it so someone reading the PR a month later understands what the QA loop saw.

## Tuning signal

When the QA loop gets it wrong — passes a PR that broke main, fails a PR that was actually fine — that's a rubric-tuning signal. Edit this file. The next run picks up the change.
