# Git Layer

How Q's work is versioned invisibly using git.

## Purpose

Define how git operates as the invisible infrastructure layer. Users never see git — no git terminology, no commit hashes, no branch names in the UI. Git is completely invisible — it's versioning infrastructure, not a user feature.

## Responsibilities

Git work is split between the app and Q:

- **App**: Initializes the repo on first launch. This is the only app-level git code.
- **Q**: Commits its own work via bash tool calls (git CLI) as part of the workflow. The prompts and playbook instruct Q when and how to commit.

### App — Repository Initialization

On first launch, the app:

1. Runs `git init` at `~/HappyHQ/` if no repo exists (idempotent — succeeds if repo already exists)
2. Writes `.gitignore` at the repo root
3. Configures the local repo author:
   ```
   git config user.name "Q"
   git config user.email "q@happyhq.com"
   ```
4. Creates an initial commit after the directory structure is created
5. No remote configured (local only)

### App — Committing User-Initiated Changes

Server actions for create, rename, and delete operations (`createStream`, `createTask`, `renameStream`, `deleteStream`, `deleteTaskByLocation`) commit after the filesystem change completes. Commit messages follow the same `[stream/task]` convention Q uses:

- `[slug] Create stream`
- `[stream/task] Create task` (or `[task] Create task` when no stream)
- `[slug] Rename stream from old-slug`
- `[slug] Delete stream`
- `[task] Delete task`
- `[stream/task] Plan accepted` — committed when the user approves the plan (not by Q)

Best-effort — failures are logged, not thrown. These commits produce clean separation between user-initiated structural changes and Q's work commits.

### Q — Committing Work

Q runs `git add -A` and `git commit` via bash tool calls as part of doing the work. `git add -A` stages everything in the repo — simple, no path tracking needed. If a user edit gets swept into Q's commit, that's fine; the file is still versioned correctly. The commit conventions and timing are defined in the Commit Strategy section below. Q's prompts include these instructions so it commits at the right moments.

## .gitignore

A `.gitignore` at the repo root to exclude:

- `.DS_Store`
- `Thumbs.db`
- `.chats/` — Root-level chat session metadata and upload staging. Not work product. Uploads live inside `.chats/{sessionId}/uploads/` — they're excluded by this rule. Once classified, files move to git-tracked destinations (`{stream}/samples/` or `tasks/{task}/inputs/`). There are no stream-level `.chats/` directories — all chats live at root. See [Filesystem Layout](filesystem-layout.md).

All user content (playbooks, specs, samples, inputs, working, outputs) is tracked. See [Filesystem Layout](filesystem-layout.md) for the full directory structure.

## Commit Strategy

### When Commits Happen

Q commits after meaningful writes — when it has completed a logical unit of work. Natural commit points include: after initial teaching produces artifacts, after teaching updates, after task creation, after each execution step, and after run completion. These are guidelines for Q's prompts, not an enumerated lifecycle the app enforces.

Plan acceptance is an app-level commit, not a Q commit. When the user approves the plan, the app commits with `[stream/task] Plan accepted` before starting working mode. Q does not commit `plan.md` at the end of planning.

When starting a new run, Q wipes `working/` and `outputs/`, does the work, and commits the result — the wipe and the new content are one commit, not separate.

### Commit Message Convention

Simple, structured, readable. The `[stream/task]` prefix makes `git log` scannable.

```
[stream-name/task-name] What Q did
```

The stream name comes from the task's `task.md` frontmatter (`stream` field), not from directory nesting. For tasks without a stream assignment, the prefix is just the task name: `[task-name] What Q did`.

On the final working iteration — when all deliverables are written to `outputs/` — Q appends `[done]` to the commit message. This is the app's completion signal: after each iteration, the loop runs `git log --format='%s' -1 -- tasks/{taskName}` and stops when it sees `[done]`.

**Examples**:

```
[sow-generator] Stream setup complete

[sow-generator] Update playbook with pricing rules

[sow-generator/bridgeway-sow] Create task and plan

[sow-generator/bridgeway-sow] Plan accepted

[sow-generator/bridgeway-sow] Extract facts from pitch deck

[sow-generator/bridgeway-sow] Draft deliverables section

[sow-generator/bridgeway-sow] Write final output [done]
```

### Commit Author

All commits are authored by Q:

```
Q <q@happyhq.com>
```

The app configures this in the repo's local git config during initialization, so Q's bare `git commit` calls use the right identity without needing `--author` flags.

### Atomic Commits

Each commit represents one logical unit of work:

- One teaching update (playbook change, spec change)
- One execution step (one plan item completed)
- One run completion (final outputs written)

If a step fails, Q does not commit the broken state. Best-effort — if Q misses a commit or gets interrupted, the uncommitted files remain on disk and get picked up in the next commit.

## Scope

Git is completely invisible:

- No git-related UI elements
- No run history browsing (the user sees only the current/latest state)
- Commits happen automatically — the user has no control or awareness

The one place git has indirect visibility: if the user opens `~/HappyHQ/` in Finder, they'll see a `.git` directory (hidden by default on macOS). This is fine — power users will understand, and non-technical users won't notice.

## Design Decisions

**Git instead of a database or file timestamps.** Proven versioning, diffing, and history — run comparison and version rollback come free when needed. Git is battle-tested for exactly this kind of file-level change tracking.

**Git CLI via agent bash tools instead of a library.** Q already has bash access via the Agents SDK. Git is just another CLI tool available in the environment — no need for a wrapper library like `simple-git` or `isomorphic-git`. Using the CLI directly gives full git compatibility and avoids adding a dependency to solve a problem (git access) that's already solved by the agent's tool environment. macOS ships with git (or installs it on first use via Xcode Command Line Tools), so no user setup required.

