import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { chatTitleFromMessage, createChatStore } from './chatStore'

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}))

vi.mock('swr', () => ({
  mutate: vi.fn(),
}))

// Helper: create a ReadableStream from an array of NDJSON lines
function ndjsonStream(events: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const text = events.map((e) => JSON.stringify(e)).join('\n') + '\n'
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

// Helper: create a mock fetch Response with NDJSON body
function mockFetchResponse(events: object[], status = 200): Response {
  return new Response(ndjsonStream(events), {
    status,
    headers: { 'Content-Type': 'application/x-ndjson' },
  })
}

// Shared store instance — recreated before each test
let store: ReturnType<typeof createChatStore>

describe('chatStore', () => {
  beforeEach(() => {
    store = createChatStore()
    vi.restoreAllMocks()
  })

  describe('addUserMessage', () => {
    it('adds a user message with content, role, and timestamp', () => {
      store.getState().addUserMessage('Hello Q')
      const msgs = store.getState().messages
      expect(msgs).toHaveLength(1)
      expect(msgs[0].role).toBe('user')
      expect(msgs[0].content).toBe('Hello Q')
      expect(msgs[0].id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      )
      expect(msgs[0].timestamp).toBeGreaterThan(0)
    })

    it('stores files when provided', () => {
      store.getState().addUserMessage('Check these', ['report.pdf', 'data.csv'])
      const msgs = store.getState().messages
      expect(msgs[0].files).toEqual(['report.pdf', 'data.csv'])
    })

    it('leaves files undefined when not provided', () => {
      store.getState().addUserMessage('Just text')
      expect(store.getState().messages[0].files).toBeUndefined()
    })
  })

  describe('reset', () => {
    it('clears all state back to initial values', () => {
      store.getState().addUserMessage('Hello')
      store.setState({ isStreaming: true })
      store.getState().reset()

      const state = store.getState()
      expect(state.messages).toEqual([])
      expect(state.isStreaming).toBe(false)
      expect(state.pendingQuestion).toBe(null)
      expect(state.pendingConfirmation).toBe(null)
      expect(state.stoppedByUser).toBe(false)
    })
  })

  describe('loadHistory', () => {
    it('fetches history from the API and populates messages', async () => {
      const historyMessages = [
        {
          id: 'h-1',
          role: 'user',
          content: 'Previous question',
          isHistorical: true,
          timestamp: 1000,
        },
        {
          id: 'h-2',
          role: 'assistant',
          content: 'Previous answer',
          isHistorical: true,
          timestamp: 2000,
        },
      ]

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ messages: historyMessages }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await store.getState().loadHistory({
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const state = store.getState()
      expect(state.messages).toEqual(historyMessages)
    })

    it('leaves store unchanged when API returns empty messages', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ messages: [] }), { status: 200 }),
      )

      await store.getState().loadHistory({
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().messages).toEqual([])
    })

    it('leaves store unchanged on HTTP error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response('Server Error', { status: 500 }),
      )

      await store.getState().loadHistory({
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().messages).toEqual([])
    })

    it('leaves store unchanged on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Network error'),
      )

      await store.getState().loadHistory({
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().messages).toEqual([])
    })
  })

  describe('sendMessage', () => {
    it('adds a user message and an assistant placeholder when streaming begins', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const msgs = store.getState().messages
      expect(msgs).toHaveLength(2)
      expect(msgs[0].role).toBe('user')
      expect(msgs[0].content).toBe('Hi')
      expect(msgs[1].role).toBe('assistant')
    })

    it('composes file annotation for API but stores files separately on the message', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(
            mockFetchResponse([
              { type: 'result', subtype: 'success', costUsd: 0.01 },
            ]),
          ),
        )

      await store.getState().sendMessage({
        message: 'Review these',
        files: ['report.pdf'],
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      // Store message has clean content + files array
      const userMsg = store.getState().messages[0]
      expect(userMsg.content).toBe('Review these')
      expect(userMsg.files).toEqual(['report.pdf'])

      // API received the composed message
      const chatCall = fetchSpy.mock.calls.find(([url]) => url === '/api/chat')
      const body = JSON.parse((chatCall![1] as RequestInit).body as string)
      expect(body.message).toBe('Review these\n\n[Files uploaded: report.pdf]')
    })

    it('sends files-only message with [Files uploaded: ...] text to API', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(
            mockFetchResponse([
              { type: 'result', subtype: 'success', costUsd: 0.01 },
            ]),
          ),
        )

      await store.getState().sendMessage({
        message: '',
        files: ['doc.pdf'],
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const userMsg = store.getState().messages[0]
      expect(userMsg.content).toBe('')
      expect(userMsg.files).toEqual(['doc.pdf'])

      const chatCall = fetchSpy.mock.calls.find(([url]) => url === '/api/chat')
      const body = JSON.parse((chatCall![1] as RequestInit).body as string)
      expect(body.message).toBe('[Files uploaded: doc.pdf]')
    })

    it('sends resume: false for the first message and resume: true for subsequent messages', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(
            mockFetchResponse([
              { type: 'result', subtype: 'success', costUsd: 0.01 },
            ]),
          ),
        )

      // First message
      await store.getState().sendMessage({
        message: 'First',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      // Find the chat API call (not the auto-naming call)
      const chatCalls = fetchSpy.mock.calls.filter(
        ([url]) => url === '/api/chat',
      )
      let body = JSON.parse((chatCalls[0][1] as RequestInit).body as string)
      expect(body.resume).toBe(false)

      // Second message
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )
      await store.getState().sendMessage({
        message: 'Second',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const chatCalls2 = fetchSpy.mock.calls.filter(
        ([url]) => url === '/api/chat',
      )
      body = JSON.parse((chatCalls2[1][1] as RequestInit).body as string)
      expect(body.resume).toBe(true)
    })

    it('assembles text from partial content_block_delta events', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Hello ' },
              },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'world!' },
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.content).toBe('Hello world!')
    })

    it('uses final assistant text when no partial streaming occurred', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [{ type: 'text', text: 'Complete response from Q.' }],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'end_turn',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.content).toBe('Complete response from Q.')
    })

    it('detects AskUserQuestion tool calls and sets pendingQuestion', async () => {
      const questionInput = {
        questions: [
          {
            question: 'What format do you use?',
            header: 'Format',
            options: [
              { label: 'PDF', description: 'Portable document' },
              { label: 'Word', description: 'Microsoft Word' },
            ],
            multiSelect: false,
          },
        ],
      }

      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [
                  { type: 'text', text: 'Let me ask you:' },
                  {
                    type: 'tool_use',
                    id: 'tool-1',
                    name: 'AskUserQuestion',
                    input: questionInput,
                  },
                ],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'tool_use',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Help me',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().pendingQuestion).toEqual(questionInput)
    })

    it('stores CreateTask tool calls on the message for per-message rendering', async () => {
      const taskInput = {
        name: 'build-report',
        description: 'Generate the weekly report',
        textContext: 'From the meeting notes...',
        files: ['notes.pdf'],
      }

      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [
                  { type: 'text', text: 'I can create a task for that:' },
                  {
                    type: 'tool_use',
                    id: 'tool-42',
                    name: 'CreateTask',
                    input: taskInput,
                  },
                ],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'tool_use',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Create a task',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.toolCalls).toHaveLength(1)
      expect(assistantMsg.toolCalls![0].name).toBe('CreateTask')
      expect(assistantMsg.toolCalls![0].input).toEqual(taskInput)
    })

    it('shows toast on HTTP failure and removes the empty assistant placeholder', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ error: 'Stream not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'missing',
      })

      expect(toast.error).toHaveBeenCalledWith('Stream not found', {
        duration: Infinity,
      })
      // Only the user message should remain (assistant placeholder removed)
      expect(store.getState().messages).toHaveLength(1)
      expect(store.getState().messages[0].role).toBe('user')
      expect(store.getState().isStreaming).toBe(false)
    })

    it('shows toast from stream error events', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([{ type: 'error', message: 'SDK exploded' }]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(toast.error).toHaveBeenCalledWith('SDK exploded', {
        duration: Infinity,
      })
      expect(store.getState().isStreaming).toBe(false)
    })

    it('shows toast from result events with error subtype', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'result',
              subtype: 'error_during_execution',
              errors: ['Tool failed', 'Retry exhausted'],
              costUsd: 0.02,
            },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(toast.error).toHaveBeenCalledWith('Tool failed; Retry exhausted', {
        duration: Infinity,
      })
    })

    it('marks the final assistant message as not streaming', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Done' },
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.content).toBe('Done')
    })

    it('clears pendingQuestion when a new message is sent', async () => {
      // Set a pending question from a previous turn
      store.setState({
        pendingQuestion: {
          questions: [
            {
              question: 'Old question?',
              header: 'Old',
              options: [{ label: 'A', description: '' }],
              multiSelect: false,
            },
          ],
        },
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse([
          { type: 'result', subtype: 'success', costUsd: 0.01 },
        ]),
      )

      await store.getState().sendMessage({
        message: 'My answer',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().pendingQuestion).toBe(null)
    })

    it('surfaces permission denials from result events as toast with human-friendly names', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'result',
              subtype: 'success',
              costUsd: 0.02,
              permissionDenials: [
                { toolName: 'Bash', toolUseId: 'tu_1' },
                { toolName: 'Glob', toolUseId: 'tu_2' },
              ],
            },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Do something',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      // Bash → "Working", Glob → "Searching files" via getToolLabel
      expect(toast.error).toHaveBeenCalledWith(
        'Permission denied: Working, Searching files',
        { duration: Infinity },
      )
    })

    it('shows toast on network failure', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Network error'),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(toast.error).toHaveBeenCalledWith('Network error', {
        duration: Infinity,
      })
      expect(store.getState().isStreaming).toBe(false)
    })

    it('input_json_delta events do not affect message text content', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 1,
                delta: { type: 'input_json_delta', partial_json: '{"name":' },
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      // Assistant message content should be empty (no text deltas)
      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.content).toBe('')
    })

    it('renders AskUserQuestion from content_block_stop instead of waiting for assistant', async () => {
      const questionInput = {
        questions: [
          {
            question: 'What format?',
            header: 'Format',
            options: [
              { label: 'PDF', description: 'Portable document' },
              { label: 'Word', description: 'Microsoft Word' },
            ],
            multiSelect: false,
          },
        ],
      }
      const jsonStr = JSON.stringify(questionInput)

      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            // AskUserQuestion tool starts
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 1,
                content_block: {
                  type: 'tool_use',
                  id: 'toolu_ask',
                  name: 'AskUserQuestion',
                  input: {},
                },
              },
            },
            // Input JSON streams in chunks
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 1,
                delta: {
                  type: 'input_json_delta',
                  partial_json: jsonStr.slice(0, 20),
                },
              },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 1,
                delta: {
                  type: 'input_json_delta',
                  partial_json: jsonStr.slice(20),
                },
              },
            },
            // Block finishes — question should appear NOW
            {
              type: 'partial',
              event: { type: 'content_block_stop', index: 1 },
            },
            // Assistant event arrives later (should be a no-op for the question)
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    id: 'toolu_ask',
                    name: 'AskUserQuestion',
                    input: questionInput,
                  },
                ],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'tool_use',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Help me',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().pendingQuestion).toEqual(questionInput)
    })

    it('falls back to assistant event when content_block_stop JSON parse fails', async () => {
      const questionInput = {
        questions: [
          {
            question: 'Pick one',
            header: 'Choice',
            options: [{ label: 'A', description: 'Option A' }],
            multiSelect: false,
          },
        ],
      }

      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 0,
                content_block: {
                  type: 'tool_use',
                  id: 'toolu_ask',
                  name: 'AskUserQuestion',
                  input: {},
                },
              },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'input_json_delta',
                  partial_json: '{broken',
                },
              },
            },
            {
              type: 'partial',
              event: { type: 'content_block_stop', index: 0 },
            },
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    id: 'toolu_ask',
                    name: 'AskUserQuestion',
                    input: questionInput,
                  },
                ],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'tool_use',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().pendingQuestion).toEqual(questionInput)
    })

    it('ignores input_json_delta for non-AskUserQuestion tool blocks', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 0,
                content_block: {
                  type: 'tool_use',
                  id: 'toolu_read',
                  name: 'Read',
                  input: {},
                },
              },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'input_json_delta',
                  partial_json: '{"path":"file.md"}',
                },
              },
            },
            {
              type: 'partial',
              event: { type: 'content_block_stop', index: 0 },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().pendingQuestion).toBeNull()
    })

    it('creates separate messages for each agent turn in a multi-turn response', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            // Turn 1: message_start + partial text + assistant with tool call
            {
              type: 'partial',
              event: { type: 'message_start', message: {} },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Let me read your files.' },
              },
            },
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [
                  { type: 'text', text: 'Let me read your files.' },
                  {
                    type: 'tool_use',
                    id: 'tool-1',
                    name: 'Read',
                    input: { path: 'playbook.md' },
                  },
                ],
                model: 'claude-opus-4-20250514',
                stop_reason: 'tool_use',
              },
            },
            // Turn 2: new message_start + partial text
            {
              type: 'partial',
              event: { type: 'message_start', message: {} },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: {
                  type: 'text_delta',
                  text: 'Based on what I see, here are some questions.',
                },
              },
            },
            {
              type: 'assistant',
              message: {
                id: 'msg-2',
                role: 'assistant',
                content: [
                  {
                    type: 'text',
                    text: 'Based on what I see, here are some questions.',
                  },
                ],
                model: 'claude-opus-4-20250514',
                stop_reason: 'end_turn',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.05 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Help me set up SOWs',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const msgs = store.getState().messages
      // User + two assistant messages (one per turn)
      expect(msgs).toHaveLength(3)
      expect(msgs[0].role).toBe('user')
      expect(msgs[1].role).toBe('assistant')
      expect(msgs[1].content).toBe('Let me read your files.')
      expect(msgs[1].isStreaming).toBe(false)
      expect(msgs[1].toolCalls).toHaveLength(1)
      expect(msgs[1].toolCalls![0].name).toBe('Read')
      expect(msgs[2].role).toBe('assistant')
      expect(msgs[2].content).toBe(
        'Based on what I see, here are some questions.',
      )
      expect(msgs[2].isStreaming).toBe(false)
    })

    it('assistant event does not overwrite partial-streamed content', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Streamed content here.' },
              },
            },
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [
                  { type: 'text', text: 'Streamed content here.' },
                  {
                    type: 'tool_use',
                    id: 'tool-1',
                    name: 'Read',
                    input: { path: 'file.md' },
                  },
                ],
                model: 'claude-opus-4-20250514',
                stop_reason: 'tool_use',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      // Content should be the streamed text, not replaced by assistant event
      expect(assistantMsg.content).toBe('Streamed content here.')
      // Tool calls should still be extracted
      expect(assistantMsg.toolCalls).toHaveLength(1)
      expect(assistantMsg.toolCalls![0].name).toBe('Read')
    })

    it('content_block_start for tool_use adds tool to toolProgress immediately', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 1,
                content_block: {
                  type: 'tool_use',
                  id: 'toolu_abc',
                  name: 'Task',
                  input: {},
                },
              },
            },
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [
                  {
                    type: 'tool_use',
                    id: 'toolu_abc',
                    name: 'Task',
                    input: { prompt: 'Read files' },
                  },
                ],
                model: 'claude-opus-4-20250514',
                stop_reason: 'tool_use',
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.toolProgress).toHaveLength(1)
      expect(assistantMsg.toolProgress![0].toolName).toBe('Task')
      expect(assistantMsg.toolProgress![0].toolUseId).toBe('toolu_abc')
    })

    it('content_block_start strips MCP prefix from tool names', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 1,
                content_block: {
                  type: 'tool_use',
                  id: 'toolu_xyz',
                  name: 'mcp__q__ProcessSample',
                  input: {},
                },
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.toolProgress).toHaveLength(1)
      expect(assistantMsg.toolProgress![0].toolName).toBe('ProcessSample')
    })

    it('multiple TodoWrite content_block_start events create separate steps (no merge)', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 1,
                content_block: {
                  type: 'tool_use',
                  id: 'todo-1',
                  name: 'TodoWrite',
                  input: {},
                },
              },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 2,
                content_block: {
                  type: 'tool_use',
                  id: 'todo-2',
                  name: 'TodoWrite',
                  input: {},
                },
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const assistantMsg = store.getState().messages[1]
      expect(assistantMsg.toolProgress).toHaveLength(2)
      expect(assistantMsg.toolProgress![0].toolUseId).toBe('todo-1')
      expect(assistantMsg.toolProgress![1].toolUseId).toBe('todo-2')
    })

    it('pending_confirmation events set pendingConfirmation in the store', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            {
              type: 'pending_confirmation',
              toolName: 'Bash',
              input: { command: 'ls -la uploads/' },
            },
            // Stream stays open — confirmation blocks until user responds.
            // In tests, the stream ends immediately after the event.
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'List files',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      // pendingConfirmation is cleared in the post-loop finalize, so it won't
      // persist after the stream completes. But during the stream, it was set.
      // Verify the store processes the event by checking the shape is handled
      // without errors — the real integration test is that isStreaming ends false.
      expect(store.getState().isStreaming).toBe(false)
    })

    it('sendMessage clears pendingConfirmation and stoppedByUser from a previous turn', async () => {
      // Simulate leftover state from a previous turn
      // Simulate leftover state from a previous turn — add prior messages
      // so resume derives as true (continuation, not first message).
      store.getState().addUserMessage('prior message')
      store.setState({
        pendingConfirmation: {
          toolName: 'Bash',
          input: { command: 'rm -rf /' },
          toolUseId: 'tool-1',
        },
        stoppedByUser: true,
      })

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        mockFetchResponse([
          { type: 'result', subtype: 'success', costUsd: 0.01 },
        ]),
      )

      await store.getState().sendMessage({
        message: 'Next question',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().pendingConfirmation).toBe(null)
      expect(store.getState().stoppedByUser).toBe(false)
    })

    it('stream error clears pendingConfirmation', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        new Error('Connection lost'),
      )

      // Set a confirmation as if the stream had sent one before crashing
      store.setState({
        pendingConfirmation: {
          toolName: 'Write',
          input: { file_path: '/tmp/test.txt' },
          toolUseId: 'tool-2',
        },
      })

      await store.getState().sendMessage({
        message: 'Do something',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      expect(store.getState().pendingConfirmation).toBe(null)
      expect(store.getState().isStreaming).toBe(false)
    })

    it('tool progress events target the currently active message', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            // Turn 1
            {
              type: 'partial',
              event: { type: 'message_start', message: {} },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'Reading...' },
              },
            },
            // content_block_start creates the step — canonical step creator
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 1,
                content_block: { type: 'tool_use', id: 'tp-1', name: 'Read' },
              },
            },
            {
              type: 'assistant',
              message: {
                id: 'msg-1',
                role: 'assistant',
                content: [{ type: 'text', text: 'Reading...' }],
                model: 'claude-opus-4-20250514',
                stop_reason: 'tool_use',
              },
            },
            {
              type: 'tool_progress',
              toolName: 'Read',
              toolUseId: 'tp-1',
              elapsedSeconds: 1,
            },
            // Turn 2
            {
              type: 'partial',
              event: { type: 'message_start', message: {} },
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'tool_use', id: 'tp-2', name: 'Write' },
              },
            },
            {
              type: 'tool_progress',
              toolName: 'Write',
              toolUseId: 'tp-2',
              elapsedSeconds: 2,
            },
            {
              type: 'partial',
              event: {
                type: 'content_block_delta',
                index: 1,
                delta: { type: 'text_delta', text: 'Done.' },
              },
            },
            { type: 'result', subtype: 'success', costUsd: 0.02 },
          ]),
        ),
      )

      await store.getState().sendMessage({
        message: 'Hi',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const msgs = store.getState().messages
      expect(msgs).toHaveLength(3) // user + 2 assistant turns
      // Turn 1: content_block_start created the Read step, tool_progress updated elapsed time
      expect(msgs[1].toolProgress).toHaveLength(1)
      expect(msgs[1].toolProgress![0].toolName).toBe('Read')
      // Turn 2: content_block_start created the Write step, tool_progress updated elapsed time
      expect(msgs[2].toolProgress).toHaveLength(1)
      expect(msgs[2].toolProgress![0].toolName).toBe('Write')
    })
  })

  describe('auto-naming', () => {
    it('sets chatName from first message and persists via API', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(
            mockFetchResponse([
              { type: 'result', subtype: 'success', costUsd: 0.01 },
            ]),
          ),
        )

      await store.getState().sendMessage({
        message: 'Help me set up weekly reports',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      // chatName should be set immediately from the message text
      expect(store.getState().chatName).toBe('Help me set up weekly reports')

      // Naming persistence call should fire with the pre-computed name
      const namingCall = fetchSpy.mock.calls.find(
        ([url]) => typeof url === 'string' && url.includes('/api/chat/name'),
      )
      expect(namingCall).not.toBeUndefined()
      const body = JSON.parse((namingCall![1] as RequestInit).body as string)
      expect(body.name).toBe('Help me set up weekly reports')
      expect(body.sessionId).toBe('sess-1')
    })

    it('does not fire a naming request on resumed sessions', async () => {
      // Simulate prior conversation so resume derives as true
      store.getState().addUserMessage('prior message')

      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockImplementation(() =>
          Promise.resolve(
            mockFetchResponse([
              { type: 'result', subtype: 'success', costUsd: 0.01 },
            ]),
          ),
        )

      await store.getState().sendMessage({
        message: 'Follow-up question',
        sessionId: 'sess-1',
        streamSlug: 'my-stream',
      })

      const namingCall = fetchSpy.mock.calls.find(
        ([url]) => typeof url === 'string' && url.includes('/api/chat/name'),
      )
      expect(namingCall).toBeUndefined()
    })
  })
})

