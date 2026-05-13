# Bug Rubric

Source of truth for how Ralphie judges open `bug`-labeled issues. Both `PROMPT_bugs_triage.md` and `PROMPT_bugs_fix.md` load this file. Edit here, not in the prompts.

## The litmus test

Approach every bug as an engineer who cares about the quality of both the user experience and the developer experience. Ask one question:

> **Am I fixing the right thing, the right way?**

Everything else in this rubric is how to answer that honestly. A bug report is the reporter's best guess at what's wrong and where — it's not a script to execute. The work is to figure out what's actually broken, decide whether and how to respond, and see the fix through.

## How to answer the litmus test

For every bug, walk these:

1. **Reproduce it.** The report describes a symptom. Get the symptom to happen — or get as close as the available logs and code allow.
2. **Read the code.** Trace symptom to cause. Don't trust the report's hypothesis; verify it. Look for prior art on this surface — recent issues with the same shape, in-flight PRs, specs documenting the affected behavior.
3. **Form an opinion.** Sometimes the report is right. Sometimes the symptom is real but the cause lives somewhere else. Sometimes the described behavior is intentional. Your read is the value-add.
4. **Write the right fix.** The "right thing" is the real cause, not the symptom — don't band-aid past it if the underlying problem is what's broken. The "right way" is the change that leaves the system simpler and clearer than you found it.
5. **Validate.** Exercise the user-visible contract at the surface where it lives — code-only checks (lint/types/tests) prove the plumbing; this proves the behavior. For a behavior fix, induce the failure and confirm the new state. For a behavior-preserving fix, drive the happy path on each surface you touched. Sweep for adjacent regressions.
6. **Assess the diff.** With the actual change in hand, judge review risk. The size of the diff is a rough proxy; what touched and how it's tested is the real signal.

Then ask the litmus test again. The honest answer takes one of four shapes — **ship**, **split**, **rescope**, or **skip**.

## The four outcomes

### Ship — `ralphie:fixed-in-pr`

The fix addresses the real cause, the diff is reviewable as one PR, and you can defend it. Open the PR.

A PR is reviewable when one of:

- Under threshold (≤10 files changed, ≤300 net lines added, excluding `*.md`/`*.mdx`).
- Over threshold but low risk: mechanical / codemod-shaped, behavior-preserving, well-covered by tests, or clustered outside critical surfaces. Add a "Why this is over threshold but low risk" section to the PR body.

### Split — `ralphie:split-into-children`

The right fix is over threshold _and_ high risk — touches critical surfaces (`lib/run/`, `lib/database/`, `lib/fs/`, `lib/actions.ts`, server actions, agent orchestration, auth, billing), mixes unrelated concerns, or changes behavior without test coverage that pins it. Shipping it as one PR puts review beyond what one human can responsibly do.

Don't push the over-size PR. Instead:

1. Identify the split axis from the diff — usually "fix the immediate symptom" vs "fix the underlying cause," or "fix per surface" when one bug shows up in multiple unrelated places.
2. For each child: `gh issue create --label bug --title "<parent title> — <axis slice>" --body "..."`. Body must include `Split from #<parent>.`, the scope of this child, and the reproduction narrowed to that scope.
3. Comment on the parent listing the children: "Split into #X, #Y by `<axis>`. This parent stays open until all children close."
4. Apply `ralphie:split-into-children` to the parent. Revert the working branch. Exit. Next iteration picks up the children.

### Rescope — `ralphie:skip-needs-rescope`

The framing is wrong: the symptom has a different cause than the report assumes, or the described behavior is intentional and not a bug.

File a rephrased child issue: `gh issue create --label bug --title "<rephrased title>" --body "..."`. Body includes:

- `Rephrased from #<original>` with link.
- **What the report described:** quote the symptom.
- **What the loop saw:** file:line evidence for the actual cause (or evidence the behavior is intentional).
- **Why the framings differ:** one paragraph mapping the reporter's hypothesis to your reading.
- **Suggested fix** (if applicable): 2–3 bullets — the smallest change that would address the actual cause.

Comment on the original with a clear undo path: "Filed `#<new>` with what I think is the correct framing. If I got this wrong, close `#<new>` and remove the `ralphie:skip-needs-rescope` label here to put this back in the queue." Apply the label. Revert any working branch. Exit.

If the original is purely "this isn't a bug, it's intentional" and there's no underlying concern worth tracking, the new issue is optional — comment-and-skip is enough. Use judgment.

### Skip — various `ralphie:skip-*` labels

Bail before engagement when the issue isn't workable. In rough order:

