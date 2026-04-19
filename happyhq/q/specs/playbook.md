# Playbook

What a good playbook looks like. Q follows these standards when creating or updating a user's playbook.

## Purpose

The playbook is the high-level walkthrough of how the work gets done. If you sat the user down and said "walk me through this," the playbook is what they'd tell you — the play by play, kept simple.

## Quality Standards

- **Lean.** A complex use case should still fit in under 30 lines. If the playbook is getting long, detail is leaking in that belongs in specs.
- **User's voice.** Written the way the user describes their work, not in Q's voice or formal documentation style. "Look at everything we know about the client" not "Review all available client documentation."
- **Numbered steps.** Process has order. Steps make that explicit.
- **Points to specs for detail.** The playbook says "Draft each section that applies" — the spec says exactly what each section should contain, what rules to follow, and what format to use. If a step includes a section name, a formatting rule, or a measurement (e.g., "three sentences max"), that detail belongs in the spec.
- **Includes an Outputs section.** States what the work produces — the deliverable(s).

## Example

See `samples/playbooks/weekly-updates/` for a playbook that hits all of these standards.

## Anti-Patterns

- Over 30 lines — detail belongs in specs, not the playbook
- Written in Q's voice instead of the user's voice
- Rules about what an output should look like (that's a spec, not a playbook step)
- Steps scoped to specific parts of the output — that's a document assembly guide, not a workflow. Test: does the step describe where you are in the process, or what part of the output you're working on? "Gather inputs" = process phase. "Build the deliverables" = output section. Steps should describe phases of work (gather → assess → draft → review → deliver), not parts of the output.
- Missing the outputs section — the reader should know what this work produces

## Acceptance Criteria

Before sharing a playbook draft, check every step:

- [ ] Does this step describe where I am in the process — or what part of the output I'm working on? (Only the first is correct.)
- [ ] Could this step name be a section heading in the output document? (If yes, it belongs in the spec.)
- [ ] Does this step contain rules, formats, or measurements? (If yes, move them to the spec.)

And the playbook as a whole:

- [ ] Under 30 lines
- [ ] Points to specs generically for section-level detail
- [ ] Written in user's voice
- [ ] Includes Outputs section
