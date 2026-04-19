import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const { mockReadFile, mockReaddir, mockStat, mockAccess } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockReaddir: vi.fn(),
  mockStat: vi.fn(),
  mockAccess: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    readdir: mockReaddir,
    stat: mockStat,
    access: mockAccess,
  },
  readFile: mockReadFile,
  readdir: mockReaddir,
  stat: mockStat,
  access: mockAccess,
}))

// Mock homedir to control ~/.claude/projects paths
vi.mock('node:os', () => ({
  default: { homedir: () => '/mock/home' },
  homedir: () => '/mock/home',
}))

import type { Dirent, Stats } from 'fs'

import { assembleDebugBundle } from './assemble-debug-bundle.server'

function enoent(): NodeJS.ErrnoException {
  const err = new Error('ENOENT') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

function makeDirent(name: string, isDir: boolean): Dirent {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false,
    parentPath: '',
    path: '',
  } as Dirent
}

function makeStats(overrides: Partial<Stats> = {}): Stats {
  return {
    isDirectory: () => true,
    mtime: new Date('2025-01-15T10:00:00.000Z'),
    birthtime: new Date('2025-01-10T08:00:00.000Z'),
    ...overrides,
  } as Stats
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('assembleDebugBundle', () => {
  it('produces a bundle with all fields populated when everything exists', async () => {
    // Mock access for primary JSONL path (resolveSessionJournal)
    mockAccess.mockResolvedValue(undefined)

    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.endsWith('chat.json')) return JSON.stringify({ name: 'Test Chat' })
      if (p.endsWith('.jsonl'))
        return '{"type":"human"}\n{"type":"assistant"}\n'
      if (p.endsWith('playbook.md')) return '# Playbook'
      if (p.endsWith('design.md')) return '# Design Spec'
      throw enoent()
    })

    mockStat.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.includes('.chats'))
        return makeStats({
          birthtime: new Date('2025-02-01T12:00:00.000Z'),
        })
      return makeStats()
    })

    // listDirectory for specs/
    mockReaddir.mockResolvedValue([makeDirent('design.md', false)] as Dirent[])

    // chat.json is now read from root: MOCK_ROOT/.chats/session-abc/chat.json
    const bundle = await assembleDebugBundle('my-stream', 'session-abc')

    expect(bundle.version).toBe(1)
    expect(bundle.appVersion).toBe('0.1.0')
    expect(bundle.streamName).toBe('my-stream')
    expect(bundle.chat.sessionId).toBe('session-abc')
    expect(bundle.chat.name).toBe('Test Chat')
    expect(bundle.chat.createdAt).toBe('2025-02-01T12:00:00.000Z')
    expect(bundle.rawJournal).toBe('{"type":"human"}\n{"type":"assistant"}\n')
    expect(bundle.playbook).toBe('# Playbook')
    expect(bundle.specs).toEqual([
      { name: 'design.md', content: '# Design Spec' },
    ])
    expect(typeof bundle.environment.platform).toBe('string')
    expect(typeof bundle.environment.nodeVersion).toBe('string')
    expect(typeof bundle.environment.arch).toBe('string')
    expect(bundle.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns null/empty for all filesystem fields when nothing exists', async () => {
    mockAccess.mockRejectedValue(enoent())
    mockReadFile.mockRejectedValue(enoent())
    mockReaddir.mockRejectedValue(enoent())
    mockStat.mockRejectedValue(enoent())

    const bundle = await assembleDebugBundle('empty-stream', 'no-session')

    expect(bundle.version).toBe(1)
    expect(bundle.rawJournal).toBeNull()
    expect(bundle.playbook).toBeNull()
    expect(bundle.specs).toEqual([])
    expect(bundle.chat.name).toBeNull()
    expect(bundle.chat.createdAt).toBeNull()
  })

  it('preserves rawJournal as an unparsed string including newlines', async () => {
    const rawContent =
      '{"type":"human","message":"hello"}\n{"type":"assistant","message":"hi"}\n'

    mockAccess.mockResolvedValue(undefined)
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.endsWith('.jsonl')) return rawContent
      throw enoent()
    })
    mockStat.mockRejectedValue(enoent())
    mockReaddir.mockRejectedValue(enoent())

    const bundle = await assembleDebugBundle('my-stream', 'session-abc')

    expect(bundle.rawJournal).toBe(rawContent)
  })

  it('reads only .md files from the specs directory', async () => {
    mockAccess.mockRejectedValue(enoent())
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.endsWith('design.md')) return '# Design'
      throw enoent()
    })
    mockStat.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      // listDirectory calls stat for each entry
      if (p.includes('specs')) return makeStats()
      throw enoent()
    })
    mockReaddir.mockResolvedValue([
      makeDirent('design.md', false),
      makeDirent('notes.txt', false),
      makeDirent('subdir', true),
    ] as Dirent[])

    const bundle = await assembleDebugBundle('my-stream', 'session-abc')

    expect(bundle.specs).toEqual([{ name: 'design.md', content: '# Design' }])
  })

  it('returns chat.name as null when chat.json is malformed', async () => {
    mockAccess.mockRejectedValue(enoent())
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.endsWith('chat.json')) return '{broken json'
      throw enoent()
    })
    mockStat.mockResolvedValue(
      makeStats({ birthtime: new Date('2025-03-01T12:00:00.000Z') }),
    )
    mockReaddir.mockRejectedValue(enoent())

    const bundle = await assembleDebugBundle('my-stream', 'session-abc')

    expect(bundle.chat.name).toBeNull()
    expect(bundle.chat.createdAt).toBe('2025-03-01T12:00:00.000Z')
  })

  it('falls back to scanning project dirs when primary JSONL path is missing', async () => {
    const jsonlContent = '{"type":"result"}\n'

    // Primary path access fails, triggering fallback scan
    mockAccess.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      // Primary path (workspace root encoded dir) fails
      if (p.includes('projects/-mock-home-HappyHQ/')) throw enoent()
      // Fallback candidate succeeds
      return undefined
    })

    // readdir returns one subdir for the fallback scan
    mockReaddir.mockImplementation(async (dirPath: unknown) => {
      const p = dirPath as string
      if (p.includes('.claude/projects'))
        return [makeDirent('some-project', true)] as Dirent[]
      // specs dir doesn't exist
      throw enoent()
    })

    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.endsWith('.jsonl')) return jsonlContent
      throw enoent()
    })

    mockStat.mockRejectedValue(enoent())

    const bundle = await assembleDebugBundle('my-stream', 'session-abc')

    expect(bundle.rawJournal).toBe(jsonlContent)
  })
})