- Fix would touch `happyhq/ee/` → `ralphie:skip-ee`.
- Reporter isn't OWNER/MEMBER and the report lacks repro details a third party would need to provide → `ralphie:skip-third-party-unclear`.
- Issue body or comments contain unresolved questions for the maintainer → `ralphie:skip-needs-decision`.
- Requires a schema migration, new env var, new dependency, or `.github/`/CI/workflow change → `ralphie:skip-out-of-scope`.
- No reasonable repro can be inferred from issue + linked logs, or the repro couldn't be established locally → `ralphie:skip-not-reproducible`.
- Clearly enormous on a quick code search — well over the size threshold before even starting → `ralphie:skip-too-big`. (Borderline cases: engage and decide at step 5.)
- After fixing: `pnpm format` / `pnpm lint` / `pnpm check-types` / `pnpm --filter=happyhq test` failed twice → `ralphie:skip-verification-failed`.
- After fixing: the exercise step couldn't confirm the user-visible contract (failure didn't reproduce, new state didn't appear, regression visible after one rework, or surface unreachable after a concrete reproducer attempt) → `ralphie:skip-cannot-verify`.

A `ralphie:*` label is terminal. The maintainer removes it to re-queue.

Every skip writes one comment:

```
Ralphie skipped this for: <rubric reason name>

What I saw: <1–3 sentences — the specific evidence in the issue/code that triggered the skip>

What would unblock it: <1 sentence — the concrete action that lets the next run pick this up>
```

The comment is for the human reading the queue; the label is for the next Ralphie. Rescope and split have their own comment shapes — see those sections above.

## Pitfalls — things that look like the right answer but aren't

These are failure modes we've seen. Name them when they apply; reject them.

- **Band-aiding the symptom.** The report describes a visible symptom, you patch the visible symptom, the underlying cause is still there. If the real problem is elsewhere, the right move is to fix elsewhere (or rescope to file the issue against the real cause). Smaller isn't better when smaller is wrong.
- **Splitting when you should rescope.** Splitting is for "the right fix is too big to review as one PR." Rescoping is for "the report is asking for the wrong fix." If the framing is off, splitting just produces several wrong-shape PRs.
- **Rescoping when the fix is two lines.** If you can ship the right fix in a few lines, ship it. Rescope is for cases where the report's framing actively blocks a workable fix.
- **Trusting the reporter's hypothesis.** "User says X is broken because of Y" — verify Y. Reporters describe what they see; the cause is yours to determine.

## Hard constraints (never violate)

- Never push to `main`. Never force-push. Never `--no-verify`.
- Never modify files under `happyhq/ee/`, `.github/`, CI workflows, lockfiles (beyond what a focused fix demands), or licensing files.
- PRs always target `main`, branch from `main`, use the `fix/` prefix, and include `Closes #<issue>` plus an AI-assistance disclosure.
- One outcome per session. After labeling, opening a PR, splitting into children, or filing a rephrased child issue, exit.

## Principles

These tune _how_ the work gets done. Not gates.

**Simple, maintainable, understandable.** This is the bar for every fix. If the change makes the system harder to read, harder to change later, or harder for the next person to hold in their head, it's the wrong shape — even if it makes the symptom go away. Optimize for the reader who shows up six months from now with no context.

**When triage is ambiguous, lean toward eligible.** The fix loop has its own gates — false eligibility is cheaper than false skip. A wrong skip closes a door on a real issue; a wrong eligible just means the fix loop does the extra evaluation and bails if it has to.

**Pattern fit, not pattern match.** If prior art fits, follow it. If it doesn't, don't deform the fix to make it fit. Think about the most appropriate decision given the user experience and the developer experience.

**If you reach for a constraint, look for the cause.** When the fix would be a cap, limit, truncate, or hide, the unbounded behavior has a cause — find it and fix the cause, even when it lives in nearby code. Scope follows the cause: touch nearby code when it's the cause, leave it when it's just adjacent and looks improvable.

**A fix isn't just the diff.** Leave the surrounding code consistent with the change. If the fix changes documented behavior, update the spec in the same PR. If you notice a pattern across recent issues, surface it for the maintainer. If you skip, leave a rationale specific enough that a human can act on it without re-investigating.

**Capture the why, not the what.** Put the why in the PR body and (if non-obvious) in a code comment. Never narrate what in comments — well-named code does that.

**Tests defend behavior, not lines.** Apply `testing.md`'s litmus: "what bug would this catch?" If the only answer is "someone reverted this exact line" — hardcoded asset paths, class names, copy strings, "this element exists" assertions — it's a vanity test. Skip it. Asset swaps, copy tweaks, and CSS-only fixes are visually verified, not test-locked. If you cannot articulate a user-visible contract the test defends, the fix is either too trivial to need a test, or you haven't found the right contract yet — re-think before writing one.

Tests verify behavior — what the system guarantees to the user. 50 different implementations should pass the same test. Test conditional rendering driven by state, input/output contracts, error paths, security boundaries. Never `toBeTruthy()`, snapshots, "renders without crashing", asserts on specific src/href/class/copy values, or "mock was called" (unless the call IS the contract).
