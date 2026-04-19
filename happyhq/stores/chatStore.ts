import { toastError } from '@/components/common/ui/sonner'
import { getToolLabel } from '@/lib/chat/tool-labels'
import type {
  AskUserQuestionInput,
  ChatMessage,
  ChatStreamEvent,
  ContentBlock,
  PendingConfirmation,
} from '@/lib/chat/types'
import { readNDJSON } from '@/lib/ndjson'
import { invalidateStream } from '@/lib/swr-helpers'
import { allChatsKey, taskContentKey } from '@/lib/swr-keys'
import { mutate } from 'swr'
import { create, type StoreApi, type UseBoundStore } from 'zustand'

export type StagedFile = {
  id: string
  name: string
  file: File
}

export interface ChatState {
  // State
  messages: ChatMessage[]
  isStreaming: boolean
  pendingQuestion: AskUserQuestionInput | null
  pendingConfirmation: PendingConfirmation | null
  stoppedByUser: boolean
  chatName: string | null
  draftText: string
  draftFiles: StagedFile[]
  mode: 'general' | 'learning'
  streamSlugForMode: string | null // which stream learning mode is attached to

  // Actions
  sendMessage: (params: {
    message: string
    files?: string[]
    fileSlugs?: string[]
    sessionId: string
    streamSlug?: string
    taskSlug?: string
    /** When true, skip addUserMessage — caller already added it optimistically */
    messageAdded?: boolean
  }) => Promise<void>
  addUserMessage: (content: string, files?: string[]) => void
  loadHistory: (params: {
    sessionId: string
    streamSlug?: string
  }) => Promise<void>
  setMode: (mode: 'general' | 'learning', streamSlug?: string | null) => void
  setDraftText: (text: string) => void
  setDraftFiles: (
    files: StagedFile[] | ((prev: StagedFile[]) => StagedFile[]),
  ) => void
  clearDraft: () => void
  reset: () => void
  abortStream: () => void
}

const initialState = {
  messages: [] as ChatMessage[],
  isStreaming: false,
  pendingQuestion: null as AskUserQuestionInput | null,
  pendingConfirmation: null as PendingConfirmation | null,
  stoppedByUser: false,
  chatName: null as string | null,
  draftText: '',
  draftFiles: [] as StagedFile[],
  mode: 'general' as const,
  streamSlugForMode: null as string | null,
}

/**
 * Factory that creates an independent chat store instance.
 * Used by both the chat page (module-level singleton) and the task sidebar
 * (per-component instance) so they don't share state.
 */
