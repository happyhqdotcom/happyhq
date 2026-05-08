# Learning

How Q classifies, stores, and updates knowledge from user teaching.

## Purpose

Define Q's behavior when the user teaches it something new — whether during initial setup, from a chat in a loaded stream, or after watching Q work on a task. This spec owns the classification problem: when Q receives information, where does it go? It also defines what "good" looks like for the knowledge files Q produces.

This spec covers behavior, not technical configuration. For Q's model (Opus with adaptive thinking), tools, and permissions in learning mode, see Agent Configuration. For sample lifecycle and metadata, see Samples.

**Orientation:** Learning is a **heads-up** mode — Q interacts with the user, asks structured questions, and may wait on a wall-clock answer. It shares heads-up infrastructure (`AskUserQuestion` via `canUseTool` blocking, the pending-questions store, an answer endpoint, an interactive UI surface) with [Discovery](discovery.md). See [Agent Configuration → Mode Orientation](agent-config.md#mode-orientation-heads-up-vs-heads-down) for the axis. Where they differ: learning mutates the _stream_ (playbook, specs, samples); discovery enriches _one task_ (`task.md`).

**Prompt philosophy**: Q's learning prompt is minimal (~30 lines) — context about the filesystem and artifacts, not conversation instructions. The original spike (see `specs/refs/learning-reference/`) showed that Opus with extended thinking naturally reads samples, asks targeted questions, and synthesizes specs — with no personality prompting or phase management. The prompt tells Claude what exists and where things go, not how to have a conversation.

## Classification Principle

When the user provides new information, Q determines where it belongs:

- **Playbook update** — A process change: new step, reordered steps, removed step, different way of doing something
- **Spec update** — A rule or preference change about an existing output
- **New spec** — A new distinct output the user wants to produce
- **Sample** — An example the user provides for Q to learn from
- **Task input** — A file the user wants used for a specific task (brief, raw data, reference material)

The dividing line between playbook and spec: **playbook = what you do, spec = how the output should be.** "Always get client approval before starting the draft" is a playbook step. "The summary section should be under 200 words" is a spec rule. "Use formal tone" is a spec rule — it's about what the output looks like, not how you make it. Granularity matters too: playbook steps are phases of work (gather inputs, make decisions, draft, review), not an enumeration of output sections. If the steps map 1:1 to document sections, the playbook has become a document assembly guide — restructure around the workflow instead.

The dividing line between sample and task input: **sample = something to learn from, task input = something to use for this task.** A finished SOW the user wants Q to study is a sample. A client's pitch deck Q needs to reference while writing a new SOW is a task input. Samples are processed through the intake pipeline (see [Samples](samples.md)) and moved to `samples/`. Task inputs stay in `uploads/` until `CreateTask` is called — then `setupTaskFromChat()` moves them to `inputs/`.

The dividing line between sample and reference material: **sample = an example of the output Q produces, reference material = a document containing rules for the output.** A finished SOW is a sample — Q studies its structure, tone, and patterns. An invoice schedule policy or pricing matrix is reference material — it contains rules to codify into specs. Reference documents are not samples. They don't go through `ProcessSample` and don't live in `samples/`. Q reads them (via subagent if large), extracts the relevant rules, and proposes spec updates through the normal teaching flow.

Q doesn't classify silently. It proposes where information belongs and confirms with the user: "I think this is a rule about your reports — I'll add it to the reports spec. Sound right?" Same propose-and-confirm pattern used throughout the product. If Q is genuinely unsure, it asks rather than guessing.

### File Classification

Not every uploaded file is a sample. Users upload files for many reasons — sharing examples, providing task inputs, giving context for a conversation, sharing something to learn from that isn't a finished deliverable, or just showing Q something. **Q never auto-processes uploads as samples. It reads them, forms a view, and confirms with the user.**

Files can end up in two places on the filesystem: `samples/` (via ProcessSample) or `tasks/{name}/inputs/` (via CreateTask). Everything else just stays in `uploads/` and gets read/discussed — that's a perfectly valid outcome.

When a file is uploaded, Q should:

1. **Read or peek at the file** — use a subagent to extract the first page or section. This is lightweight, not a full ProcessSample.
2. **Consider the context** — what did the user say? What's the conversation about? Are they teaching, requesting a task, or sharing something?
3. **Propose and confirm** — if Q has a clear read on intent ("This looks like a finished report — want me to add it to your samples?"), propose it. If intent is unclear, ask via AskUserQuestion with simple options.
4. **Act on confirmation** — sample → ProcessSample. Task input → hold for CreateTask. Reference material → read the full doc (via subagent if large), extract rules, propose spec updates. Just sharing → Q reads it, uses it in conversation, done.

The goal is to let Opus use judgment, not to build a rigid decision tree. A user who says "here's an example of our SOW" is clearly sharing a sample. A user who says "write me a proposal based on this" is clearly providing a task input. A user who says "here are our billing rules" or "invoice logic" is sharing reference material — Q reads it, extracts the rules, and proposes spec updates. A user who just drops a file with no message — Q should peek at it and ask.

This applies to the preamble too. When Q starts a session and finds files in `uploads/`, it peeks at them and asks the user what they're for rather than auto-processing them as samples.

## The 1-Spec-1-Output Principle

Each distinct output a stream produces gets its own spec. If the user produces weekly reports, update notes, and executive summaries, each gets a separate spec file. A spec governs one output. Sections within an output belong in one spec — they're structure, not separate outputs.

When a user describes something that sounds like a new output, Q creates a new spec. When they describe a rule about an existing output, Q updates that spec. The test: "Is this a new thing Q produces, or a rule about an existing thing Q produces?"

## What Good Knowledge Files Look Like

### Playbooks

The playbook is the high-level walkthrough of how the work gets done. If you sat the user down and said "walk me through this," the playbook is what they'd tell you — the play by play, kept simple.

Quality signals:

- **Lean.** A complex use case should still fit in under 30 lines. If the playbook is getting long, detail is leaking in that belongs in specs.
- **User's voice.** Written the way the user describes their work, not in Q's voice or formal documentation style. "Look at everything we know about the client" not "Review all available client documentation."
- **Numbered steps.** Process has order. Steps make that explicit.
- **Points to specs for detail.** The playbook says "Draft each section that applies. Check samples to see how similar deals handled it." The spec says exactly what each section should contain.
- **Includes an Outputs section.** States what the work produces — the deliverable(s).

### Specs

Specs are prescriptive and exhaustive. They define what makes a good output — requirements, rules, format, quality criteria. Q reads these during task execution and follows them.

Quality signals:

- **Organized by output structure.** If the output has sections, the spec is organized by those sections. Each section gets its own rules.
- **Concrete rules, not vague guidelines.** "Summary under 200 words" not "keep the summary concise." "Never use 'comprehensive,' 'robust,' or 'thorough'" not "avoid vague adjectives."
- **Quality signals embedded.** Banned words lists, quality checklists, before/after transform tables. These go directly in the spec, not in a separate document.
- **Examples where they help.** Show what good looks like. Auto-transform tables are a good pattern: input "comprehensive review" → output "review of [specific systems listed]." Before/after examples make abstract rules concrete.
- **Inputs needed to produce this output.** What Q needs to start — listed explicitly so it knows what to ask for at task time.

### Samples

Q stores samples and annotates them with metadata so it knows when and why to reference each one. For full sample lifecycle — intake, format handling, metadata generation, and indexing — see the Samples spec.

## Teaching Flow

Teaching follows the same flow regardless of how it starts. The user opens a chat and says "add a rule about headers." The user sees Q produce bad output and says "that's wrong, headers should be H2." The user is mid-setup and mentions a preference. All three enter the same path:

1. **Q receives information** — from chat, from file drops, from corrections
2. **Q classifies** — determines where it belongs (playbook, spec, new spec, sample) using the classification principle
3. **Q proposes** — tells the user what it plans to do: "I'll add this to your reports spec" or "This sounds like a new output — want me to create a spec for executive summaries?"
4. **Q confirms** — waits for the user to agree or redirect
5. **Q updates** — writes the file(s)
6. **Q confirms the change** — tells the user what was created or modified: "I've updated the reports spec to require H2 headers for all sections"
7. **Q commits** — versions the change to git (see [Git Layer](git-layer.md) for conventions)

No separate code paths for deliberate teaching ("I want to add a rule") vs. reactive teaching ("that was wrong"). The flow handles both.

For production-quality artifacts (specs and playbooks), Q delegates to the Drafting subagent — a read-only agent that takes a synthesized brief and produces output matching acceptance criteria from `.q/specs/`. See [Agent Configuration](agent-config.md) for Drafting's configuration.

## Orientation

Every new chat session starts by reading what already exists: `playbook.md`, `specs/`, `samples/`. Q adapts its approach based on what it finds:

- **Empty stream** (no playbook, no specs, no samples): First session. Follow the first-session flow below — samples first, interview.
- **Partial stream** (some artifacts exist): Read existing artifacts before responding. Acknowledge what's there, identify gaps, focus questions on what's missing. Don't re-interview from scratch.
- **Established stream** (playbook + specs + samples): The user is here to refine, add a spec, provide more samples, or create a task. Read existing artifacts to orient, then respond to their specific request.

## First Session

Empty stream — no playbook, no specs, no samples. No special mode, just a chat where Q starts from scratch.

### First-Time Onboarding

When a user has never chatted with Q before — across any stream — Q opens with a brief, down-to-earth explainer of how Q works before diving into the teaching interview. The goal is to set expectations and frame the relationship, not to onboard through a formal tutorial.

**Detection:** The server checks whether the user has any chat sessions with messages across all streams. If not, the learning prompt receives a signal (e.g. `{{IS_FIRST_CHAT}}` or an addition to `{{STREAM_CONTEXT}}`) indicating this is a first-time user. Once the user has had one conversation, this never triggers again.

This covers:

- Brand-new user (no streams) — obviously new
- User who imported streams or used a template but never chatted — still new to Q
- User on their 5th stream who has chatted before — no explainer, straight to normal flow

**What the explainer covers** (intent, not exact wording — Q decides tone):

- Frame Q as a teammate: "teach me like I'm a teammate sitting next to you"
- The user starts by explaining a type of work — proposals, SOWs, reports, whatever they do. If the user already shared or uploaded something, Q references that specific thing.
- Q will ask lots of questions to learn how the work gets done
- Once Q understands enough, it drafts a Playbook (the process) and Specs (the rules for each output) — these guide every future task
- Q will get things wrong. That's expected. The user gives feedback, Q updates the playbook or specs, and the mistake won't happen again
- Samples (real past examples of finished work) are the highest-leverage way to teach Q — Q learns exactly how the user does it
- Close with an invitation: any questions about how this works, or ready to dive in? (via AskUserQuestion)

**Constraints:**

- Brief and conversational — a few short paragraphs, not a wall of text
- Super down to earth. Not corporate onboarding — a colleague explaining how they like to work together.
- Hit the key mental models (playbook vs specs, feedback loop, samples) and move on
- Don't over-explain. Trust that the user will learn by doing.

**Transition:** After the explainer (and any Q&A about the process), Q flows into the samples-first interview below. The explainer is a preamble, not a replacement for the normal first session.

### Samples-First

Samples are the highest-leverage teaching input. A finished deliverable gives Q something concrete to reverse-engineer — structure, tone, formatting, sections, patterns. Instead of making the user articulate everything, Q can propose and the user can confirm or correct.

Q strongly encourages samples early in the first conversation. It explains why they help ("If you share an example, I can learn your format and ask much better questions"). Q works with whatever the user has — finished work, rough drafts, partial examples. Only if the user genuinely has nothing does Q fall back to a purely conversational interview.

When Q receives samples, it analyzes them and uses what it finds to drive the rest of the conversation: "I notice these always start with a summary section, use consistent headers throughout, and end with next steps. Is that your standard structure?" See [Samples](samples.md) for intake pipeline and storage.

### Interview Goals

Q's questions emerge from the material at hand — samples, user descriptions, or both. No fixed question list. But Q has clear goals:

- **Output shape** — What the deliverable looks like: structure, format, sections, tone, length
- **Process** — How the work gets done: steps, order, decision points, inputs needed
- **Rules** — Standards and preferences: things to always do, never do, common pitfalls
- **Variation** — Where outputs differ between instances and what drives those differences

### Interview Principles

- **Propose and confirm over open-ended questions.** "I see you use a 3-section format with a summary up front. Is that right?" beats "How do you structure these?" The user corrects a proposal faster than they describe from scratch.
- **Use samples to generate targeted questions.** Don't ask generic questions when you have concrete material. Every sample is a source of specific, useful questions.
- **Synthesize, don't transcribe.** Connect dots across answers. If the user says "I always start with what changed this week" and later mentions "the opening needs to be scannable," Q links those: "So the opening is a quick summary of what changed, easy to skim?"
- **Adapt to the user's speed.** A user who drops five files and types detailed descriptions gets rapid analysis and fewer basic questions. A tentative user who types one word gets guided step by step toward samples and specifics.

### Gather, Draft, Review

Q doesn't write files after every answer. It gathers enough context, then drafts.

1. **Gather** — Q asks questions until it has a solid understanding of the work. No fixed number — Q judges readiness based on the interview goals above.
2. **Draft** — Q synthesizes interview findings through the lens of the target quality spec, then delegates writing to the Drafting subagent (see [Agent Config — Drafting](agent-config.md#craft)). Q gut-checks Drafting's output against the interview context before sharing a summary in chat. The user reacts to a coherent draft, not piecemeal fragments.
3. **Review** — The user reviews Q's draft. They may provide feedback for Q to iterate on, or they may be happy with the first draft.
4. **Commit** — Q commits the initial artifacts to git: playbook, specs, and samples in one commit (see [Git Layer](git-layer.md)).

The user may go straight from draft to done, or they may iterate several times — adding specs, refining the playbook, providing more samples. Q follows the user's lead.

### Task Creation

When the user wants Q to do something, Q checks the playbook and relevant spec to understand what the task needs, then asks questions to make sure it has everything. If the user would rather Q work with what it has, that's fine — Q creates the task with whatever context is available.

CreateTask is the last thing Q does for a given task. The `textContext` parameter is the only thing the planning agent sees from the learning conversation — planning reads cold from disk with no access to the chat. Q does not continue discussing the task after the Start Task card appears.

Q never produces deliverables in a learning chat. All work happens in tasks.

## Proactive Gap Identification

When Q encounters ambiguity or missing information during task execution, it notes this in its output: "I wasn't sure whether the summary should include financials — you might want to teach me about this." The user sees it when reviewing task output and can choose to teach Q or not.

This costs almost nothing to implement (it's a line in the working prompt) and demonstrates Q's self-awareness about its own gaps.

## Conflict Resolution

When new teaching contradicts existing content, Q is transparent:

"Your current spec says pricing should be formatted as a table. Want me to change that to bullet points? This will apply to new tasks — existing outputs won't change."

Q proposes the change, notes what it affects, and lets the user decide. No significance threshold — Q doesn't try to judge whether a change is "big" or "small." The user is always the judge.

## Git Integration

Q commits all knowledge changes to git via bash tool calls (see [Git Layer](git-layer.md) for conventions). Every teaching interaction creates a versioned trail: what changed and when.

## Design Decisions

**Principle-based classification rather than rigid rules.** Playbook = process, spec = output rules. This is a heuristic, not an algorithm. Q is an LLM — it handles ambiguity well with a clear principle and the propose-and-confirm pattern as a safety net. A rigid decision tree would be over-specified and brittle across different types of work.

**Propose and confirm rather than silent classification.** Q never silently files information. It always tells the user where it's putting something and why. This builds trust, catches mistakes, and teaches the user how Q organizes knowledge. Same pattern used throughout the product — consistency over cleverness.

**Same flow for all teaching entry points.** Whether the user is in setup, in a chat, or correcting post-task output, the underlying mechanics are identical: classify → propose → confirm → update → confirm change. One code path, not three. Different entry points just provide different context for classification.

**Quality standards in the spec, not just the prompts.** Prompts implement what specs define. If the spec doesn't say what a good playbook looks like, the prompt author is guessing. Light guidance here (lean, user's voice, numbered steps) gives Ralph enough to build good prompts without over-constraining format.

**Proactive gap identification as a light touch.** Q noting "I wasn't sure about X" in task output is almost free — a prompt instruction, not a system feature. But it's high-value for demos (Q shows self-awareness) and for the teaching loop (user sees what Q needs to learn).

**No significance threshold for conflicts.** Q doesn't try to judge whether a change is major or minor. That's a fuzzy classification problem that adds complexity without value. The user is always shown what's changing and always decides. Simple transparency beats smart judgment.

**No separate "setup" mode for the first session.** The first chat is just a chat where Q starts with an empty stream. The same teaching flow handles it — classify, propose, confirm, update. The only difference is that Q creates artifacts from scratch instead of updating them. No special code path, no "setup complete" transition.

**Samples-first rather than questions-first.** Samples give Q concrete material to reverse-engineer — structure, tone, patterns. This flips the dynamic from "user articulates everything" to "Q proposes, user confirms." It's faster, produces better results, and generates smarter interview questions. Strongly encouraging samples (rather than requiring them) handles users who genuinely don't have examples yet.

**Goals and principles rather than prescribed questions.** A fixed question list becomes a form disguised as a conversation. Goals describe what Q needs to learn; principles describe how Q behaves while learning it. This lets Q adapt — samples from a power user generate very different questions than a single keyword from a new user.

## Acceptance Criteria

- [ ] Q classifies new information into the correct category (playbook, spec, new spec, sample, task input)
- [ ] Q proposes where information belongs before writing it — never silently classifies
- [ ] Q confirms what files were created or modified after every teaching interaction
- [ ] Q creates a new spec when the user describes a new distinct output
- [ ] Q updates an existing spec when the user provides rules about an existing output
- [ ] Q updates the playbook when the user describes process changes
- [x] Teaching flow works from the Desktop's island composer
- [x] Teaching flow works as corrections after reviewing task output
- [ ] Q handles contradictory teaching by showing the conflict and letting the user decide
- [x] Changes from teaching are committed to git
- [ ] Playbooks produced by Q are lean, in the user's voice, and use numbered steps
- [ ] Specs produced by Q are prescriptive with concrete rules and embedded quality signals
- [ ] Q notes uncertainties in task output for the user to address
- [ ] In the first session, Q asks for samples early and explains why they help
- [ ] When samples are provided, Q analyzes them and asks targeted questions based on what it found
- [ ] Q falls back to conversational interview when user has no samples
- [ ] Q gathers context before drafting — does not write files after every answer
- [x] Stream directory is created automatically when user submits their first message from the home composer (see [Home](home.md))
- [ ] Q drafts a playbook and at least one spec, then shares a summary in chat
- [ ] User can review and provide feedback; Q iterates on the draft
- [ ] Initial artifacts (playbook, specs, samples) are committed in one git commit
- [ ] Q reads existing artifacts before responding in a new chat — never assumes an empty stream

## Testing

App-level behaviors tested through other specs:

- [x] Chat-based teaching flow: message send, streaming, tool calls (`stores/chatStore.test.ts`)
- [x] `AskUserQuestion` via canUseTool: blocks on pending-question store, returns answer (`lib/chat/pending-questions.test.ts`)
- [x] `CreateTask` via canUseTool: blocks on pending-confirmation store (`lib/chat/pending-confirmations.test.ts`)
- [x] Stream file read/write: playbook.md, specs/, samples/ (`lib/fs/read.server.test.ts`, `lib/fs/write.server.test.ts`)
- [x] Agent options: learning mode Opus + adaptive thinking + MCP server (`lib/agents/config.server.test.ts`)
- [x] ProcessSample input validation: PDF-only, missing file rejection (`lib/agents/tools.server.test.ts`)
- [x] Q knowledge base seeding: .q/ dirs and seed files (`lib/q/seed.server.test.ts`)
- [x] Drafting agent definition included in learning options (`lib/agents/config.server.test.ts`)

Not tested (prompt compliance — not app-testable):

- Q classifies new information into correct category (playbook, spec, new spec, sample, task input)
- Q proposes before writing, confirms after writing
- Q handles contradictory teaching transparently
- Quality of playbooks and specs produced by Q
- First-session samples-first behavior and interview goals
- Gather-then-draft pattern (not writing files after every answer)

## Edge Cases

- **Ambiguous classification**: Q proposes its best guess and asks. "This could be a playbook step or a spec rule — I think it's about how the output should look, so I'd put it in the reports spec. What do you think?"
- **User provides information that spans multiple files**: Q breaks it up. "I'm going to add the process steps to the playbook and the formatting rules to the reports spec." Proposes the split, confirms.
- **User teaches something that contradicts across files**: Q surfaces the full conflict. "Your playbook says to always include financials, but your reports spec says the summary section shouldn't have numbers. Want me to update one of these?"
- **User wants to teach during a running task**: Q can only do one thing at a time (see Agent Config). If Q is working on a task, it's not available for teaching. The user stops the task, teaches Q, then restarts. This is an architectural constraint, not a design choice.
- **Very large teaching dump**: Q synthesizes and proposes multiple updates. Doesn't try to process everything in one confirmation — breaks it into logical chunks the user can review.
- **User says something Q can't classify at all**: Q asks. "I'm not sure where this fits — is this about how you do the work (playbook) or about what the output should look like (spec)?"
- **First session — user provides very little info**: Q still generates a minimal playbook and pushes for samples. Better to start with something and refine than to block progress.
- **First session — user dumps a lot of info at once**: Q synthesizes and organizes — doesn't just copy. Proposes playbook structure and spec topics based on what it found.
- **First session — user wants to start a task before teaching feels "complete"**: Allow it. A playbook is enough to attempt a task. Q can signal that more teaching will improve results.
- **Returning to a stream with existing artifacts**: Covered by orientation — Q reads existing files and adapts before responding.

## Constraints

- Teaching is always through conversation with Q. No direct file editing in the UI.
- All knowledge files are plain markdown on the filesystem (see Filesystem Layout spec).
- Chat sessions are SDK-persisted (see [Agent Configuration](agent-config.md)). Q can also read existing files to understand current state independently of conversation history.
- Q's learning mode configuration (Agent Config) powers teaching conversations. This spec defines the behavior; Agent Config defines the technical configuration.
- Learning mode is entered explicitly — either by Q's suggestion or the user's toggle. It is not the default chat mode. See [Chat Modes](chat-modes.md) for the mode system, transitions, and how the system prompt switches between general and learning.
