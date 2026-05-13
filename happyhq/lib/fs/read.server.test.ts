import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock constants — must be before importing the module under test
vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

// vi.hoisted() runs before vi.mock hoisting, so these are available in the factory
const { mockAccess, mockOpen, mockReadFile, mockReaddir, mockStat } =
  vi.hoisted(() => {
    const mockReadFile = vi.fn()
    const mockStat = vi.fn()
    // open() returns a FileHandle — fake one whose stat/readFile/close delegate
    // to the same mocks the rest of the suite drives, so listWebInputItems'
    // open+stat+readFile+close flow works without separate mock plumbing.
    const mockOpen = vi.fn(async (filePath: unknown) => ({
      stat: () => mockStat(filePath),
      readFile: (encoding: unknown) => mockReadFile(filePath, encoding),
      close: vi.fn().mockResolvedValue(undefined),
    }))
    return {
      mockAccess: vi.fn(),
      mockOpen,
      mockReadFile,
      mockReaddir: vi.fn(),
      mockStat,
    }
  })

// readStreams gates on ensureDataRoot; stub it so these tests don't touch the real fs.
vi.mock('./data-root.server', () => ({
  ensureDataRoot: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    access: mockAccess,
    open: mockOpen,
    readFile: mockReadFile,
    readdir: mockReaddir,
    stat: mockStat,
  },
  access: mockAccess,
  open: mockOpen,
  readFile: mockReadFile,
  readdir: mockReaddir,
  stat: mockStat,
}))

import type { Dirent, Stats } from 'fs'

import {
  listChats,
  listDirectory,
  listFileItems,
  listSamples,
  parseRunInfo,
  readChatJson,
  readStreamContent,
  readStreams,
  readTextFile,
  streamExists,
} from './read.server'

function enoent(): NodeJS.ErrnoException {
  const err = new Error('ENOENT') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

function eacces(): NodeJS.ErrnoException {
  const err = new Error('EACCES') as NodeJS.ErrnoException
  err.code = 'EACCES'
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

// --- readTextFile ---

describe('readTextFile', () => {
  it('returns file contents for an existing file', async () => {
    mockReadFile.mockResolvedValue('# Hello')
    const result = await readTextFile(
      path.join(MOCK_ROOT, 'stream/playbook.md'),
    )
    expect(result).toBe('# Hello')
  })

  it('returns null for a missing file', async () => {
    mockReadFile.mockRejectedValue(enoent())
    const result = await readTextFile(
      path.join(MOCK_ROOT, 'stream/playbook.md'),
    )
    expect(result).toBeNull()
  })

  it('throws for non-ENOENT errors', async () => {
    mockReadFile.mockRejectedValue(eacces())
    await expect(
      readTextFile(path.join(MOCK_ROOT, 'stream/playbook.md')),
    ).rejects.toThrow('EACCES')
  })

  it('rejects paths outside ~/HappyHQ/', async () => {
    await expect(readTextFile('/etc/passwd')).rejects.toThrow(
      'outside ~/HappyHQ/',
    )
  })
})

// --- listDirectory ---

describe('listDirectory', () => {
  it('returns FileEntry[] with correct relative paths', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('tone.md', false),
      makeDirent('voice.md', false),
    ] as Dirent[])
    mockStat.mockResolvedValue(makeStats())

    const result = await listDirectory(path.join(MOCK_ROOT, 'stream/specs'))
    expect(result).toEqual([
      {
        name: 'tone.md',
        path: 'stream/specs/tone.md',
        type: 'file',
        title: null,
        modifiedAt: '2025-01-15T10:00:00.000Z',
      },
      {
        name: 'voice.md',
        path: 'stream/specs/voice.md',
        type: 'file',
        title: null,
        modifiedAt: '2025-01-15T10:00:00.000Z',
      },
    ])
  })

  it('distinguishes files from directories', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('file.md', false),
      makeDirent('subdir', true),
    ] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockRejectedValue(enoent())

    const result = await listDirectory(path.join(MOCK_ROOT, 'stream'))
    expect(result[0].type).toBe('file')
    expect(result[1].type).toBe('directory')
  })

  it('returns empty array for a missing directory', async () => {
    mockReaddir.mockRejectedValue(enoent())
    const result = await listDirectory(path.join(MOCK_ROOT, 'stream/specs'))
    expect(result).toEqual([])
  })

  it('throws for non-ENOENT errors', async () => {
    mockReaddir.mockRejectedValue(eacces())
    await expect(
      listDirectory(path.join(MOCK_ROOT, 'stream/specs')),
    ).rejects.toThrow('EACCES')
  })

  it('rejects paths outside ~/HappyHQ/', async () => {
    await expect(listDirectory('/etc')).rejects.toThrow('outside ~/HappyHQ/')
  })
})

