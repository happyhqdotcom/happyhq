# History

Browsing previous versions of files using git history.

## Purpose

Surface git's existing version history through the UI. Every meaningful change Q makes is already committed with a descriptive message — history browsing lets users see previous versions of plans, outputs, and other task artifacts without leaving the app. No new versioning infrastructure — git is the version store, the app just reads from it.

## Why Git, Not Explicit Versions

Q's commits are intentional, not auto-saves. Each commit represents a completed logical step — plan created, execution step finished, run completed — with a descriptive message like `[sow-generator/bridgeway-sow] Draft deliverables section`. This is fundamentally different from Notion-style auto-versioning where every keystroke creates a version. The commit history is already meaningful by construction.

Explicit versioning (numbered snapshots in a database or JSON) would duplicate what git provides, introduce a second source of truth, and break the file-first model. Git gives us diffing, full content retrieval, and timestamps for free — the only missing piece is a UI to access it.

## How It Works

### Retrieval

Three git CLI calls, all via `execSync` (matching the existing pattern in `lib/git/sync.server.ts`):

| Operation           | Command                                  | Returns                           |
| ------------------- | ---------------------------------------- | --------------------------------- |
| List versions       | `git log --format='%H %aI %s' -- <path>` | Array of `{ sha, date, message }` |
| Get version content | `git show <sha>:<path>`                  | File contents at that commit      |
| Diff two versions   | `git diff <sha1> <sha2> -- <path>`       | Unified diff                      |

All commands run with `{ cwd: HAPPYHQ_ROOT, stdio: 'pipe' }`. The path is relative to the repo root (e.g., `tasks/draft-proposal-01h8k2w4/plan.md` or `acme-client/playbook.md`).

Performance is not a concern — `git log` on a local repo with dozens of commits per file is sub-millisecond. No caching or indexing needed.

### Server Layer

Implemented in `lib/git/log.server.ts` with:

- `getFileHistory(filePath: string, limit?: number): GitLogEntry[]` — parses `git log` output into structured entries
- `getFileAtRef(ref: string, filePath: string): string | null` — returns file contents at a specific commit
- `isFileDirty(filePath: string): boolean` — checks if file has uncommitted changes (used by the history dropdown to show "Current" option)
- `getGitLog(limit?: number, grep?: string): GitLogEntry[]` — general git log with optional grep filtering (powers the Git Log window)

Exposed via `/api/fs/file-history?path=` (history list + dirty flag) and `/api/fs/file?path=&ref=` (content at ref).

### Types

```typescript
interface FileVersion {
  sha: string
  date: string // ISO 8601
  message: string // Commit message (e.g., "[stream/task] Generate execution plan")
  label: string // Extracted from message — the part after the prefix
}
```

The `label` is derived by stripping the `[stream/task]` prefix from the commit message, giving clean display text like "Generate execution plan" or "Draft deliverables section".

### UI

Version history is accessed from files that are already viewable in the app — plans, outputs, working files. The entry point is a version indicator on the markdown window (or file viewer) that shows when a file has multiple versions.

**Version list:** A dropdown or panel showing versions newest-first. Each entry shows:

- The label (extracted from commit message)
- Relative timestamp ("2 hours ago", "yesterday")
- Active version highlighted

**Version content:** Selecting a version shows the file contents at that point in time. Read-only — previous versions can't be edited. The current (latest) version is the default view.

**Diffing (future):** Optionally show what changed between versions. Unified diff rendered as styled additions/deletions. Not required for v1 — the version list and content viewer are the core experience.

## What Gets Versioned

Everything git tracks — which is everything except `.chats/` (per `.gitignore`). In practice, the most useful version histories will be:

- `plan.md` — See how the plan evolved across re-plans
- `outputs/*` — Compare output iterations
- `playbook.md` — Track how teaching refined the playbook
- `specs/*` — See spec evolution from teaching conversations
- `working/*` — Less useful (wiped each run), but available

