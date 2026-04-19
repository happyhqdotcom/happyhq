import { Dirent } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

// --- hoisted mocks ---
const { mockAccess, mockReaddir, mockHomedir } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockReaddir: vi.fn(),
  mockHomedir: vi.fn(() => '/mock/home'),
}))

vi.mock('node:fs/promises', () => ({
  default: { access: mockAccess, readdir: mockReaddir },
  access: mockAccess,
  readdir: mockReaddir,
}))

vi.mock('node:os', () => ({
  default: { homedir: mockHomedir },
  homedir: mockHomedir,
}))

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/data/happyhq',
}))

import { encodeProjectDir, resolveSessionJournal } from './journal-path.server'

// --- helpers ---

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
    path: '',
    parentPath: '',
  } as Dirent
}

function enoent(): NodeJS.ErrnoException {
  const err = new Error('ENOENT') as NodeJS.ErrnoException
  err.code = 'ENOENT'
  return err
}

afterEach(() => {
  vi.clearAllMocks()
})

// --- encodeProjectDir ---

describe('encodeProjectDir', () => {
  it('replaces all / with -', () => {
    expect(encodeProjectDir('/Users/philo/HappyHQ')).toBe(
      '-Users-philo-HappyHQ',
    )
  })
})

// --- resolveSessionJournal ---

describe('resolveSessionJournal', () => {
  it('returns primary path when the JSONL file exists', async () => {
    mockAccess.mockResolvedValueOnce(undefined)

    const result = await resolveSessionJournal('session-abc')

    // HAPPYHQ_ROOT is '/data/happyhq'
    // encodeProjectDir turns that into '-data-happyhq'
    expect(result).toBe(
      '/mock/home/.claude/projects/-data-happyhq/session-abc.jsonl',
    )
    // access was called once for the primary path — no fallback scan
    expect(mockAccess).toHaveBeenCalledTimes(1)
  })

  it('falls back to scanning ~/.claude/projects/ subdirectories when primary not found', async () => {
    // Primary path check fails
    mockAccess.mockRejectedValueOnce(enoent())

    // Fallback scan: readdir returns two subdirs
    mockReaddir.mockResolvedValueOnce([
      makeDirent('proj-a', true),
      makeDirent('proj-b', true),
    ])

    // access for proj-a fails, access for proj-b succeeds
    mockAccess
      .mockRejectedValueOnce(enoent()) // proj-a
      .mockResolvedValueOnce(undefined) // proj-b

    const result = await resolveSessionJournal('session-xyz')

    expect(result).toBe('/mock/home/.claude/projects/proj-b/session-xyz.jsonl')
  })

  it('returns null when session JSONL not found in any project directory', async () => {
    // Primary path check fails
    mockAccess.mockRejectedValueOnce(enoent())

    // Fallback scan: readdir returns one subdir, but session not found there
    mockReaddir.mockResolvedValueOnce([makeDirent('proj-a', true)])
    mockAccess.mockRejectedValueOnce(enoent())

    const result = await resolveSessionJournal('session-404')

    expect(result).toBeNull()
  })

  it('returns null when ~/.claude/projects/ does not exist', async () => {
    // Primary path check fails
    mockAccess.mockRejectedValueOnce(enoent())

    // Fallback scan: readdir itself fails (projects dir missing)
    mockReaddir.mockRejectedValueOnce(enoent())

    const result = await resolveSessionJournal('session-nope')

    expect(result).toBeNull()
  })

  it('skips non-directory entries during fallback scan', async () => {
    // Primary path check fails
    mockAccess.mockRejectedValueOnce(enoent())

    // Fallback scan: readdir returns a file and a directory
    mockReaddir.mockResolvedValueOnce([
      makeDirent('some-file.txt', false),
      makeDirent('actual-dir', true),
    ])

    // Only the directory entry is checked — and it has the session
    mockAccess.mockResolvedValueOnce(undefined)

    const result = await resolveSessionJournal('session-123')

    expect(result).toBe(
      '/mock/home/.claude/projects/actual-dir/session-123.jsonl',
    )
    // 1 for primary + 1 for actual-dir (skipped non-dir)
    expect(mockAccess).toHaveBeenCalledTimes(2)
  })
})