// --- listChats ---

describe('listChats', () => {
  it('returns empty array when .chats/ does not exist', async () => {
    mockReaddir.mockRejectedValue(enoent())
    const result = await listChats('my-stream')
    expect(result).toEqual([])
  })

  it('returns empty array when .chats/ has no subdirectories', async () => {
    mockReaddir.mockResolvedValue([])
    const result = await listChats('my-stream')
    expect(result).toEqual([])
  })

  it('reads chat.json and returns name, sessionId, and createdAt for matching stream', async () => {
    mockReaddir.mockResolvedValue([makeDirent('session-abc', true)] as Dirent[])
    mockStat.mockResolvedValue(
      makeStats({ birthtime: new Date('2025-03-01T12:00:00.000Z') }),
    )
    mockReadFile.mockResolvedValue(
      JSON.stringify({ name: 'My Chat', streamSlug: 'my-stream' }),
    )

    const result = await listChats('my-stream')
    expect(result).toEqual([
      {
        sessionId: 'session-abc',
        name: 'My Chat',
        createdAt: '2025-03-01T12:00:00.000Z',
      },
    ])
  })

  it('filters out chats belonging to a different stream', async () => {
    mockReaddir.mockResolvedValue([makeDirent('session-abc', true)] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockResolvedValue(
      JSON.stringify({ name: 'Other Chat', streamSlug: 'other-stream' }),
    )

    const result = await listChats('my-stream')
    expect(result).toEqual([])
  })

  it('returns name: null when chat.json is missing but streamSlug matches', async () => {
    // With missing chat.json, streamSlug defaults to null, so this chat won't match
    mockReaddir.mockResolvedValue([makeDirent('session-abc', true)] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockRejectedValue(enoent())

    const result = await listChats('my-stream')
    // No streamSlug in chat.json means it won't match any stream filter
    expect(result).toHaveLength(0)
  })

  it('returns name: null when chat.json is malformed', async () => {
    mockReaddir.mockResolvedValue([makeDirent('session-abc', true)] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockResolvedValue('{not valid json')

    const result = await listChats('my-stream')
    // Malformed chat.json — streamSlug is null, doesn't match stream filter
    expect(result).toHaveLength(0)
  })

  it('sorts newest-first by birthtime', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('older-session', true),
      makeDirent('newer-session', true),
    ] as Dirent[])
    mockStat.mockImplementation(async (p: unknown) => {
      const dirPath = p as string
      if (dirPath.includes('newer-session')) {
        return makeStats({ birthtime: new Date('2025-03-02T00:00:00.000Z') })
      }
      return makeStats({ birthtime: new Date('2025-03-01T00:00:00.000Z') })
    })
    mockReadFile.mockResolvedValue(JSON.stringify({ streamSlug: 'my-stream' }))

    const result = await listChats('my-stream')
    expect(result[0].sessionId).toBe('newer-session')
    expect(result[1].sessionId).toBe('older-session')
  })

  it('skips non-directory entries in .chats/', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('session-abc', true),
      makeDirent('.DS_Store', false),
    ] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockResolvedValue(JSON.stringify({ streamSlug: 'my-stream' }))

    const result = await listChats('my-stream')
    expect(result).toHaveLength(1)
    expect(result[0].sessionId).toBe('session-abc')
  })

  it('throws for non-ENOENT errors', async () => {
    mockReaddir.mockRejectedValue(eacces())
    await expect(listChats('my-stream')).rejects.toThrow('EACCES')
  })
})