Files that don't change across commits (e.g., uploaded inputs) will show a single version — the UI should handle this gracefully (no version indicator if there's only one version, or a subtle "1 version" label).

## Commit Message Quality

Version labels are only as good as the commit messages. Current messages are functional but utilitarian. For version history to feel polished:

- Q's planning prompt should produce messages like `[stream/task] Plan: 5-step SOW with budget analysis` rather than just `[stream/task] Create task and plan`
- Q's working prompt should describe the step completed: `[stream/task] Extract pricing from pitch deck` rather than `[stream/task] Step 2`
- This is a prompt refinement, not an architecture change — update `prompts/planning.md` and `prompts/working.md`

## Scope

- Read-only history browsing. No rollback, no restore, no "revert to this version" in v1.
- No version comparison/diff UI in v1 — just the list and content viewer. Diff is a natural follow-up.
- No version history for directories — only individual files.
- Git remains invisible in terminology. The UI says "versions" or "history", never "commits" or "SHA".

## Design Decisions

**Git-only, no index file.** An intermediate index (e.g., `plan.versions.json` written alongside each commit) would provide faster lookups and richer metadata. But it adds a file to keep in sync, a new format to maintain, and complexity for a problem that doesn't exist — `git log` is fast enough for local repos. If performance becomes an issue with very long histories, an index can be added later without changing the UI contract.

**Label extraction from commit messages.** Rather than storing separate version labels, we parse them from Q's existing commit messages. This means better commit messages automatically produce better version labels — one improvement path, not two.

**File-scoped history, not task-scoped.** `git log -- <path>` gives history for a single file. An alternative would be "show me all changes in this task" (all files in the task directory), which is closer to a "run history" view. File-scoped is simpler and more immediately useful — the user is looking at a specific file and wants to see its previous states.

## Related Specs

- [Git Layer](git-layer.md) — Commit strategy, message conventions, repo initialization
- [Filesystem Layout](filesystem-layout.md) — Where files live, what gets tracked
- [Desktop](desktop.md) — Window system where version UI would integrate
- [Working](working.md) — Run lifecycle, when commits happen during execution
- [Planning](planning.md) — Plan generation, when plan.md is written/rewritten

## Acceptance Criteria

- [x] `getFileHistory()` returns commit list for a given file path (implemented as `getFileHistory` in `lib/git/log.server.ts`)
- [x] `getFileAtVersion()` returns file contents at a specific commit (implemented as `getFileAtRef` in `lib/git/log.server.ts`)
- [x] API route exposes history data to the client (`/api/fs/file-history`, `/api/fs/file?ref=`)
- [x] Version list shows in the UI for files with multiple versions (dropdown in markdown window title bar — `WindowHistoryDropdown`)
- [x] Selecting a version shows read-only file contents at that point
- [x] Version labels are human-readable (version numbers v1, v2, etc. + commit subjects with prefixes stripped)
- [ ] Timestamps shown as relative time ("2 hours ago") — currently shows absolute dates
- [x] No git terminology in the UI
- [x] Files with only one version show no version indicator (or a minimal one)
- [ ] Q's commit messages are descriptive enough to serve as version labels

## Edge Cases

- **File only has one version:** No version UI shown (or minimal "1 version" indicator). Nothing to browse.
- **File was deleted and recreated:** `git log --follow` could track across renames, but adds complexity. v1 shows history from the current path only — if the file was deleted and recreated, history starts from the recreation.
- **Binary files (PDFs, images):** History list still works (commits are listed), but content viewer can't render previous versions of binary files. Show "Binary file — cannot preview" for non-text versions.
- **Very long history (100+ versions):** Unlikely given the commit frequency, but paginate or limit to most recent 50 if needed.
- **Concurrent access:** Read-only git operations don't take locks — no conflict with Q's active commits.
- **File path with spaces or special characters:** Shell-escape the path in git commands.

## Constraints

- Read-only. No rollback or restore in v1.
- No diff view in v1.
- Local git only — no remote history.
- File-level granularity only, not directory or task-level.
