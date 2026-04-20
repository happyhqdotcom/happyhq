// --- Wire format: discriminated union of NDJSON events ---
// These are OUR types for the client wire protocol.
// They are mapped FROM SDK types on the server, not 1:1 with SDK types.

export type ChatStreamEvent =
  | ChatPartialEvent // Token-level streaming (from SDK 'stream_event')
  | ChatAssistantEvent // Complete assistant turn (from SDK 'assistant')
  | ChatToolProgressEvent // "Reading playbook..." indicators (from SDK 'tool_progress')
  | ChatSubagentEvent // Subagent lifecycle (started/progress/completed) from SDK 'system' task events
  | ChatResultEvent // End of response (from SDK 'result')
  | ChatErrorEvent // Server-side error wrapper
  | ChatAuthErrorEvent // Invalid API key — redirect to /setup
  | ChatPendingConfirmationEvent // Unapproved tool — block until user allows/denies
  | ChatStreamContentChangedEvent // Agent wrote a file (Write/Edit) — client should revalidate SWR
  | ChatTaskContentChangedEvent // Run agent wrote a file (Write/Edit) — client should revalidate task SWR
  | ChatModeChangedEvent // Chat mode transition (general ↔ learning)
  | ChatHeartbeatEvent // Keepalive so fly-proxy doesn't reap the stream during silent phases

export interface ChatPartialEvent {
  type: 'partial'
  // BetaRawMessageStreamEvent from the SDK. We forward the raw event object
  // so the client can assemble text from content_block_start / content_block_delta / message_stop.
  // We define structural types rather than importing from @anthropic-ai/sdk because
  // that package is a transitive dependency bundled inside the agent SDK, not directly importable.
  event: StreamEvent
  // Non-null when this event originates from a subagent (e.g. Drafting).
  // The value is the tool_use_id of the parent's Task tool call.
  parentToolUseId?: string
}

// Structural type for BetaRawMessageStreamEvent fields we consume client-side.
// The full union has many variants; we only need these for text assembly.
export type StreamEvent =
  | {
      type: 'content_block_start'
      index: number
      // ContentBlock includes tool_use (id, name) and thinking variants,
      // not just text — needed so chatStore can read block.name / block.id
      // without `as any` casts.
      content_block: ContentBlock
    }
  | {
      type: 'content_block_delta'
      index: number
      delta: {
        type: string
        text?: string
        thinking?: string
        partial_json?: string
      }
    }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_start'; message: Record<string, unknown> }
  | {
      type: 'message_delta'
      delta: Record<string, unknown>
      usage?: Record<string, unknown>
    }
  | { type: 'message_stop' }

export interface ChatAssistantEvent {
  type: 'assistant'
  // BetaMessage shape -- content array with text and tool_use blocks
  message: AssistantMessage
  // Non-null when this message originates from a subagent (e.g. Drafting).
  parentToolUseId?: string
}

// Structural type for BetaMessage fields we consume client-side.
export interface AssistantMessage {
  id: string
  role: 'assistant'
  content: ContentBlock[]
  model: string
  stop_reason: string | null
  [key: string]: unknown
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use'
      id: string
      name: string
      input: Record<string, unknown>
    }
  | { type: 'thinking'; thinking: string }

export interface ChatToolProgressEvent {
  type: 'tool_progress'
  toolName: string
  toolUseId: string
  elapsedSeconds: number
  parentToolUseId?: string
}

export interface ChatSubagentEvent {
  type: 'subagent_event'
  subtype: 'started' | 'progress' | 'completed'
  taskId: string
  description?: string // e.g. "Drafting", "Explore" (from agent config)
  lastToolName?: string // progress: last tool used
  status?: string // completed: 'completed' | 'failed' | 'stopped'
  summary?: string // completed: summary text
  toolUses?: number // completed: tool count
  durationMs?: number // completed: elapsed ms
}

export interface ChatResultEvent {
  type: 'result'
  subtype:
    | 'success'
    | 'error_during_execution'
    | 'error_max_turns'
    | 'error_max_budget_usd'
    | 'error_max_structured_output_retries'
  result?: string
  errors?: string[]
  // Permission denials from the SDK — tool calls the user denied or that were
  // not in allowedTools. Forwarded so the client can surface them (e.g., toast).
  permissionDenials?: Array<{ toolName: string; toolUseId: string }>
  costUsd: number
}

export interface ChatErrorEvent {
  type: 'error'
  message: string
}

