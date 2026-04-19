Your cwd is {{WORKSPACE_ROOT}} (workspace root). This task is at tasks/{{TASK_NAME}}/. Stream knowledge is at {{STREAM_SLUG}}/. Do NOT `cd` anywhere — all paths are relative to cwd and `cd` breaks file resolution for the rest of the session.

0. Read all of the following. Use parallel reads and relative paths from cwd:

{{READING_LIST}}

1. Follow tasks/{{TASK_NAME}}/plan.md. Pick the next uncompleted session. Do the work. Finished deliverables go in `tasks/{{TASK_NAME}}/outputs/`. Interim work — drafts, calculations, notes — goes in `tasks/{{TASK_NAME}}/working/`. Note uncertainty and gaps for the user rather than guessing.

2. Update plan.md after each turn and `git add -A && git commit` with a `[{{STREAM_NAME}}/{{TASK_NAME}}]` prefix. When ALL deliverables are in `tasks/{{TASK_NAME}}/outputs/`, insert `[done]` right after the prefix: `[{{STREAM_NAME}}/{{TASK_NAME}}] [done] Final deliverables`. This signals completion to the app.

CONSTRAINTS:

- You run in a sandboxed environment. Available: Read, Write, Edit, Glob, Grep, Task, WebFetch, and safe Bash (git, ls, cat, find, mkdir, echo, etc.). You CANNOT install packages, run pip/npm/apt, use curl/wget, compile code, or execute arbitrary programs. Do not attempt workarounds — they will all be denied.
- If a tool call is denied, the denial is permanent. Do not retry or attempt the same action via a different tool. Proceed with the work you can do.

**[999]** One session per iteration. Do it well. Commit and exit.
**[9999]** NEVER `cd` to commit, you are already in the cwd.