// --- readStreamContent ---

describe('readStreamContent', () => {
  it('assembles StreamContent from filesystem reads', async () => {
    // playbook.md exists; .meta.json reads return ENOENT
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.endsWith('playbook.md')) return '# Playbook content'
      if (p.endsWith('.meta.json')) throw enoent()
      if (p.endsWith('.run.json')) throw enoent()
      if (p.endsWith('INDEX.md')) throw enoent()
      throw enoent()
    })
    // listDirectory calls (specs/, tasks/) return file dirents;
    // listSamples (samples/) needs a category dir then sample dir with original.*
    // listChats (.chats/) returns empty
    mockReaddir.mockImplementation(async (dirPath: unknown) => {
      const p = dirPath as string
      if (p.includes('.chats')) return []
      if (
        p.includes('samples') &&
        !p.includes('reports') &&
        !p.includes('acme')
      )
        return [makeDirent('reports', true)] as Dirent[]
      if (p.includes('reports') && !p.includes('acme'))
        return [makeDirent('acme', true)] as Dirent[]
      if (p.includes('acme')) return ['original.pdf']
      return [makeDirent('tone.md', false)] as Dirent[]
    })
    mockStat.mockResolvedValue(makeStats())
    mockAccess.mockRejectedValue(enoent())

    const result = await readStreamContent('my-stream')
    expect(result.playbook).toBe('# Playbook content')
    expect(result.specs).toHaveLength(1)
    expect(result.specs[0].name).toBe('tone.md')
    expect(result.samples).toHaveLength(1)
    expect(result.samples[0].name).toBe('acme')
    expect(result.sampleTypes).toHaveLength(1)
    expect(result.sampleTypes[0].slug).toBe('reports')
  })

  it('returns null/empty for missing parts without throwing', async () => {
    // All reads return ENOENT
    mockReadFile.mockRejectedValue(enoent())
    mockReaddir.mockRejectedValue(enoent())

    const result = await readStreamContent('empty-stream')
    expect(result.playbook).toBeNull()
    expect(result.specs).toEqual([])
    expect(result.samples).toEqual([])
    expect(result.sampleTypes).toEqual([])
  })
})

// --- listSamples ---

describe('listSamples', () => {
  it('returns sampleTypes in readdir order regardless of I/O completion order', async () => {
    // Three categories: 'a', 'b', 'c'. Make 'a' the slowest to resolve and 'c'
    // the fastest, so push-during-await would shuffle order to ['c', 'b', 'a'].
    const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
    const delayByCat: Record<string, number> = { a: 30, b: 15, c: 0 }

    mockReaddir.mockImplementation(async (dirPath: unknown) => {
      const p = dirPath as string
      if (p.endsWith('/samples'))
        return [
          makeDirent('a', true),
          makeDirent('b', true),
          makeDirent('c', true),
        ] as Dirent[]
      // Inside each category dir: no sample files (keeps the test focused on
      // sampleTypes order; samples are sorted by mtime separately).
      return [] as Dirent[]
    })
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      const cat = (['a', 'b', 'c'] as const).find((c) =>
        p.includes(`/samples/${c}/`),
      )
      if (cat) await delay(delayByCat[cat])
      throw enoent()
    })
    mockStat.mockResolvedValue(makeStats())

    const first = await listSamples(path.join(MOCK_ROOT, 'samples'))
    const second = await listSamples(path.join(MOCK_ROOT, 'samples'))

    expect(first.sampleTypes.map((t) => t.slug)).toEqual(['a', 'b', 'c'])
    expect(second.sampleTypes.map((t) => t.slug)).toEqual(['a', 'b', 'c'])
  })
})

// --- streamExists ---