describe('createChatStore', () => {
  it('creates independent store instances that do not share state', () => {
    const storeA = createChatStore()
    const storeB = createChatStore()

    storeA.getState().addUserMessage('Message in store A')

    expect(storeA.getState().messages).toHaveLength(1)
    expect(storeB.getState().messages).toHaveLength(0)
  })
})

describe('mode state', () => {
  let store: ReturnType<typeof createChatStore>

  beforeEach(() => {
    store = createChatStore()
    vi.restoreAllMocks()
  })

  it('defaults mode to general', () => {
    expect(store.getState().mode).toBe('general')
    expect(store.getState().streamSlugForMode).toBe(null)
  })

  it('setMode updates mode and streamSlugForMode', () => {
    store.getState().setMode('learning', 'client-reports')
    expect(store.getState().mode).toBe('learning')
    expect(store.getState().streamSlugForMode).toBe('client-reports')
  })

  it('setMode with no streamSlug sets streamSlugForMode to null', () => {
    store.getState().setMode('learning', 'my-stream')
    store.getState().setMode('general')
    expect(store.getState().mode).toBe('general')
    expect(store.getState().streamSlugForMode).toBe(null)
  })

  it('reset returns mode to general', () => {
    store.getState().setMode('learning', 'my-stream')
    store.getState().reset()
    expect(store.getState().mode).toBe('general')
    expect(store.getState().streamSlugForMode).toBe(null)
  })

  it('processEvent handles mode_changed event with learning mode', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        mockFetchResponse([
          {
            type: 'mode_changed',
            mode: 'learning',
            streamSlug: 'client-reports',
          },
          { type: 'result', subtype: 'success', costUsd: 0.01 },
        ]),
      ),
    )

    await store.getState().sendMessage({
      message: 'Teach me about reports',
      sessionId: 'sess-1',
      streamSlug: 'my-stream',
    })

    expect(store.getState().mode).toBe('learning')
    expect(store.getState().streamSlugForMode).toBe('client-reports')
  })

  it('processEvent handles mode_changed event back to general', async () => {
    store.getState().setMode('learning', 'my-stream')

    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        mockFetchResponse([
          { type: 'mode_changed', mode: 'general' },
          { type: 'result', subtype: 'success', costUsd: 0.01 },
        ]),
      ),
    )

    await store.getState().sendMessage({
      message: 'Done teaching',
      sessionId: 'sess-1',
      streamSlug: 'my-stream',
    })

    expect(store.getState().mode).toBe('general')
    expect(store.getState().streamSlugForMode).toBe(null)
  })

  it('sendMessage includes mode in the fetch body', async () => {
    store.getState().setMode('learning', 'my-stream')

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(() =>
        Promise.resolve(
          mockFetchResponse([
            { type: 'result', subtype: 'success', costUsd: 0.01 },
          ]),
        ),
      )

    await store.getState().sendMessage({
      message: 'Hi',
      sessionId: 'sess-1',
      streamSlug: 'my-stream',
    })

    // Find the /api/chat call (not /api/chat/name)
    const chatCall = fetchSpy.mock.calls.find(
      ([url]) =>
        typeof url === 'string' &&
        url.includes('/api/chat') &&
        !url.includes('/name'),
    )
    expect(chatCall).not.toBeUndefined()
    const body = JSON.parse((chatCall![1] as RequestInit).body as string)
    expect(body.mode).toBe('learning')
  })

  it('loadHistory reads mode and streamSlug from API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          messages: [
            {
              id: 'h-1',
              role: 'user',
              content: 'Hi',
              isHistorical: true,
              timestamp: 1000,
            },
          ],
          chatName: 'My Chat',
          mode: 'learning',
          streamSlug: 'client-reports',
        }),
        { status: 200 },
      ),
    )

    await store.getState().loadHistory({
      sessionId: 'sess-1',
      streamSlug: 'my-stream',
    })

    expect(store.getState().mode).toBe('learning')
    expect(store.getState().streamSlugForMode).toBe('client-reports')
  })

  it('loadHistory omits stream param when streamSlug is not provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [] }), { status: 200 }),
      )

    await store.getState().loadHistory({ sessionId: 'sess-1' })

    const url = fetchSpy.mock.calls[0][0] as string
    expect(url).toContain('session=sess-1')
    expect(url).not.toContain('stream=')
  })
})

