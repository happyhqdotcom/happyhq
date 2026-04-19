export interface FileEntry {
  name: string
  path: string // Relative path within ~/HappyHQ/ (e.g., "my-stream/specs/tone.md")
  type: 'file' | 'directory'
  title: string | null // Custom display title from .meta.json (directories only)
  modifiedAt: string // ISO 8601 timestamp from fs.stat().mtime
}

export interface IterationMetrics {
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

export interface RunInfo {
  status: 'planning' | 'plan_ready' | 'working' | 'completed' | 'stopped'
  stoppedDuring?: 'planning' | 'working' // which phase was active when stopped
  stopReason?: 'budget' | 'user' | 'error' | 'iteration_limit'
  iteration: number // 0 on initial write, 1-based during/after iterations
  startedAt: string // ISO 8601 timestamp
  lastIterationAt: string // ISO 8601 timestamp, updated after each iteration
  error: string | null // e.g., "Iteration limit reached" when stopped at MAX_ITERATIONS
  costUsd?: number // Total cost across all phases (planning + working)
  planningCostUsd?: number | null // Cost of planning phase alone
  iterations?: IterationMetrics[] // Per-iteration cost and duration breakdown
  planningSessionId?: string // SDK session UUID for planning phase
  workingSessionIds?: string[] // SDK session UUID per working iteration
}

export interface TaskContent {
  frontmatter: TaskFrontmatter | null // Parsed YAML frontmatter from task.md (null if missing/malformed)
  plan: string | null // Contents of plan.md (null if not yet generated)
  description: string | null // Contents of inputs/context.md (null if not yet written)
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
  description: string | null // task.md body or inputs/context.md content
}