describe('streamExists', () => {
  it('returns true when the stream directory exists', async () => {
    mockStat.mockResolvedValue(makeStats())
    const result = await streamExists('my-stream')
    expect(result).toBe(true)
  })

  it('returns false when the stream directory does not exist', async () => {
    mockStat.mockRejectedValue(enoent())
    const result = await streamExists('nonexistent')
    expect(result).toBe(false)
  })

  it('throws for non-ENOENT errors', async () => {
    mockStat.mockRejectedValue(eacces())
    await expect(streamExists('my-stream')).rejects.toThrow('EACCES')
  })

  it('rejects traversal in stream name', async () => {
    await expect(streamExists('../../etc')).rejects.toThrow(
      'Invalid stream name',
    )
  })
})

// --- readStreams ---

describe('readStreams', () => {
  it('returns streams sorted newest-first by birthtime', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('older-stream', true),
      makeDirent('newer-stream', true),
    ] as Dirent[])
    mockStat.mockImplementation(async (p: unknown) => {
      const dirPath = p as string
      if (dirPath.includes('newer-stream')) {
        return makeStats({
          birthtime: new Date('2025-02-01T00:00:00.000Z'),
        })
      }
      return makeStats({ birthtime: new Date('2025-01-01T00:00:00.000Z') })
    })
    mockReadFile.mockRejectedValue(enoent())

    const result = await readStreams()
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('newer-stream')
    expect(result[1].name).toBe('older-stream')
  })

  it('excludes dot-prefixed directories', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('.git', true),
      makeDirent('.chats', true),
      makeDirent('visible-stream', true),
    ] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockRejectedValue(enoent())

    const result = await readStreams()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('visible-stream')
  })

  it('excludes non-directory entries', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('stream-dir', true),
      makeDirent('stray-file.txt', false),
    ] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockRejectedValue(enoent())

    const result = await readStreams()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('stream-dir')
  })

  it('excludes reserved root directories (tasks)', async () => {
    mockReaddir.mockResolvedValue([
      makeDirent('tasks', true),
      makeDirent('my-stream', true),
    ] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockRejectedValue(enoent())

    const result = await readStreams()
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('my-stream')
  })

  it('returns empty array if ~/HappyHQ/ does not exist', async () => {
    mockReaddir.mockRejectedValue(enoent())
    const result = await readStreams()
    expect(result).toEqual([])
  })

  it('sets hasPlaybookContent false when playbook has no body', async () => {
    mockReaddir.mockResolvedValue([makeDirent('my-stream', true)] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    // Playbook with frontmatter only (no body content)
    mockReadFile.mockResolvedValue('---\ntitle: My Stream\n---\n')

    const result = await readStreams()
    expect(result[0].hasPlaybookContent).toBe(false)
  })

  it('sets hasPlaybookContent true when playbook has body content', async () => {
    mockReaddir.mockResolvedValue([makeDirent('my-stream', true)] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockResolvedValue(
      '---\ntitle: My Stream\n---\nStep 1: Do the thing',
    )

    const result = await readStreams()
    expect(result[0].hasPlaybookContent).toBe(true)
  })

  it('sets hasPlaybookContent false when no playbook exists', async () => {
    mockReaddir.mockResolvedValue([makeDirent('my-stream', true)] as Dirent[])
    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockRejectedValue(enoent())

    const result = await readStreams()
    expect(result[0].hasPlaybookContent).toBe(false)
  })
})

// --- listFileItems with web/ subdirectory ---

describe('listFileItems', () => {
  it('returns web input items from inputs/web/{domain}/{page}.md', async () => {
    const inputsDir = path.join(MOCK_ROOT, 'stream/tasks/task-1/inputs')
    const webDir = path.join(inputsDir, 'web')
    const domainDir = path.join(webDir, 'planning-wandsworth-gov-uk')

    // inputs/ contains: web/ (dir) and project-brief/ (dir with original.pdf)
    mockReaddir.mockImplementation(async (dirPath: unknown) => {
      const p = dirPath as string
      if (p === inputsDir) {
        return [
          makeDirent('web', true),
          makeDirent('project-brief', true),
        ] as Dirent[]
      }
      // web/ contains one domain dir
      if (p === webDir) {
        return [makeDirent('planning-wandsworth-gov-uk', true)] as Dirent[]
      }
      // domain dir contains .md files
      if (p === domainDir) {
        return ['planning-application-2023-0892.md']
      }
      // project-brief/ contains original.pdf + raw.txt
      if (p.endsWith('/project-brief')) {
        return ['original.pdf', 'raw.txt']
      }
      throw enoent()
    })

    mockStat.mockResolvedValue(makeStats())
    mockReadFile.mockImplementation(async (filePath: unknown) => {
      const p = filePath as string
      if (p.endsWith('.md'))
        return '# Planning Application 2023/0892\n\nContent here.'
      throw enoent() // no .meta.json
    })

    const result = await listFileItems(inputsDir)

    // Should contain both the web input and the regular input
    expect(result).toHaveLength(2)

    const webItem = result.find((i) => i.name.startsWith('web/'))
    expect(webItem).toBeDefined()
    expect(webItem!.name).toBe('web/planning-wandsworth-gov-uk')
    expect(webItem!.title).toBe('Planning Application 2023/0892')
    expect(webItem!.originalName).toBe('planning-application-2023-0892.md')
    expect(webItem!.originalPath).toBe(
      'stream/tasks/task-1/inputs/web/planning-wandsworth-gov-uk/planning-application-2023-0892.md',
    )
    expect(webItem!.rawPath).toBeNull()

    const briefItem = result.find((i) => i.name === 'project-brief')
    expect(briefItem).toBeDefined()
    expect(briefItem!.originalName).toBe('original.pdf')
    expect(briefItem!.rawPath).toContain('raw.txt')
  })

  it('returns empty array when web/ directory does not exist', async () => {
    const inputsDir = path.join(MOCK_ROOT, 'stream/tasks/task-1/inputs')

    mockReaddir.mockImplementation(async (dirPath: unknown) => {
      const p = dirPath as string
      if (p === inputsDir) {
        return [makeDirent('web', true)] as Dirent[]
      }
      // web/ doesn't exist
      throw enoent()
    })

    const result = await listFileItems(inputsDir)
    expect(result).toEqual([])
  })
})

// --- readChatJson ---

describe('readChatJson', () => {
  it('returns parsed chat.json from root .chats/ directory', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        name: 'My Chat',
        mode: 'learning',
        streamSlug: 'reports',
      }),
    )

    const result = await readChatJson('sess-123')
    expect(result).toEqual({
      name: 'My Chat',
      mode: 'learning',
      streamSlug: 'reports',
    })

    // All chats are at root
    expect(mockReadFile).toHaveBeenCalledWith(
      path.join(MOCK_ROOT, '.chats', 'sess-123', 'chat.json'),
      'utf-8',
    )
  })

  it('returns null when chat.json is missing', async () => {
    mockReadFile.mockRejectedValue(enoent())
    const result = await readChatJson('nonexistent')
    expect(result).toBe(null)
  })

  it('returns null when chat.json is malformed', async () => {
    mockReadFile.mockResolvedValue('{not valid json')
    const result = await readChatJson('sess-123')
    expect(result).toBe(null)
  })
})

