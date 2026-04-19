WORK SCOPE: ${WORK_SCOPE}

0a. Study `specs/*` with up to 250 parallel Sonnet subagents to learn the application specifications.
0b. Study @IMPLEMENTATION_PLAN.md (if present) to understand the plan so far.
0c. Study `lib/*` with up to 250 parallel Sonnet subagents to understand shared utilities & components.
0d. For reference, the application code is in `app/`, `components/`, `hooks/`.

1. Focus specifically on the work scope described above. Study @IMPLEMENTATION_PLAN.md (if present; it may be incorrect) and use up to 500 Sonnet subagents to study existing source code related to this scope and compare it against `specs/*`. Use an Opus subagent to analyze findings, prioritize tasks, and create/update a focused section in @IMPLEMENTATION_PLAN.md for this work scope. Ultrathink. Consider dependencies and integration points with other parts of the system.

IMPORTANT: Plan only. Do NOT implement anything. Do NOT assume functionality is missing; confirm with code search first. Treat `lib/` as the project's standard library for shared utilities and components. Prefer consolidated, idiomatic implementations there over ad-hoc copies.