export interface ChatAuthErrorEvent {
  type: 'auth_error'
  message: string
}

// Sent from PostToolUse hook when the agent writes a file (Write/Edit tool).
// The client revalidates stream content SWR so desktop icons update immediately.
export interface ChatStreamContentChangedEvent {
  type: 'stream_content_changed'
}

// Sent from PostToolUse hook when the planning/working agent writes a file.
// The client revalidates task content SWR so plan.md, progress, and file lists update immediately.
export interface ChatTaskContentChangedEvent {
  type: 'task_content_changed'
}

// Sent when Q enters or exits learning mode (via EnterLearningMode/ExitLearningMode tools
// or user composer toggle). The client updates mode state and UI indicators.
export interface ChatModeChangedEvent {
  type: 'mode_changed'
  mode: 'general' | 'learning'
  streamSlug?: string // present when entering learning mode
}

// Periodic keepalive so intermediaries (proxies, load balancers) don't close
// the stream during silent phases. Clients can ignore.
export interface ChatHeartbeatEvent {
  type: 'heartbeat'
  t: string // ISO timestamp
}

// Sent from canUseTool when an unapproved tool is invoked — the SDK query is
// paused until the user allows or denies via the AskUserConfirmation card.
export interface ChatPendingConfirmationEvent {
  type: 'pending_confirmation'
  toolName: string
  input: Record<string, unknown>
  toolUseId: string // Unique ID for this tool call — keyed in pending-confirmations store
}

export interface PendingConfirmation {
  toolName: string
  input: Record<string, unknown>
  toolUseId: string
}

// --- Client-side message representation (what the UI renders) ---

export interface SubagentActivity {
  taskId: string
  description: string // "Drafting", "Explore", etc.
  progress?: string // "Reading files" — updates on each task_progress
  isComplete: boolean
  summary?: string
  toolUses?: number
  durationMs?: number
}

export interface WritingPreview {
  parentToolUseId: string // The Task tool_use block that spawned the subagent
  text: string // Accumulated text from the subagent
  isActive: boolean // True while subagent is still streaming
  subagentToolProgress?: ToolProgressStep[] // Tool activity from the subagent
  filePreview?: { filePath: string; content: string } // Written file from the subagent
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string // Assembled markdown text content
  files?: string[] // Filenames attached to this message (user uploads)
  toolCalls?: ToolCall[] // Parsed from assistant message tool_use content blocks
  isStreaming?: boolean // True while partial events are still arriving
  isHistorical?: boolean // True for messages loaded from JSONL history
  timestamp: number
  thinkingBlocks?: ThinkingBlock[] // Extended thinking content from the model
  toolProgress?: ToolProgressStep[] // Tool execution progress events during this turn
  subagentActivities?: SubagentActivity[] // Lifecycle tracking for subagents (Task tool)
  writingPreview?: WritingPreview // Present when a subagent (e.g. Drafting) is writing
}

export interface ThinkingBlock {
  text: string
}

export interface ToolProgressStep {
  toolName: string
  toolUseId: string
  elapsedSeconds: number
}

export interface ToolCall {
  id: string // tool_use_id from the content block
  name: string // 'AskUserQuestion' | 'CreateTask'
  input: Record<string, unknown>
  answers?: Record<string, string> // AskUserQuestion: maps question text → user's answer
  taskStarted?: boolean // CreateTask: set client-side (optimistic) or from chat.json startedTasks (history load)
}

// --- Tool call input shapes (parsed from ToolCall.input) ---

// AskUserQuestion is a built-in SDK tool. Its input schema uses tuple unions
// (2-4 options, 1-4 questions) in the SDK types. We use Array<...> since we
// consume the shape at runtime via JSON, not enforce cardinality at type level.
export interface AskUserQuestionInput {
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
}

// CreateTask is a custom MCP tool (from lib/agents/tools.server.ts)
export interface CreateTaskInput {
  name: string
  textContext: string
  files: string[]
}

// --- POST /api/chat request body ---

export interface ChatRequest {
  message: string
  sessionId: string
  streamSlug?: string // optional — null for stream-less general chats
  resume: boolean // false for first message in session, true for subsequent messages
  taskSlug?: string // active task — gives learning Q context about the task
  mode?: 'general' | 'learning' // chat mode — defaults to 'general'
  modeStreamSlug?: string // stream for learning mode (may differ from streamSlug for stream-less chats)
}
