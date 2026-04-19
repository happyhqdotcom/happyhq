# Filesystem Layout

How all user content is organized as plain files on the user's filesystem.

## Purpose

Define the directory structure and file conventions for streams, tasks, and all their artifacts. This is the foundation every other spec references. All user content lives as plain files in a known location on the filesystem — browsable in Finder, openable with any text editor.

## Related Specs

- `samples/` structure and lifecycle → Samples spec (authoritative)
- `plan.md` creation, format, and progress tracking → Planning spec / Working spec
- Git commit timing and `.gitignore` → Git Layer spec
- Read/write patterns and caching → Data Flow spec
- Chat routing and entity model → App Shell spec
- Chat session management → Agent Configuration spec

## Directory Structure

```
~/HappyHQ/                              # Workspace root (= agent CWD)
  .git/                                  # Hidden — single repo for all content
  .q/                                    # Hidden — Q's memory (dogfooding)
    playbook.md                          # How Q handles conversations
    specs/                               # Quality standards Q applies to user artifacts
      playbook.md                        # What a good playbook looks like
      spec.md                            # What a good spec looks like
    samples/                             # Exemplar artifacts Q uses as reference
      playbooks/{name}/playbook.md       # Sample playbook
      specs/{name}/spec.md               # Sample spec
  tasks/                                 # All tasks (flat — see Task List spec)
    {title-slug}-{timestamp}/            # One directory per task (time-sortable suffix)
      task.md                            # Frontmatter + description (see Task List spec)
      inputs/                            # User-provided context
        context.md                       # Text context from task creation conversation
        {slug}/                          # One directory per uploaded file
          original.{ext}
          {extracted-form}
      messages/                          # Q↔human clarification exchange
      plan.md                            # Q's execution plan
      .run.json                          # Run state (status, iteration, timestamps, error)
      working/                           # Breadcrumbs — Q's process artifacts
        {artifact}.md
      outputs/                           # Final deliverables
        {files}
  .chats/                                # All chats (flat — gitignored)
    {session-id}/                        # One directory per chat (SDK session UUID)
      chat.json                          # { name, mode, streamSlug, ... } — see Chat Directory below
      uploads/                           # Files dropped into this chat, pending classification
        {slug}/                          # One directory per upload (kebab-cased from filename)
          original.{ext}                 # User's file, renamed for predictability
          {extracted-form}               # Agent-readable extraction (see Input Types spec)
                                         #   PDF → raw.txt, EML → email.json, DOCX → content.md
          {attachments...}               # Additional extracted files (e.g., email attachments)
  {stream-name}/                         # Stream directory = knowledge only (see below)
    .meta.json                           # Optional custom display title (e.g. { "title": "SOWs" })
    playbook.md                          # How the work gets done (high-level steps)
    specs/                               # Detailed rules, preferences, standards
      {topic}.md                         # One file per topic of concern
    samples/                             # Samples of finished work (see Samples spec)
      {type}/                            # Grouped by sample type (e.g. reports/, proposals/)
        INDEX.md                         # Curated metadata for all samples of this type
        {sample-name}/                   # One directory per sample
          original.{ext}                 # User's file, renamed for predictability
          raw.txt                        # Extracted text for agent use
```

## Requirements

### Root Path

Hardcoded to `~/HappyHQ/`. Resolved at startup to an absolute path. Created automatically if it doesn't exist.

### App Initialization

On first launch, the app runs this sequence:

1. Resolve `~/HappyHQ/` to an absolute path
2. Create the directory if it doesn't exist
3. `git init` if no repo exists — idempotent, succeeds if repo already exists (see [Git Layer](git-layer.md) for config details)
4. Write `.gitignore` at repo root (see [Git Layer](git-layer.md) for contents)
5. Configure local repo author as `Q <q@happyhq.com>` (see [Git Layer](git-layer.md))

All steps are idempotent. The app can run this sequence on every startup without side effects.