export function createChatStore(): UseBoundStore<StoreApi<ChatState>> {
  // Closure-scoped abort controllers — cancelled on reset() to prevent
  // stale async completions from overwriting fresh state after stream navigation.
  let sendController: AbortController | null = null
  let historyController: AbortController | null = null

  return create<ChatState>((set, get) => ({
    ...initialState,

    addUserMessage: (content: string, files?: string[]) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content,
        files,
        timestamp: Date.now(),
      }
      set((state) => ({ messages: [...state.messages, msg] }))
    },

    setDraftText: (text: string) => set({ draftText: text }),

    setDraftFiles: (
      files: StagedFile[] | ((prev: StagedFile[]) => StagedFile[]),
    ) => {
      if (typeof files === 'function') {
        set((state) => ({ draftFiles: files(state.draftFiles) }))
      } else {
        set({ draftFiles: files })
      }
    },

    clearDraft: () => set({ draftText: '', draftFiles: [] }),

    setMode: (mode, streamSlug) =>
      set({ mode, streamSlugForMode: streamSlug ?? null }),

    reset: () => {
      sendController?.abort()
      sendController = null
      historyController?.abort()
      historyController = null
      set(initialState)
    },

    abortStream: () => {
      sendController?.abort()
      sendController = null
    },

    loadHistory: async ({ sessionId, streamSlug }) => {
      // Don't clobber messages if a turn is already in progress
      const { messages, isStreaming } = get()
      if (messages.length > 0 || isStreaming) return

      historyController?.abort()
      historyController = new AbortController()

      try {
        const params = new URLSearchParams({ session: sessionId })
        if (streamSlug) params.set('stream', streamSlug)
        const res = await fetch(`/api/chat/history?${params}`, {
          signal: historyController.signal,
        })
        if (!res.ok) return // Start clean on error
        const data = await res.json()
        // Re-check freshness: a reset() + sendMessage() may have fired while
        // we were fetching, so the store now belongs to a different session.
        const { messages: current, isStreaming: streaming } = get()
        if (current.length > 0 || streaming) return
        if (data.chatName) {
          set({ chatName: data.chatName })
        }
        if (data.mode === 'general' || data.mode === 'learning') {
          set({ mode: data.mode })
        }
        if (data.streamSlug) {
          set({ streamSlugForMode: data.streamSlug })
        }
        // Restore mid-chat stream selection (overrides filesystem-derived slug)
        if (data.selectedStreamSlug != null) {
          const { useDesktopStore } = await import('@/stores/desktopStore')
          useDesktopStore
            .getState()
            .setSelectedStream(data.selectedStreamSlug || '')
        }
        if (data.messages?.length > 0) {
          set({ messages: data.messages })
        }
      } catch {
        // Start clean on error (including AbortError) -- spec says this is fine
      }
    },

    sendMessage: async ({
      message,
      files,
      fileSlugs,
      sessionId,
      streamSlug,
      taskSlug,
      messageAdded,
    }) => {
      // Derive resume: were there messages before this call?
      // When messageAdded is true, the caller already added the optimistic user
      // message, so length > 1 means prior conversation exists.
      const resume = messageAdded
        ? get().messages.length > 1
        : get().messages.length > 0

      // Add user message to the store — files stored separately, NOT in content.
      // Skip if the caller already added it optimistically (e.g. for instant UI transitions).
      if (!messageAdded) {
        get().addUserMessage(message, files)
      }

      // Compose the API message: embed [Files uploaded: ...] so the agent
      // knows which files to read from `uploads/`. The agent accesses files
      // via filesystem tools (Read, Bash) — not multimodal content blocks —
      // because it needs to classify, move, and process files on disk. This
      // text annotation is the only place the marker is composed; the UI
      // stores filenames separately on ChatMessage.files for visual rendering,
      // and parse-history.server.ts strips it back out for historical messages.
      //
      // fileSlugs are the upload directory names (extensionless slugs) the
      // agent needs to locate files on disk. files are the original display
      // names (with extensions) used for UI rendering.
      let apiMessage = message
      const slugsForApi = fileSlugs ?? files
      if (slugsForApi?.length) {
        const fileList = slugsForApi.join(', ')
        apiMessage = message
          ? `${message}\n\n[Files uploaded: ${fileList}]`
          : `[Files uploaded: ${fileList}]`
      }

      // Clear any pending question/confirmation from previous turn
      set({
        isStreaming: true,
        pendingQuestion: null,
        pendingConfirmation: null,
        stoppedByUser: false,
      })

      // Auto-name the chat from the first message (no LLM call).
      // Fires early so the title appears while the main response streams.
      if (!resume) {
        const chatTitle = chatTitleFromMessage(message, files)
        set({ chatName: chatTitle })
        // Persist to chat.json (fire-and-forget) so the chat list picks it up
        fetch('/api/chat/name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, name: chatTitle }),
        })
          .then(() => mutate(allChatsKey()))
          .catch(() => {})
      }

      // Create the assistant message placeholder for streaming.
      // Mutable ref so processEvent can create new messages at turn boundaries.
      const firstMsgId = crypto.randomUUID()
      const activeRef = { id: firstMsgId }
      // Mutable ref to accumulate input_json_delta for AskUserQuestion tool blocks.
      // Parses the question on content_block_stop so it renders without a skeleton.
      const questionRef = { blockIndex: null as number | null, json: '' }
      const assistantMsg: ChatMessage = {
        id: firstMsgId,
        role: 'assistant',
        content: '',
        isStreaming: true,
        timestamp: Date.now(),
      }
      set((state) => ({ messages: [...state.messages, assistantMsg] }))

      sendController?.abort()
      sendController = new AbortController()

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: sendController.signal,
          body: JSON.stringify({
            message: apiMessage,
            sessionId,
            streamSlug,
            resume,
            mode: get().mode,
            ...(get().streamSlugForMode && {
              modeStreamSlug: get().streamSlugForMode,
            }),
            ...(taskSlug && { taskSlug }),
          }),
        })

        if (!response.ok) {
          const err = await response
            .json()
            .catch(() => ({ error: 'Request failed' }))
          const errMsg = err.error || `HTTP ${response.status}`
          toastError(errMsg)
          set({ isStreaming: false })
          // Remove the empty assistant placeholder on HTTP error
          set((state) => ({
            messages: state.messages.filter((m) => m.id !== firstMsgId),
          }))
          return
        }

        for await (const event of readNDJSON<ChatStreamEvent>(response)) {
          processEvent(event, activeRef, questionRef, set, get)

          // Revalidate stream content when the agent writes a file.
          // Fired by PostToolUse hook after Write/Edit completes on the server.
          if (event.type === 'stream_content_changed') {
            if (streamSlug) invalidateStream(streamSlug)
            if (taskSlug) {
              mutate(taskContentKey(taskSlug))
            }
          }
        }
      } catch (err) {
        // AbortError is expected when reset() or abortStream() cancels the fetch.
        // Don't toast — the user triggered this intentionally.
        if (err instanceof DOMException && err.name === 'AbortError') {
          set((state) => ({
            isStreaming: false,
            pendingConfirmation: null,
            messages: state.messages.filter((m) => {
              if (m.id !== activeRef.id) return true
              return m.content.length > 0
            }),
          }))
          return
        }
        // Remove the empty assistant placeholder on stream error (no ghost messages).
        // Clear pendingConfirmation so a stale card doesn't linger after abort.
        const errMsg = err instanceof Error ? err.message : String(err)
        toastError(errMsg)
        set((state) => ({
          isStreaming: false,
          pendingConfirmation: null,
          messages: state.messages.filter((m) => {
            if (m.id !== activeRef.id) return true
            // Keep if it has accumulated content, remove if empty
            return m.content.length > 0
          }),
        }))
      }

      // Finalize streaming state on the last active assistant message.
      // Clear pendingConfirmation so a stale card doesn't linger after abort.
      set((state) => ({
        isStreaming: false,
        pendingConfirmation: null,
        messages: state.messages.map((m) =>
          m.id === activeRef.id ? { ...m, isStreaming: false } : m,
        ),
      }))
    },
  }))
}

