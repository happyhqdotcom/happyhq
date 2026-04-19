import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockStreamExists,
  mockReadChatJson,
  mockQuery,
  mockChatAgentOptions,
  mockBuildReminders,
  mockSetSessionMode,
  mockGetSessionMode,
  mockClearSessionMode,
} = vi.hoisted(() => ({
  mockStreamExists: vi.fn(),
  mockReadChatJson: vi.fn(),
  mockQuery: vi.fn(),
  mockChatAgentOptions: vi.fn(),
  mockBuildReminders: vi.fn(),
  mockSetSessionMode: vi.fn(),
  mockGetSessionMode: vi.fn(),
  mockClearSessionMode: vi.fn(),
}))

vi.mock('@/lib/fs/read.server', () => ({
  streamExists: mockStreamExists,
  readChatJson: mockReadChatJson,
}))

vi.mock('@/lib/agents/config.server', () => ({
  chatAgentOptions: mockChatAgentOptions,
}))

vi.mock('@/lib/agents/reminders.server', () => ({
  buildReminders: mockBuildReminders,
}))

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
}))

vi.mock('@/lib/chat/session-mode', () => ({
  setSessionMode: mockSetSessionMode,
  getSessionMode: mockGetSessionMode,
  clearSessionMode: mockClearSessionMode,
}))

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/happyhq',
}))