### Git Repository

One git repo initialized at `~/HappyHQ/`. All content versioned together. The `.git/` directory is hidden by default in Finder. Users never interact with git directly.

### Q's Memory (`.q/`)

Hidden directory at `~/HappyHQ/.q/` — Q's own playbook, specs, and samples. Same structure as a stream (playbook, specs/, samples/) but for Q itself. Q reads `.q/` at the start of every learning session and applies its own standards to everything it writes for the user. This is dogfooding — Q follows the same artifact patterns it teaches users.

Seeded on app initialization by `lib/q/seed.server.ts` from source files in `app/q/`. Always overwrites — these are framework files, not user content, so dev changes propagate on restart.

**Dot-prefix tool access:** `.q/` is dot-prefixed (hidden on macOS/Linux). Some SDK file tools skip dot-prefixed directories by default. Learning mode includes `Bash(ls:*)` in `allowedTools` so Q can list `.q/` contents. For file discovery within `.q/`, Q uses `Glob("**/*.md", path="{qPath}")` — Glob handles dot-prefixed paths without issue.

### Stream Directory

A stream is a knowledge container — it holds the playbook, specs, and samples that Q uses to execute work. It does NOT contain tasks or chats. Tasks and chats live at root level with optional stream references via metadata.

A stream is any top-level directory under `~/HappyHQ/` that is not dot-prefixed (`.git`, `.q`) or a reserved name (`tasks`). Reserved names are defined in `RESERVED_ROOT_DIRS` (`lib/fs/read.server.ts`) and enforced by both `readStreams()` (filtering) and `createStream()`/`renameStream()` (validation). Streams are created from the home composer — the slug is AI-generated from the user's first message via Haiku (e.g., `client-proposals`). The directory and standard subdirectories (`specs/`, `samples/`) are created by the `createStream()` server action. Uploads are chat-scoped — see Chat Directory section below.

### Stream-Level Content

A stream directory contains exactly three things — knowledge that Q uses to do work:

- **`playbook.md`** — Created and updated through conversation with Q during teaching. Plain markdown describing high-level steps for how the work gets done.
- **`specs/`** — Multiple markdown files, one per topic. Created through teaching. Detailed rules, preferences, and standards for how the user wants work done.
- **`samples/`** — Samples of finished work, organized by type. Each type has an INDEX.md with curated annotations and one directory per sample containing `original.{ext}` and an extracted form (`raw.txt` for PDF, `email.json` for EML, `content.md` for DOCX). See Samples spec for full lifecycle.

### Chat Directory

Root-level hidden directory (`~/HappyHQ/.chats/`) containing metadata for all chat sessions. Not git-tracked — chat metadata is session infrastructure, not work product. Chats are interactions, not knowledge — the system extracts and codifies valuable information into stream artifacts (playbook, specs, samples). The conversation itself is ephemeral history.

Each chat directory is named by the SDK session ID (a UUID). This eliminates the naming problem: the session ID exists at creation time (before Q has responded), is guaranteed unique, and never needs to change. The directory name is also the route parameter and the key for resuming the SDK session — one identifier, three uses.

Each chat directory contains:

- **`chat.json`** — Session metadata:
  - `name` — display name set by Q during the conversation (e.g. "Stream Setup" or "Pricing Discussion"), or null if unnamed
  - `mode` — `"general"` or `"learning"` — the chat's current mode
  - `streamSlug` — stream this chat is affiliated with (nullable — null for general chats with no stream context)
  - `selectedStreamSlug` — if the user selected a stream mid-conversation
  - `startedTasks` — array of task slugs created from this chat

  Stream affiliation is metadata, not location. The desktop filters chats by `streamSlug` to show stream-related conversations. Deleting a stream should cascade-delete chats where `streamSlug` matches.

