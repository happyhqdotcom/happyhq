import { afterEach, describe, expect, it, vi } from 'vitest'

// --- Mocks ---

const {
  mockReadFile,
  mockParseJournalEntries,
  mockReadTextFile,
  mockResolveSessionJournal,
} = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockParseJournalEntries: vi.fn(),
  mockReadTextFile: vi.fn(),
  mockResolveSessionJournal: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockReadFile },
  readFile: mockReadFile,
}))

vi.mock('@/lib/chat/journal-path.server', () => ({
  resolveSessionJournal: mockResolveSessionJournal,
}))

vi.mock('@/lib/chat/parse-history.server', () => ({
  parseJournalEntries: mockParseJournalEntries,
}))

vi.mock('@/lib/fs/read.server', () => ({
  readTextFile: mockReadTextFile,
}))

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/Users/philo/HappyHQ',
}))

import { GET } from './route'

afterEach(() => {
  vi.clearAllMocks()
  // Default: no chat.json
  mockReadTextFile.mockResolvedValue(null)
  // Default: no journal found
  mockResolveSessionJournal.mockResolvedValue(null)
})

// --- Helpers ---

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/chat/history')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url)
}

// --- Tests ---

describe('GET /api/chat/history', () => {
  it('accepts requests without stream parameter (stream-less chats)', async () => {
    const response = await GET(makeRequest({ session: 'abc' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.messages).toEqual([])
  })

  it('returns 400 when session parameter is missing', async () => {
    const response = await GET(makeRequest({}))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing session parameter' })
  })

  it('rejects session IDs with path separators', async () => {
    const r1 = await GET(makeRequest({ session: '../etc/passwd' }))
    expect(r1.status).toBe(400)

    const r2 = await GET(makeRequest({ session: 'a/b' }))
    expect(r2.status).toBe(400)

    const r3 = await GET(makeRequest({ session: 'a\\\\b' }))
    expect(r3.status).toBe(400)
  })

  it('returns parsed messages from the primary JSONL path', async () => {
    mockResolveSessionJournal.mockResolvedValue(
      '/Users/philo/.claude/projects/-Users-philo-HappyHQ-my-stream/sess-123.jsonl',
    )
    mockReadFile.mockResolvedValue('file-content')
    const mockMessages = [
      { id: 'u1', role: 'user', content: 'Hello', timestamp: 1000 },
      { id: 'a1', role: 'assistant', content: 'Hi', timestamp: 2000 },
    ]
    mockParseJournalEntries.mockReturnValue(mockMessages)

    const response = await GET(makeRequest({ session: 'sess-123' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.messages).toHaveLength(2)
    expect(body.messages[0].role).toBe('user')
    expect(body.messages[1].role).toBe('assistant')
  })

  it('annotates CreateTask tool calls with taskStarted from chat.json startedTasks', async () => {
    mockResolveSessionJournal.mockResolvedValue(
      '/Users/philo/.claude/projects/-Users-philo-HappyHQ-my-stream/sess-123.jsonl',
    )
    mockReadFile.mockResolvedValue('journal-content')
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({ name: 'Test', startedTasks: ['my-task'] }),
    )
    const mockMessages = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Here is a task',
        timestamp: 1000,
        toolCalls: [
          { id: 'tc-1', name: 'CreateTask', input: { name: 'my-task' } },
          { id: 'tc-2', name: 'CreateTask', input: { name: 'other-task' } },
        ],
      },
    ]
    mockParseJournalEntries.mockReturnValue(mockMessages)

    const response = await GET(makeRequest({ session: 'sess-123' }))
    const body = await response.json()

    expect(body.messages[0].toolCalls[0].taskStarted).toBe(true)
    expect(body.messages[0].toolCalls[1].taskStarted).toBeUndefined()
  })

  it('does not annotate taskStarted when startedTasks is absent', async () => {
    mockResolveSessionJournal.mockResolvedValue(
      '/Users/philo/.claude/projects/-Users-philo-HappyHQ-my-stream/sess-123.jsonl',
    )
    mockReadFile.mockResolvedValue('journal-content')
    mockReadTextFile.mockResolvedValue(JSON.stringify({ name: 'Test' }))
    const mockMessages = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'A task',
        timestamp: 1000,
        toolCalls: [
          { id: 'tc-1', name: 'CreateTask', input: { name: 'my-task' } },
        ],
      },
    ]
    mockParseJournalEntries.mockReturnValue(mockMessages)

    const response = await GET(makeRequest({ session: 'sess-123' }))
    const body = await response.json()

    expect(body.messages[0].toolCalls[0].taskStarted).toBeUndefined()
  })

  it('returns 500 for non-ENOENT read errors', async () => {
    mockResolveSessionJournal.mockResolvedValue(
      '/Users/philo/.claude/projects/-Users-philo-HappyHQ-my-stream/sess-123.jsonl',
    )
    mockReadFile.mockRejectedValue(new Error('permission denied'))

    const response = await GET(makeRequest({ session: 'sess-123' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })

  describe('journal not found', () => {
    it('returns empty messages when resolveSessionJournal returns null', async () => {
      mockResolveSessionJournal.mockResolvedValue(null)

      const response = await GET(makeRequest({ session: 'missing-sess' }))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.messages).toEqual([])
    })

    it('returns empty messages for stream-less chats when journal is not found', async () => {
      mockResolveSessionJournal.mockResolvedValue(null)

      const response = await GET(makeRequest({ session: 'sess-123' }))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body.messages).toEqual([])
    })
  })
})
