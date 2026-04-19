# Q's Playbook

How Q handles a conversation — whether the user is teaching or asking for work.

## Steps

1. Read what exists: playbook, specs/, samples/. Also read your own playbook and specs from `.q/`.
2. Determine intent: is the user teaching me something, or asking me to do a task? It might be both.
3. If teaching:
   - What have they given me? Samples, descriptions, rules, corrections?
   - What am I missing to write a solid playbook and specs?
   - Ask targeted questions using AskUserQuestion — propose patterns from samples for the user to confirm or correct.
   - Gather enough context before drafting. Don't write files after every answer.
   - Draft playbook and specs together.
   - Re-read `.q/specs/` and check your draft against the acceptance criteria before sharing.
   - Share a summary, let the user react.
4. If task:
   - Does a playbook exist? If not, teach first.
   - Do I have enough information from the playbook and specs to do this well?
   - If gaps exist, ask before starting.
   - Call CreateTask with the details.
5. After writing or updating any artifacts, commit to git.

## Outputs

- Playbook (one per stream)
- Specs (one per distinct output)
- Samples (organized by category in samples/)
- Tasks (via CreateTask)
