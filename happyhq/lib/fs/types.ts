import type { AskUserQuestionInput } from '@anthropic-ai/claude-agent-sdk/sdk-tools'

export interface FileEntry {
  name: string
  path: string // Relative path within ~/HappyHQ/ (e.g., "my-stream/specs/tone.md")
  type: 'file' | 'directory'
  title: string | null // Custom display title from .meta.json (directories only)
  modifiedAt: string // ISO 8601 timestamp from fs.stat().mtime
}

/**
 * Token & cost metrics staged during a phase invocation. Folded into a
 * PhaseRecord when the phase completes.
 */
export interface PhaseTokenMetrics {
  costUsd: number
  durationMs: number
  // Token usage from SDK modelUsage (sum across all models in the iteration)
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  contextWindow?: number // model's context window size
  contextWindowUsedPct?: number // peak single-call input tokens / contextWindow * 100
}

/** Metrics for a single phase invocation (discovery, planning, or one working iteration). */
export interface PhaseRecord {
  phase: 'discovery' | 'planning' | 'working'
  iteration?: number // Working iterations only (1, 2, 3...). Absent for discovery/planning.
  sessionId: string // SDK session UUID — used to open session transcript
  costUsd: number
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  cacheReadInputTokens?: number
  cacheCreationInputTokens?: number
  contextWindow?: number
  contextWindowUsedPct?: number
}

export interface RunInfo {
  status:
    | 'queued'
    | 'discovering'
    | 'planning'
    | 'plan_ready'
    | 'working'
    | 'completed'
    | 'stopped'
  stoppedDuring?: 'discovery' | 'planning' | 'working' // which phase was active when stopped
  queuedAt?: string // ISO 8601 — set when status is 'queued'
  stopReason?: 'budget' | 'user' | 'error' | 'iteration_limit' | 'no_progress'
  startedAt: string // ISO 8601 timestamp
  lastIterationAt: string // ISO 8601 timestamp, updated after each phase/iteration
  error?: string // Set when status is 'stopped' with a real error
  costUsd?: number // Cumulative total across all phases
  phases: PhaseRecord[] // Append-only log — one entry per discovery, planning, each working iteration
  pendingQuestions?: AskUserQuestionInput['questions'] // Set when a heads-up phase is blocked on AskUserQuestion
}

export interface TaskContent {
  frontmatter: TaskFrontmatter | null // Parsed YAML frontmatter from task.md (null if missing/malformed)
  plan: string | null // Contents of plan.md (null if not yet generated)
  description: string | null // task.md body (the task description) — null if empty
  run: RunInfo | null // Parsed .run.json (null if no run state exists)
  inputs: FileItem[] // Flattened file items from inputs/ directory
  working: FileEntry[] // Contents of working/ directory (breadcrumbs)
  outputs: FileEntry[] // Contents of outputs/ directory
}

export interface StreamEntry {
  name: string
  title: string | null // Custom display title from .meta.json
  createdAt: string
  hasPlaybookContent: boolean // true when playbook body has content beyond frontmatter
}

export interface ChatEntry {
  sessionId: string // directory name (SDK session UUID)
  name: string | null // from chat.json { name } — null until Q names the chat
  createdAt: string // ISO 8601 from fs.stat() birthtime on the chat directory
}

/** Chat item with stream context — used by the chat list tab. */
export interface ChatItem {
  streamName: string | null // null for stream-less chats
  sessionId: string
  title: string | null
  createdAt: string
}

/**
 * Base unit for any uploaded file stored as {slug}/original.{ext} + optional raw.txt.
 * Used directly for task inputs; extended by SampleEntry for samples.
 */
export interface FileItem {
  name: string // directory slug, e.g. "acme-brief"
  title: string | null // custom display title from .meta.json
  originalPath: string // relative path to original.* file
  originalName: string // filename, e.g. "original.pdf"
  rawPath: string | null // relative path to raw.txt, or null if missing
  sourceUrl: string | null // original URL for web inputs, null otherwise
  favicon: string | null // favicon URL for web inputs, null otherwise
  modifiedAt: string // ISO 8601
  quality?: 'good' | 'poor' | 'empty' | null // null = not assessed
}

export interface SampleEntry extends FileItem {
  category: string // parent directory, e.g. "reports"
  description: string // first line from INDEX.md annotation
  categoryTitle: string | null // custom display title from category .meta.json
}

export interface SampleType {
  slug: string // directory name, e.g. "reports"
  title: string | null // custom display title from .meta.json
}

export interface StreamContent {
  playbook: string | null // Raw playbook.md content (for editor window + agent prompts)
  playbookTitle: string | null // Title from playbook.md frontmatter (null if no frontmatter)
  playbookBody: string | null // Playbook body sans frontmatter (null if no playbook)
  specs: FileEntry[] // Contents of specs/ directory
  samples: SampleEntry[] // Flat list of all samples across categories
  sampleTypes: SampleType[] // All type directories (including empty ones)
}

/** Combined desktop data — single response for stream + task + chats. */
export interface DesktopData {
  streamContent: StreamContent | null
  taskContent: TaskContent | null
  chats: ChatItem[]
}

// ---------------------------------------------------------------------------
// task.md primitive — Todoist-like task list
// ---------------------------------------------------------------------------

export type PendingType = 'clarification' | 'approval' | 'checkpoint' | 'review'

/** Parsed YAML frontmatter from task.md */
export interface TaskFrontmatter {
  title: string
  completedAt?: string // ISO 8601 — present = checked off
  stream?: string // work stream slug — present = agent task
  pending?: PendingType // what human action is needed
  createdAt: string // ISO 8601
  updatedAt?: string // ISO 8601
}

/** Task list item for the home page — parsed from task.md frontmatter. */
export interface TaskItem {
  slug: string // directory name
  frontmatter: TaskFrontmatter
  run: RunInfo | null // agent run state from .run.json
  description: string | null // task.md body — the task description
}