// --- parseRunInfo ---

describe('parseRunInfo', () => {
  it('passes new-shape RunInfo through unchanged', () => {
    const newShape = {
      status: 'working' as const,
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:05:00.000Z',
      phases: [
        {
          phase: 'planning' as const,
          sessionId: 'sess-plan',
          costUsd: 0.12,
          durationMs: 30_000,
        },
        {
          phase: 'working' as const,
          iteration: 1,
          sessionId: 'sess-work-1',
          costUsd: 0.08,
          durationMs: 15_000,
          inputTokens: 1000,
          outputTokens: 200,
        },
      ],
    }
    expect(parseRunInfo(newShape)).toEqual(newShape)
  })

  it('synthesizes phases from old planning-only shape', () => {
    const old = {
      status: 'plan_ready',
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:00:30.000Z',
      iteration: 0,
      iterations: [],
      planningCostUsd: 0.15,
      planningSessionId: 'sess-plan',
      workingSessionIds: [],
      error: null,
    }
    const result = parseRunInfo(old)
    expect(result.phases).toEqual([
      {
        phase: 'planning',
        sessionId: 'sess-plan',
        costUsd: 0.15,
        durationMs: 0,
      },
    ])
    expect(result.error).toBeUndefined()
    expect(result).not.toHaveProperty('planningCostUsd')
    expect(result).not.toHaveProperty('iteration')
  })

  it('synthesizes phases from old planning + N working shape, pairing by index', () => {
    const old = {
      status: 'completed',
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:30:00.000Z',
      iteration: 2,
      planningCostUsd: 0.1,
      planningSessionId: 'sess-plan',
      workingSessionIds: ['sess-w1', 'sess-w2'],
      iterations: [
        { costUsd: 0.05, durationMs: 8_000, inputTokens: 500 },
        { costUsd: 0.07, durationMs: 12_000, inputTokens: 700 },
      ],
      error: null,
    }
    const result = parseRunInfo(old)
    expect(result.phases).toHaveLength(3)
    expect(result.phases[0]).toEqual({
      phase: 'planning',
      sessionId: 'sess-plan',
      costUsd: 0.1,
      durationMs: 0,
    })
    expect(result.phases[1]).toEqual({
      phase: 'working',
      iteration: 1,
      sessionId: 'sess-w1',
      costUsd: 0.05,
      durationMs: 8_000,
      inputTokens: 500,
    })
    expect(result.phases[2]).toEqual({
      phase: 'working',
      iteration: 2,
      sessionId: 'sess-w2',
      costUsd: 0.07,
      durationMs: 12_000,
      inputTokens: 700,
    })
  })

  it('produces empty phases for never-run / freshly-created run.json', () => {
    // Edge case: malformed/empty payload — parseRunInfo should not throw.
    const result = parseRunInfo({})
    expect(result.phases).toEqual([])
    expect(result.error).toBeUndefined()
  })

  it("normalizes legacy 'usage_limited' status to stopped+budget", () => {
    const old = {
      status: 'usage_limited',
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:10:00.000Z',
      iteration: 1,
      planningCostUsd: 0.1,
      planningSessionId: 'sess-plan',
      workingSessionIds: ['sess-w1'],
      iterations: [{ costUsd: 0.05, durationMs: 8_000 }],
      error: null,
    }
    const result = parseRunInfo(old)
    expect(result.status).toBe('stopped')
    expect(result.stoppedDuring).toBe('working')
    expect(result.stopReason).toBe('budget')
    expect(result.error).toBeUndefined()
  })

  it("normalizes legacy 'paused' status to stopped+budget", () => {
    const result = parseRunInfo({
      status: 'paused',
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:10:00.000Z',
    })
    expect(result.status).toBe('stopped')
    expect(result.stoppedDuring).toBe('working')
    expect(result.stopReason).toBe('budget')
  })

  it("collapses legacy 'running' status to 'working'", () => {
    const result = parseRunInfo({
      status: 'running',
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:01:00.000Z',
    })
    expect(result.status).toBe('working')
  })

  it('collapses error: null to undefined', () => {
    const result = parseRunInfo({
      status: 'completed',
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:01:00.000Z',
      error: null,
    })
    expect(result.error).toBeUndefined()
    expect(Object.hasOwn(result, 'error')).toBe(false)
  })

  it('preserves a real error string', () => {
    const result = parseRunInfo({
      status: 'stopped',
      startedAt: '2026-05-06T10:00:00.000Z',
      lastIterationAt: '2026-05-06T10:01:00.000Z',
      error: 'subprocess died',
      iteration: 0,
    })
    expect(result.error).toBe('subprocess died')
  })
})
