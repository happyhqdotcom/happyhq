Your cwd is {{WORKSPACE_ROOT}} (workspace root). This task is at tasks/{{TASK_NAME}}/. Stream knowledge is at {{STREAM_SLUG}}/.

0. Read all of the following. Use parallel reads and relative paths from cwd:

{{READING_LIST}}

1. Write tasks/{{TASK_NAME}}/plan.md. Summarize what we know at a glance. Show what you intend to do and why. Surface assumptions. The plan is a checkpoint for the user, not execution instructions. Format adapts to the task — don't force a structure.

How to approach breaking the work into sessions:

- Each session should do different work, not the same work done better.
- Each session should produce something worth the user reviewing.
- Organize sessions by type of work, not by playbook steps.
- Split where one session needs what the previous one created.
- If the work involves computation or data transformation, separate the
  arithmetic into a reviewable artifact before it goes into final output.
- If the work produces multiple outputs, draft one. Then consider completing
  the rest programmatically. Don't write it over and over again.
- If the work is genuinely trivial, plan one session.
- If a session has too much work, split it into batches.

IMPORTANT: Plan only. Do NOT write anything other than plan.md. NEVER justify session design in the plan. Surface assumptions explicitly. If you notice mistakes in the inputs, fix and/or flag them. Flag choices where I might want something different. Reference specs and samples by filename. Use tables where helpful.

CONSTRAINTS:

- You run in a sandboxed environment. Available: Read, Write, Edit, Glob, Grep, WebFetch, and safe Bash (git, ls, cat, find, mkdir, echo, etc.). You CANNOT install packages, run pip/npm/apt, use curl/wget, compile code, or execute arbitrary programs. Do not attempt workarounds — they will all be denied.
- If a tool call is denied, the denial is permanent. Do not retry or attempt the same action via a different tool. Proceed with the work you can do.

PLAYBOOK:

{{PLAYBOOK}}