- **`uploads/`** — Staging area for files dropped into this chat. Each uploaded file gets its own directory (the slug is kebab-cased from the original filename minus extension, e.g., `Acme Report Q4.pdf` → `acme-report-q4/`). Inside each directory: `original.{ext}` (the user's file, renamed for predictability) and `raw.txt` (pre-extracted text for PDFs, from eager extraction on upload — see [Samples](samples.md)). The `original.{ext}` convention matches samples — agents always look for `original.*`, no guessing filenames. Slug collisions within the same chat are resolved by appending `-2`, `-3`, etc. Upload directories stay here until Q classifies them. Samples are moved to `samples/{type}/{name}/` by ProcessSample. Task inputs are moved to `tasks/{task-slug}/inputs/{slug}/` by `setupTaskFromChat()`. Orphaned directories remain here harmlessly — contained to the chat that created them. The `uploads/` directory is created by `createChatSession()`.

Conversation history itself is managed by the Claude Agent SDK in its native storage (`~/.claude/projects/`). The chat directory is app-level metadata only, not a copy of conversation content. See [Agent Configuration](agent-config.md) for session management details.

### Task Directory

All tasks live under root `tasks/`. Each task directory is named with a kebab-cased title plus a time-sortable suffix: `{title}-{9-char-suffix}` (e.g., `bridgeway-sow-01h8k2w4a`). The suffix is always appended — 7 chars of Crockford's Base32 timestamp (second precision, good until ~3058) plus 2 chars of random. No collision detection needed. The title in `task.md` frontmatter is the display name; the directory slug is just an identifier.

Stream affiliation is metadata in `task.md` frontmatter (`stream: acme-client`), not directory nesting. Tasks without a stream are simple todos. See Task List spec for the `task.md` primitive and lifecycle.

### Task-Level Content

- **`inputs/`** — Files provided by the user for this specific task. Always contains `context.md` at the root — the text context Q gathered during the learning conversation (brief, instructions, relevant details). Other files are moved here as directories from `uploads/` by `setupTaskFromChat()` — each subdirectory contains `original.{ext}` and `raw.txt` (if available). Planning and working agents read `raw.txt` for text content instead of dealing with binary formats directly. See [Data Flow](data-flow.md).
- **`plan.md`** — Generated by Q during planning. Updated each working iteration with completed sessions and learnings. Reviewable by the user before and during execution.
- **`working/`** — Q writes here during execution. This is where breadcrumbs live:
  - **Working artifacts** — Drafts, analysis, extracted facts, intermediate reasoning. Named descriptively (e.g., `extracted-facts.md`, `pricing-analysis.md`). These are Q's "show your workings" — the messy process that lets the user understand how Q is thinking and provide informed feedback.
- **`outputs/`** — Final deliverables written by Q when a run completes. Primarily markdown, may include plain text or CSV.

### Directory Lifecycle

Each run deletes all contents of `working/` and `outputs/`, then writes new artifacts. `inputs/` is preserved across runs — it contains user-provided source material, not generated artifacts. `plan.md` may be regenerated on re-runs — see Planning spec for behavior. Git preserves previous versions of overwritten directories. This keeps the filesystem clean — users always see the latest state in Finder. See Git Layer spec for how run history is surfaced.

### File Types

Primarily markdown (`.md`). Inputs may be PDF or other formats. Outputs are markdown or plain text. No proprietary formats.

### Findability

The entire `~/HappyHQ/` directory is browsable in Finder. A user should be able to open any file with any text editor. Directory and file names should be self-explanatory to a non-technical user.

### Agent Workspace Model

The agent's CWD is the workspace root (`~/HappyHQ/`). Both stream knowledge and task files are accessible via workspace-relative paths — no symlinks, no runtime filesystem wiring.

```
System prompt:
  Your workspace is ~/HappyHQ/.

  You are working on task "Draft Q4 Proposal".
  Task directory: tasks/draft-q4-proposal-01h8k2w4/
  Stream knowledge: acme-client/

  Read the stream's playbook, specs, and samples as needed.
  Write all work to the task directory.
```

The agent reads `acme-client/playbook.md` when it needs knowledge context. It writes to `tasks/draft-q4-proposal-01h8k2w4/outputs/`. Everything is relative to one root. No symlinks, no cleanup, no crash recovery.

This model scales naturally to future "spaces" (separate workspaces with their own tasks, chats, streams, and git history) — each space is its own workspace root. If tighter containment is needed later, CWD can be narrowed to the task directory with a `.stream` symlink for knowledge access — that's an easy additive change vs. starting there and trying to move backwards.

## Design Decisions

**Hardcoded `~/HappyHQ/` path.** The user can find it easily, no configuration needed.

**Plain files on disk instead of a database.** Transparency and user ownership — files are browsable in Finder, openable with any editor, and belong to the user. This also means Q's work is inspectable without the app.

**One directory per uploaded file, `original.{ext}` inside.** Uploads, samples, and task inputs all use the same convention: a directory named for identity, `original.{ext}` inside for predictability. Agents always look for `original.*` — no guessing filenames. Derived artifacts (`raw.txt` from pdfium text extraction) live alongside the original. This scales as more input types are added — each type produces its own derived artifacts, and the directory keeps them together. Moving a file between stages (uploads → samples or uploads → inputs) is one directory rename, not a multi-file operation.

**Overwrite `working/` each run instead of accumulating.** Clean slate per run, with git preserving history. Avoids confusion about which artifacts are current — the filesystem always shows the latest state.

**Streams are pure knowledge, chats and tasks at root.** A stream directory contains only the knowledge Q needs to do work (playbook, specs, samples). Tasks and chats reference streams via metadata, not directory nesting. This means: one scan location for all tasks, one scan location for all chats, stream affiliation can change without moving files, and streams are clean portable knowledge packages.

**Agent CWD is workspace root, not task directory.** The agent navigates the workspace naturally — stream knowledge and task files are both just paths from root. No symlinks, no runtime wiring, no cleanup. This is the established pattern from every AI coding tool (Cursor, Claude Code, Copilot) — workspace root as CWD, with instructions about what to work on.

## Acceptance Criteria

- [x] App creates `~/HappyHQ/` on first launch if it doesn't exist
- [x] App initializes a git repo in `~/HappyHQ/` if one doesn't exist
- [x] `.q/` directory seeded on app initialization with playbook, specs, and sample exemplars
- [x] Learning mode `allowedTools` includes `Bash(ls:*)` for dot-prefixed directory listing
- [x] Stream setup creates the stream directory with `specs/` and `samples/` subdirectories
- [x] Chat creation creates a directory under `.chats/` with a `chat.json` metadata file
- [x] Chat creation creates an `uploads/` directory inside `.chats/{sessionId}/`
- [x] Task creation creates the task directory with `inputs/`, `working/`, and `outputs/` subdirectories
- [x] Q writes `plan.md` at the task root during planning
- [x] Q writes working artifacts to `working/` during execution
- [x] Q updates `plan.md` with findings after each working iteration
- [x] Q writes final deliverables to `outputs/` on completion
- [x] All files are valid, readable markdown (or their stated format)
- [x] Directory structure is browsable in Finder with self-explanatory names

## Testing

Path construction and traversal prevention:

- [x] `streamPath()` resolves to `~/HappyHQ/{stream}` (`lib/fs/paths.test.ts`)
- [x] `taskPath()` resolves to `~/HappyHQ/tasks/{task}` (`lib/fs/paths.test.ts`)
- [x] `validatePath()` rejects traversal attacks and absolute paths outside root (`lib/fs/paths.test.ts`)

Read layer contracts (ENOENT → null/empty, real errors throw, path validation):

- [x] `readTextFile` returns content or null, rejects outside root (`lib/fs/read.server.test.ts`)
- [x] `listDirectory` returns FileEntry[] with relative paths, distinguishes files/dirs (`lib/fs/read.server.test.ts`)
- [x] `readStreams` excludes dot-prefixed and non-directory entries, sorts newest-first (`lib/fs/read.server.test.ts`)
- [x] `readStreamContent` assembles playbook + specs + samples (`lib/fs/read.server.test.ts`)
- [x] `readTaskContent` assembles plan + progress + run + inputs + files + outputs (`lib/fs/read.server.test.ts`)
- [x] `streamExists` returns boolean, rejects traversal (`lib/fs/read.server.test.ts`)
- [x] `listChats` reads root .chats/ subdirs, parses chat.json, filters by streamSlug (`lib/fs/read.server.test.ts`)
- [x] `listAllTaskItems` reads root tasks/ subdirs, parses task.md frontmatter (`lib/fs/read.server.test.ts`)

Write layer contracts (path validation, error propagation):

- [x] `ensureDirectory`, `writeTextFile`, `clearDirectory` reject outside root (`lib/fs/write.server.test.ts`)

Server actions (mutations with path validation):

- [x] `createStream` creates root + 2 subdirectories (specs, samples) (`lib/actions.test.ts`)
- [x] `createChatSession` creates .chats/{sessionId}/, writes chat.json, and creates uploads/ (`lib/actions.test.ts`)
- [x] `createTask` creates task.md with frontmatter at root `tasks/{slug}/`; `setupTaskFromChat` writes context.md and moves uploads from `.chats/{sessionId}/uploads/` to inputs/ (`lib/actions.test.ts`)
- [x] `uploadFile` creates `{slug}/original.{ext}` inside `.chats/{sessionId}/uploads/`, runs eager pdftotext for PDFs (`lib/actions.test.ts`)
- [x] `renameStream` validates both source and destination paths (`lib/actions.test.ts`)
- [x] `deleteChat` and `deleteTaskByLocation` remove directories recursively (`lib/actions.test.ts`)

Q knowledge base seeding:

- [x] `ensureQKnowledgeBase` creates .q/ dirs, reads 5 seed files, writes to destinations (`lib/q/seed.server.test.ts`)
- [x] Always overwrites (no existence check), directories before files (`lib/q/seed.server.test.ts`)

## Edge Cases

- **Root path doesn't exist**: Create it. If the parent directory (e.g., `~`) doesn't exist, show an error (shouldn't happen in practice).
- **Git repo already exists**: Use it. Don't reinitialize.
- **Stream name conflicts**: Not applicable with single-stream usage. Stream names are unique by convention (Q generates them).
- **Task slug uniqueness**: Every task slug includes a time-sortable suffix (9 chars: 7 timestamp + 2 random, Crockford's Base32). No collision detection needed — the suffix is always appended at creation time. The slug is an identifier; the `title` field in `task.md` frontmatter is canonical. See Task List spec.
- **SDK session no longer valid**: If the SDK session (identified by the directory name) can't be resumed (deleted, corrupted), the chat appears in the list but opens as a fresh conversation. The metadata file remains — the chat identity persists even if conversation history is lost.
- **Special characters in names**: The app sanitizes to kebab-case — lowercase, hyphens only, no spaces or special characters. This applies to all directory names (streams, tasks, sample categories) regardless of whether the name came from the user or Q.
- **Empty directories**: Always create the full directory structure upfront (inputs/, working/, outputs/) even if no files exist yet.
- **Files modified outside the app**: Users may edit, move, or delete files using Finder or other tools. The app re-reads from disk on every access (no caching of file content). Missing files or directories are tolerated — surface the absence in the UI (e.g., "no playbook yet") rather than crashing or showing errors. If a required directory is missing (e.g., the active stream is deleted), fall back to the empty Desktop state.

## Constraints

- No database. All state is files + git.
- No user-configurable paths.
- The app reads and writes these files but does not own them — the user can view, copy, or edit them outside the app at any time.