**Best-effort commits.** Git is invisible — no UI depends on commit-level granularity. If Q misses a commit, the files are still on disk, the work is still done, and the user sees the same result. The cost of a missed commit is slightly less granular history that nobody is looking at yet.

**One commit per logical step.** Enables meaningful run history reconstruction from git log. Each commit represents a discrete, reviewable unit of Q's work — not a batch of unrelated changes.

**One commit for the first teaching session.** Teaching is a conversation with intermediate drafts. Committing each revision would produce noisy history of "playbook v1," "playbook v2," "playbook v3 after user feedback." One commit at the "stream is ready" boundary captures the meaningful state — the outcome of the teaching session, not the process.

**`git add -A`, not scoped adds.** Simpler for Q — no path tracking, no chance of getting a path wrong. One user, one agent — the worst case is a user's manual edit getting swept into Q's commit. The file is still versioned correctly; it's just attributed to the wrong commit, which nobody is looking at.

**Wipe-then-work is one commit.** When starting a new run, Q clears `working/` and `outputs/` then produces new artifacts. The wipe and the new content are committed together — git sees file replacements, not a deletion followed by creation. This produces cleaner history: each run commit shows "here's what this run produced," not "previous run's artifacts were deleted."

## Concurrent Task Runs

When multiple tasks run concurrently (see [Concurrency](concurrency.md)), git becomes a coordination point. Git uses a repo-wide `index.lock` for any index-mutating operation — two tasks committing at the same instant collide with `fatal: Unable to create '.git/index.lock': File exists`.

**Approach: simple retry with backoff.** Tasks write files freely to their own directories. When a git operation hits `index.lock`, retry up to 3 times with 100ms/200ms/400ms delays. The lock is held for milliseconds, so retries almost always succeed on the first attempt.

Why retry over async mutex: Q runs git commands via bash tool calls inside the SDK — the app can't wrap those in a mutex. Retry covers both app-level calls (`commitGitState`, `isTaskCompleted`) and agent-initiated git commands. See [Concurrency](concurrency.md) for the full design, implementation details, and the retry helper.

## Acceptance Criteria

- [x] App initializes a git repo at `~/HappyHQ/` on first launch (idempotent — succeeds if repo already exists)
- [x] `.gitignore` excludes `.DS_Store`, `Thumbs.db`, and `.chats/` (uploads are inside `.chats/`, no separate exclusion needed)
- [x] App configures local repo author as `Q <q@happyhq.com>`
- [x] App commits after create/rename/delete with `[stream/task]` prefixed messages
- [ ] App commits with `[stream/task] Plan accepted` when user approves the plan
- [ ] Q commits after meaningful writes with `[stream/task]` prefixed messages _(prompt compliance)_
- [x] Final working iteration commit includes `[done]`; app detects via `git log --format='%s' -1 -- tasks/{taskName}` _(prompt instructs in `prompts/working.md`; loop checks in `lib/git/sync.server.ts:isTaskCompleted`)_
- [x] All user content is tracked (playbooks, specs, samples, inputs, working, outputs)
- [x] Q runs git commands via bash tool calls (no app-level git library)
- [x] No git terminology appears anywhere in the UI

## Testing

Repository initialization (`initializeGitRepo`):

- [x] Creates ~/HappyHQ/ directory (`lib/git/init.server.test.ts`)
- [x] Runs `git init` at ~/HappyHQ/ (`lib/git/init.server.test.ts`)
- [x] Writes .gitignore excluding .DS_Store, Thumbs.db, .chats/ (`lib/git/init.server.test.ts`)
- [x] Configures local author as Q <q@happyhq.com> (`lib/git/init.server.test.ts`)
- [x] Creates initial commit when no commits exist, skips when they do (`lib/git/init.server.test.ts`)
- [x] Suppresses all git output (stdio: pipe) (`lib/git/init.server.test.ts`)

Background sync (`syncGitState`):

- [x] Skips commit when working tree is clean or whitespace-only (`lib/git/sync.server.test.ts`)
- [x] Commits with `git add -A` when tree is dirty (`lib/git/sync.server.test.ts`)
- [x] Never throws — logs warning on git failure (`lib/git/sync.server.test.ts`)
- [x] All commands run in HAPPYHQ_ROOT (`lib/git/sync.server.test.ts`)

User-initiated commits (`commitGitState`):

- [x] Skips commit when working tree is clean (`lib/git/sync.server.test.ts`)
- [x] Commits with provided message when tree has changes (`lib/git/sync.server.test.ts`)
- [x] Never throws on failure (`lib/git/sync.server.test.ts`)
- [x] Server actions call commitGitState with correct messages (`lib/actions.test.ts`)

Not tested (prompt-driven, not app logic):

- Q's commit message format (`[stream/task] description`)
- Q's commit timing (after teaching, after steps, after completion)
- Atomic commit granularity

## Edge Cases

- **User manually edits files**: Next commit picks up their changes. This is fine — they own the files.
- **Git repo gets corrupted**: App detects on startup. Show an error.
- **Q's git command fails**: Q sees the error in bash output and continues working. Best effort — no retry logic, no crash. The work proceeds; the commit is just missed.
- **Very large files (PDFs)**: Git handles binary files, but the repo can grow. Not a concern for the expected scale.
- **Concurrent writes**: When multiple tasks run concurrently, git `index.lock` collisions are handled by retry with backoff. See [Concurrency](concurrency.md) for details.
- **User deletes .git directory**: App detects missing repo and reinitializes. History is lost, but files remain.

## Constraints

- Local only. No remote, no push, no pull.
- No git UI. Completely invisible.
- No branches. Everything on the default branch.
- All commits are automatic — user has no manual commit capability in the app.