/**
 * Process a single NDJSON event from the chat stream.
 *
 * Each SDK turn (agent reads files, calls tools, responds) emits its own
 * message_start → deltas → assistant sequence. We create a new UI message
 * at each turn boundary so the user sees each step, like Claude Code.
 */
function processEvent(
  event: ChatStreamEvent,
  activeRef: { id: string },
  questionRef: { blockIndex: number | null; json: string },
  set: (
    partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>),
  ) => void,
  get: () => ChatState,
) {
  switch (event.type) {
    case 'partial': {
      const streamEvent = event.event

      // Detect new SDK turn — message_start fires at the beginning of each
      // assistant response within a multi-turn agent loop.
      if (streamEvent.type === 'message_start') {
        // Subagent starting — initialize writing preview on the active message
        // instead of creating a new message bubble.
        if (event.parentToolUseId) {
          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id !== activeRef.id) return m
              // First subagent turn: initialize writingPreview
              if (!m.writingPreview) {
                return {
                  ...m,
                  writingPreview: {
                    parentToolUseId: event.parentToolUseId!,
                    text: '',
                    isActive: true,
                  },
                }
              }
              // Subsequent turns: keep accumulated text, reset tool progress
              return {
                ...m,
                writingPreview: {
                  ...m.writingPreview,
                  isActive: true,
                  subagentToolProgress: [],
                },
              }
            }),
          }))
          break
        }

        const currentMsg = get().messages.find((m) => m.id === activeRef.id)

        // Q's own turn resuming — close any active writing preview
        if (currentMsg?.writingPreview?.isActive) {
          set((state) => ({
            messages: state.messages.map((m) =>
              m.id === activeRef.id && m.writingPreview
                ? {
                    ...m,
                    writingPreview: {
                      ...m.writingPreview,
                      isActive: false,
                    },
                  }
                : m,
            ),
          }))
        }

        if (
          currentMsg &&
          (currentMsg.content.length > 0 || currentMsg.toolCalls?.length)
        ) {
          // Current message has content — start a fresh one for this turn
          const newId = crypto.randomUUID()
          const newMsg: ChatMessage = {
            id: newId,
            role: 'assistant',
            content: '',
            isStreaming: true,
            timestamp: Date.now(),
          }
          set((state) => ({
            messages: [
              ...state.messages.map((m) =>
                m.id === activeRef.id ? { ...m, isStreaming: false } : m,
              ),
              newMsg,
            ],
          }))
          activeRef.id = newId
          questionRef.blockIndex = null
          questionRef.json = ''
        }
        break
      }

      if (streamEvent.type === 'content_block_delta') {
        // Narrow to the content_block_delta variant to access delta safely.
        // The StreamEvent union has a catch-all, so we extract delta from
        // the narrowed variant type directly.
        const delta = (
          streamEvent as Extract<
            typeof streamEvent,
            { type: 'content_block_delta' }
          >
        ).delta
        if (delta?.type === 'text_delta' && delta.text) {
          const text = delta.text
          if (event.parentToolUseId) {
            // Subagent text — append to writing preview, not main content
            set((state) => ({
              messages: state.messages.map((m) => {
                if (m.id !== activeRef.id || !m.writingPreview) return m
                return {
                  ...m,
                  writingPreview: {
                    ...m.writingPreview,
                    text: m.writingPreview.text + text,
                  },
                }
              }),
            }))
          } else {
            set((state) => ({
              messages: state.messages.map((m) =>
                m.id === activeRef.id ? { ...m, content: m.content + text } : m,
              ),
            }))
          }
        }
        // Capture thinking deltas (extended thinking).
        // The API sends thinking content as delta.thinking, not delta.text.
        if (
          delta?.type === 'thinking_delta' &&
          (delta.thinking || delta.text)
        ) {
          const text = (delta.thinking || delta.text)!
          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id !== activeRef.id) return m
              const blocks = [...(m.thinkingBlocks || [])]
              if (blocks.length > 0) {
                blocks[blocks.length - 1] = {
                  text: blocks[blocks.length - 1].text + text,
                }
              }
              return { ...m, thinkingBlocks: blocks }
            }),
          }))
          const msg = get().messages.find((m) => m.id === activeRef.id)
        }
        // Accumulate tool input JSON for AskUserQuestion so we can render
        // the question form on content_block_stop instead of waiting for assistant.
        if (
          delta?.type === 'input_json_delta' &&
          delta.partial_json &&
          questionRef.blockIndex !== null
        ) {
          const eventIndex = (
            streamEvent as Extract<
              typeof streamEvent,
              { type: 'content_block_delta' }
            >
          ).index
          if (eventIndex === questionRef.blockIndex) {
            questionRef.json += delta.partial_json
          }
        }
      }
      // Create a new thinking block when one starts
      if (streamEvent.type === 'content_block_start') {
        // Subagent tool_use blocks — route to writingPreview.subagentToolProgress
        if (event.parentToolUseId) {
          const block = (
            streamEvent as Extract<
              typeof streamEvent,
              { type: 'content_block_start' }
            >
          ).content_block
          const toolBlock = block as Extract<ContentBlock, { type: 'tool_use' }>
          if (block?.type === 'tool_use' && toolBlock.name && toolBlock.id) {
            const rawName = toolBlock.name
            const toolName =
              rawName.startsWith('mcp__') && rawName.lastIndexOf('__') > 4
                ? rawName.slice(rawName.lastIndexOf('__') + 2)
                : rawName
            set((state) => ({
              messages: state.messages.map((m) => {
                if (m.id !== activeRef.id || !m.writingPreview) return m
                const steps = [...(m.writingPreview.subagentToolProgress || [])]
                if (!steps.some((s) => s.toolUseId === toolBlock.id)) {
                  steps.push({
                    toolName,
                    toolUseId: toolBlock.id,
                    elapsedSeconds: 0,
                  })
                }
                return {
                  ...m,
                  writingPreview: {
                    ...m.writingPreview,
                    subagentToolProgress: steps,
                  },
                }
              }),
            }))
          }
          break
        }
        // Q's own blocks below
        const block = (
          streamEvent as Extract<
            typeof streamEvent,
            { type: 'content_block_start' }
          >
        ).content_block
        if (block?.type === 'thinking') {
          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id !== activeRef.id) return m
              return {
                ...m,
                thinkingBlocks: [...(m.thinkingBlocks || []), { text: '' }],
              }
            }),
          }))
          const msg = get().messages.find((m) => m.id === activeRef.id)
        }
        // Tool use blocks — add to toolProgress immediately so the UI shows
        // what Q is doing as soon as the model starts calling a tool.
        // Cast to the tool_use ContentBlock variant — the catch-all in the
        // ContentBlock union prevents TypeScript from narrowing on `type` alone.
        const toolBlock = block as Extract<ContentBlock, { type: 'tool_use' }>
        if (block?.type === 'tool_use' && toolBlock.name && toolBlock.id) {
          const rawName = toolBlock.name
          const toolUseId = toolBlock.id
          // Strip MCP prefix (mcp__q__Task → Task)
          const toolName =
            rawName.startsWith('mcp__') && rawName.lastIndexOf('__') > 4
              ? rawName.slice(rawName.lastIndexOf('__') + 2)
              : rawName

          set((state) => ({
            messages: state.messages.map((m) => {
              if (m.id !== activeRef.id) return m
              const steps = [...(m.toolProgress || [])]
              if (!steps.some((s) => s.toolUseId === toolUseId)) {
                steps.push({ toolName, toolUseId, elapsedSeconds: 0 })
              }
              return { ...m, toolProgress: steps }
            }),
          }))

          // Track AskUserQuestion block index so we can accumulate input_json_delta
          // and parse the question on content_block_stop (no skeleton needed).
          if (toolName === 'AskUserQuestion') {
            questionRef.blockIndex = (
              streamEvent as Extract<
                typeof streamEvent,
                { type: 'content_block_start' }
              >
            ).index
            questionRef.json = ''
          }
        }
      }
      // Parse accumulated AskUserQuestion input when the block finishes streaming.
      // This renders the question form immediately instead of waiting for `assistant`.
      if (
        streamEvent.type === 'content_block_stop' &&
        !event.parentToolUseId &&
        questionRef.blockIndex !== null
      ) {
        const stopIndex = (
          streamEvent as Extract<
            typeof streamEvent,
            { type: 'content_block_stop' }
          >
        ).index
        if (stopIndex === questionRef.blockIndex) {
          try {
            const parsed = JSON.parse(questionRef.json) as AskUserQuestionInput
            set({ pendingQuestion: parsed })
          } catch {
            // JSON parse failed — fall through to assistant event as fallback
          }
          questionRef.blockIndex = null
          questionRef.json = ''
        }
      }
      break
    }

    case 'assistant': {
      // Extract text and tool calls from the complete assistant turn.
      // Partials already built up content via append — only fall back to
      // assistant text when no partials were streamed (non-streaming case).
      const blocks: ContentBlock[] = event.message.content
      const text = blocks
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join('')

      const toolCalls = blocks
        .filter(
          (
            b,
          ): b is {
            type: 'tool_use'
            id: string
            name: string
            input: Record<string, unknown>
          } => b.type === 'tool_use',
        )
        .map((b) => ({ id: b.id, name: b.name, input: b.input }))

      // Subagent complete message — extract Write tool file preview into writingPreview.
      // The SDK doesn't stream subagent tokens (hardcodes includePartialMessages:false),
      // so we show the written file content once the subagent turn completes.
      if (event.parentToolUseId) {
        const writeCall = toolCalls.find((tc) => tc.name === 'Write')
        if (writeCall) {
          const filePath = writeCall.input.file_path as string | undefined
          const content = writeCall.input.content as string | undefined
          if (filePath && content) {
            set((state) => ({
              messages: state.messages.map((m) => {
                if (m.id !== activeRef.id) return m
                return {
                  ...m,
                  writingPreview: {
                    ...(m.writingPreview ?? {
                      parentToolUseId: event.parentToolUseId!,
                      text: '',
                      isActive: true,
                    }),
                    filePreview: { filePath, content },
                  },
                }
              }),
            }))
          }
        }
        break
      }

      // Update the assistant message — keep streamed content, only fall back
      // to assistant text when the message is empty.
      set((state) => ({
        messages: state.messages.map((m) =>
          m.id === activeRef.id
            ? {
                ...m,
                content: m.content || text,
                toolCalls:
                  toolCalls.length > 0
                    ? [...(m.toolCalls || []), ...toolCalls]
                    : m.toolCalls,
              }
            : m,
        ),
      }))

      // Process tool calls for special UI rendering.
      // AskUserQuestion: only set if not already parsed from content_block_stop (the fast path).
      for (const tc of toolCalls) {
        if (tc.name === 'AskUserQuestion' && !get().pendingQuestion) {
          set({
            pendingQuestion: tc.input as unknown as AskUserQuestionInput,
          })
        }
      }
      break
    }

    case 'tool_progress': {
      // Subagent tool progress — update elapsed time in writingPreview,
      // or create the step if content_block_start was never sent (the SDK
      // hardcodes includePartialMessages:false for subagents).
      if (event.parentToolUseId) {
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== activeRef.id) return m
            const wp = m.writingPreview ?? {
              parentToolUseId: event.parentToolUseId!,
              text: '',
              isActive: true,
            }
            const steps = [...(wp.subagentToolProgress || [])]
            const existing = steps.findIndex(
              (s) => s.toolUseId === event.toolUseId,
            )
            if (existing >= 0) {
              steps[existing] = {
                ...steps[existing],
                elapsedSeconds: event.elapsedSeconds,
              }
            } else {
              // Fallback: create step from tool_progress (partial event was missed)
              steps.push({
                toolName: event.toolName,
                toolUseId: event.toolUseId,
                elapsedSeconds: event.elapsedSeconds,
              })
            }
            return {
              ...m,
              writingPreview: {
                ...wp,
                subagentToolProgress: steps,
              },
            }
          }),
        }))
        break
      }

      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== activeRef.id) return m
          const steps = [...(m.toolProgress || [])]
          const existing = steps.findIndex(
            (s) => s.toolUseId === event.toolUseId,
          )
          if (existing >= 0) {
            steps[existing] = {
              ...steps[existing],
              elapsedSeconds: event.elapsedSeconds,
            }
          }
          // If not found by toolUseId: a tool_progress that arrived before
          // content_block_start. content_block_start is the canonical step creator.
          return { ...m, toolProgress: steps }
        }),
      }))
      break
    }

    case 'subagent_event': {
      set((state) => ({
        messages: state.messages.map((m) => {
          if (m.id !== activeRef.id) return m
          const activities = [...(m.subagentActivities || [])]

          if (event.subtype === 'started') {
            activities.push({
              taskId: event.taskId,
              description: event.description ?? 'agent',
              isComplete: false,
            })
          } else if (event.subtype === 'progress') {
            const idx = activities.findIndex((a) => a.taskId === event.taskId)
            if (idx >= 0) {
              activities[idx] = {
                ...activities[idx],
                progress: event.description ?? event.lastToolName,
              }
            }
          } else if (event.subtype === 'completed') {
            const idx = activities.findIndex((a) => a.taskId === event.taskId)
            if (idx >= 0) {
              activities[idx] = {
                ...activities[idx],
                isComplete: true,
                summary: event.summary,
                toolUses: event.toolUses,
                durationMs: event.durationMs,
              }
            }
          }

          return { ...m, subagentActivities: activities }
        }),
      }))
      break
    }

    case 'pending_confirmation': {
      set({
        pendingConfirmation: {
          toolName: event.toolName,
          input: event.input,
          toolUseId: event.toolUseId,
        },
      })
      break
    }

    case 'mode_changed': {
      set({
        mode: event.mode,
        streamSlugForMode: event.streamSlug ?? null,
      })
      break
    }

    case 'result': {
      if (event.subtype !== 'success' && event.errors?.length) {
        toastError(event.errors.join('; '))
      }
      // Surface permission denials — tool calls the SDK denied. The model may
      // have worked around them, but the user should know tools were blocked.
      if (event.permissionDenials?.length) {
        const names = event.permissionDenials.map(
          (d) => getToolLabel(d.toolName) ?? d.toolName,
        )
        toastError(`Permission denied: ${names.join(', ')}`)
      }
      break
    }

    case 'error': {
      toastError(event.message)
      set({ isStreaming: false })
      break
    }

    case 'auth_error': {
      toastError('API key is invalid. Redirecting to setup…')
      set({ isStreaming: false })
      window.location.href = '/setup'
      break
    }
  }
}

const MAX_TITLE_LENGTH = 80

/**
 * Derive a chat title from the user's first message.
 * - Text message: truncate at word boundary with ellipsis
 * - Files only: "Shared files: a.pdf, b.csv"
 * - Fallback: "New Chat"
 */
export function chatTitleFromMessage(
  message: string,
  files?: string[],
): string {
  const text = message.trim()

  if (text) {
    if (text.length <= MAX_TITLE_LENGTH) return text
    const truncated = text.slice(0, MAX_TITLE_LENGTH)
    const lastSpace = truncated.lastIndexOf(' ')
    return (lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated) + '…'
  }

  if (files?.length) {
    return `Shared files: ${files.join(', ')}`
  }

  return 'New Chat'
}