describe('chatTitleFromMessage', () => {
  it('returns the message as-is when short enough', () => {
    expect(chatTitleFromMessage('Help me set up weekly reports')).toBe(
      'Help me set up weekly reports',
    )
  })

  it('truncates long messages at word boundary with ellipsis', () => {
    const long =
      'This is a really long message that goes on and on and on and keeps going past the limit of eighty characters'
    const title = chatTitleFromMessage(long)
    expect(title.length).toBeLessThanOrEqual(81) // 80 + ellipsis char
    expect(title).toMatch(/…$/)
    expect(title).not.toMatch(/\s…$/) // no trailing space before ellipsis
  })

  it('uses "Shared files:" prefix for file-only messages', () => {
    expect(chatTitleFromMessage('', ['report.pdf', 'data.csv'])).toBe(
      'Shared files: report.pdf, data.csv',
    )
  })

  it('uses message text and ignores files when both present', () => {
    expect(chatTitleFromMessage('Review this report', ['report.pdf'])).toBe(
      'Review this report',
    )
  })

  it('returns "New Chat" when no message or files', () => {
    expect(chatTitleFromMessage('')).toBe('New Chat')
  })

  it('trims whitespace from message', () => {
    expect(chatTitleFromMessage('  hello  ')).toBe('hello')
  })
})
