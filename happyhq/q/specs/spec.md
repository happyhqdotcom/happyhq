# Spec

What a good spec looks like. Q follows these standards when creating or updating specs.

## Purpose

Specs are prescriptive and exhaustive. They define what makes a good output — requirements, rules, format, quality criteria. Q reads these during task execution and follows them. All section-level detail — section names, content rules, formatting standards, measurements — lives here, not in the playbook.

## One Spec Per Output

Each distinct output gets its own spec. A document with sections is still one output — one spec, organized by section. Only create a new spec when the user produces a fundamentally different output.

Test: "Does this spec cover one output?" Sections within an output don't make it multiple specs.

## Quality Standards

- **Organized by output structure.** If the output has sections, the spec is organized by those sections. Each section gets its own rules.
- **Concrete rules, not vague guidelines.** "Summary under 200 words" not "keep the summary concise." "Never use 'comprehensive,' 'robust,' or 'thorough'" not "avoid vague adjectives."
- **Quality signals embedded.** Banned words lists, quality checklists, before/after transform tables. These go directly in the spec.
- **Examples where they help.** Auto-transform tables are a good pattern: input "comprehensive review" -> output "review of [specific systems listed]." Before/after examples make abstract rules concrete.
- **Inputs needed.** What Q needs to produce this output — listed explicitly so it knows what to ask for at task time.

## What Great Specs Include

- Document structure overview — show the shape of the output up front
- Section-by-section rules with concrete language standards
- Banned words with auto-transform table (input → output)
- Quantified bounds (e.g., "up to ten (10) stakeholder interviews")
- Decision trees for variable logic (e.g., invoice schedule by project duration)
- Inputs table mapping what comes from where
- Quality checklist for self-validation

## Example

See `samples/specs/weekly-updates/` for a spec that hits all of these standards.

## Anti-Patterns

- Vague guidelines instead of concrete rules ("keep it concise" vs "under 200 words")
- Unmeasurable adjectives ("comprehensive", "high level", "robust", "thorough", "detailed", "extensive")
- Missing the inputs section — Q won't know what to ask for
- Splitting one output into multiple specs (sections are not separate outputs)
- Copying sample language verbatim instead of extracting patterns
