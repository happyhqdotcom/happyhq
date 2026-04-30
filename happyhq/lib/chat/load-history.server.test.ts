import { afterEach, describe, expect, it, vi } from 'vitest'

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
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

import { loadChatHistory } from './load-history.server'

afterEach(() => {
  vi.clearAllMocks()
  mockReadTextFile.mockResolvedValue(null)
  mockResolveSessionJournal.mockResolvedValue(null)
})

describe('loadChatHistory', () => {
  it('resolves user-message file slugs back to original display names so file pills render the right type after reload', async () => {
    mockResolveSessionJournal.mockResolvedValue('/journal.jsonl')
    mockReadFile.mockResolvedValue('journal-content')
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({
        name: 'Q4 prep',
        uploads: {
          'q4-report': 'Q4 Report.pdf',
          budget: 'budget.xlsx',
        },
      }),
    )
    mockParseJournalEntries.mockReturnValue([
      {
        id: 'u1',
        role: 'user',
        content: 'Take a look',
        files: ['q4-report', 'budget'],
        timestamp: 1000,
      },
    ])

    const result = await loadChatHistory('sess-1')

    expect(result.messages[0].files).toEqual(['Q4 Report.pdf', 'budget.xlsx'])
  })

  it('falls back to the slug when no display name is recorded — historical chats stay readable, just with a generic pill', async () => {
    mockResolveSessionJournal.mockResolvedValue('/journal.jsonl')
    mockReadFile.mockResolvedValue('journal-content')
    mockReadTextFile.mockResolvedValue(JSON.stringify({ name: 'Legacy' }))
    mockParseJournalEntries.mockReturnValue([
      {
        id: 'u1',
        role: 'user',
        content: '',
        files: ['legacy-slug'],
        timestamp: 1000,
      },
    ])

    const result = await loadChatHistory('sess-1')

    expect(result.messages[0].files).toEqual(['legacy-slug'])
  })

  it('leaves messages without files untouched', async () => {
    mockResolveSessionJournal.mockResolvedValue('/journal.jsonl')
    mockReadFile.mockResolvedValue('journal-content')
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({ uploads: { foo: 'foo.pdf' } }),
    )
    mockParseJournalEntries.mockReturnValue([
      { id: 'u1', role: 'user', content: 'Hi', timestamp: 1000 },
    ])

    const result = await loadChatHistory('sess-1')

    expect(result.messages[0].files).toBeUndefined()
  })
})