vi.mock('@/lib/fs/paths', () => ({
  streamPath: (name: string) => `/mock/happyhq/${name}`,
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// Helper: create an async generator that yields SDK messages
async function* mockSdkMessages(messages: Array<Record<string, unknown>>) {
  for (const msg of messages) {
    yield msg
  }
}

// Helper: read all NDJSON lines from a streaming Response
async function readNDJSON(response: Response): Promise<unknown[]> {
  const text = await response.text()
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line))
}

const validBody = {
  message: 'Hello Q',
  sessionId: 'abc-123',
  streamSlug: 'my-stream',
  resume: false,
}

describe('POST /api/chat', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  // Default: buildReminders returns empty array (no reminders prepended)
  beforeEach(() => {
    mockBuildReminders.mockResolvedValue([])
  })

  it('returns 400 for invalid JSON', async () => {
    const request = new Request('http://localhost/api/chat', {
      method: 'POST',
      body: 'not json',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when message or sessionId is missing', async () => {
    const response = await POST(makeRequest({ sessionId: 'abc' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing required fields' })
  })

  it('allows requests without streamSlug (stream-less chats)', async () => {
    mockChatAgentOptions.mockReturnValue({})
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    const response = await POST(
      makeRequest({ message: 'Hello', sessionId: 'abc-123', resume: false }),
    )

    expect(response.status).toBe(200)
  })

  it('returns 404 when stream does not exist', async () => {
    mockStreamExists.mockResolvedValue(false)

    const response = await POST(makeRequest(validBody))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Stream not found' })
  })

  it('filters and forwards stream_event messages as partial events', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})

    const sdkEvent = {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Hello' },
    }
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'stream_event',
          event: sdkEvent,
          parent_tool_use_id: null,
          uuid: '1',
          session_id: 's1',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    const response = await POST(makeRequest(validBody))
    const events = await readNDJSON(response)

    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson')
    expect(events[0]).toEqual({ type: 'partial', event: sdkEvent })
  })

  it('filters and forwards assistant messages', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})

    const betaMessage = {
      id: 'msg_1',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      model: 'claude-sonnet-4-5-20250929',
      stop_reason: 'end_turn',
    }
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'assistant',
          message: betaMessage,
          parent_tool_use_id: null,
          uuid: '1',
          session_id: 's1',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    const response = await POST(makeRequest(validBody))
    const events = await readNDJSON(response)

    expect(events[0]).toEqual({ type: 'assistant', message: betaMessage })
  })

  it('filters and forwards tool_progress messages', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})

    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'tool_progress',
          tool_name: 'Read',
          tool_use_id: 'tu_1',
          parent_tool_use_id: null,
          elapsed_time_seconds: 2.5,
          uuid: '1',
          session_id: 's1',
        },
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    const response = await POST(makeRequest(validBody))
    const events = await readNDJSON(response)

    expect(events[0]).toEqual({
      type: 'tool_progress',
      toolName: 'Read',
      toolUseId: 'tu_1',
      elapsedSeconds: 2.5,
    })
  })

  it('forwards result messages with success data', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})

    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'result',
          subtype: 'success',
          result: 'Task completed',
          total_cost_usd: 0.05,
        },
      ]),
    )

    const response = await POST(makeRequest(validBody))
    const events = await readNDJSON(response)

    expect(events).toEqual([
      {
        type: 'result',
        subtype: 'success',
        result: 'Task completed',
        costUsd: 0.05,
      },
    ])
  })

  it('forwards result messages with error data', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})

    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'result',
          subtype: 'error_during_execution',
          errors: ['Something broke'],
          total_cost_usd: 0.02,
        },
      ]),
    )

    const response = await POST(makeRequest(validBody))
    const events = await readNDJSON(response)

    expect(events).toEqual([
      {
        type: 'result',
        subtype: 'error_during_execution',
        errors: ['Something broke'],
        costUsd: 0.02,
      },
    ])
  })

  it('drops non-forwarded SDK message types', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})

    mockQuery.mockReturnValue(
      mockSdkMessages([
        { type: 'system', message: 'starting' },
        { type: 'status', message: 'running' },
        { type: 'hook_started', hook: 'test' },
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    const response = await POST(makeRequest(validBody))
    const events = await readNDJSON(response)

    // Only the result event should be forwarded; system/status/hook are filtered
    expect(events).toHaveLength(1)
    expect(events[0]).toHaveProperty('type', 'result')
  })

  it('catches SDK errors and sends them as error events', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})

    // Simulate the async generator throwing mid-stream
    async function* throwingGenerator() {
      yield {
        type: 'stream_event',
        event: { type: 'message_start', message: {} },
        parent_tool_use_id: null,
        uuid: '1',
        session_id: 's1',
      }
      throw new Error('SDK connection lost')
    }
    mockQuery.mockReturnValue(throwingGenerator())

    const response = await POST(makeRequest(validBody))
    const events = await readNDJSON(response)

    // First event is the partial, second is the error
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({
      type: 'error',
      message: 'SDK connection lost',
    })
  })

  it('calls chatAgentOptions with mode and streamSlug', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    await POST(makeRequest(validBody))

    expect(mockChatAgentOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'general',
        streamSlug: 'my-stream',
        sessionId: 'abc-123',
      }),
    )
  })

  it('prepends system reminders when buildReminders returns content', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})
    mockBuildReminders.mockResolvedValue(['You are in learning mode.'])
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    const response = await POST(
      makeRequest({
        ...validBody,
        mode: 'learning',
      }),
    )
    await response.text() // drain the stream to ensure start() completes

    // The prompt passed to query should have reminders prepended
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('<system-reminder>'),
      }),
    )
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining('Hello Q'),
      }),
    )
  })

  it('uses client-provided mode and modeStreamSlug on resume', async () => {
    // Client is authoritative for mode — it reads from chat.json via
    // loadHistory and sends the correct mode in the request body.
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})
    mockBuildReminders.mockResolvedValue(['learning layer content'])
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    await POST(
      makeRequest({
        ...validBody,
        resume: true,
        mode: 'learning',
        modeStreamSlug: 'client-reports',
      }),
    )

    expect(mockChatAgentOptions).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'learning',
        streamSlug: 'client-reports',
      }),
    )
    expect(mockSetSessionMode).toHaveBeenCalledWith(
      'abc-123',
      'learning',
      'client-reports',
    )
  })

  it('clears session mode in finally block', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockChatAgentOptions.mockReturnValue({})
    mockQuery.mockReturnValue(
      mockSdkMessages([
        {
          type: 'result',
          subtype: 'success',
          result: 'done',
          total_cost_usd: 0.01,
        },
      ]),
    )

    const response = await POST(makeRequest(validBody))
    await response.text() // drain the stream

    expect(mockClearSessionMode).toHaveBeenCalledWith('abc-123')
  })
})
