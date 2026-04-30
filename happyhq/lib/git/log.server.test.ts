import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  default: { execFileSync: mockExecFileSync },
  execFileSync: mockExecFileSync,
}))

import {
  getFileHistory,
  getGitLog,
  isFileDirty,
  readFileAtRef,
} from './log.server'

afterEach(() => {
  vi.clearAllMocks()
})

// These tests pin the security contract introduced in #89: user-controlled
// inputs (file paths, refs, grep patterns) must reach git as their own argv
// elements so that shell metacharacters in the value cannot be interpreted.

describe('isFileDirty', () => {
  it('returns true when git reports the file as changed', () => {
    mockExecFileSync.mockReturnValue('path/to/file.md\n')

    expect(isFileDirty('path/to/file.md')).toBe(true)
  })

  it('returns false on empty output', () => {
    mockExecFileSync.mockReturnValue('')

    expect(isFileDirty('path/to/file.md')).toBe(false)
  })

  it('returns false when git throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not a repo')
    })

    expect(isFileDirty('any.md')).toBe(false)
  })

  it('passes a hostile-looking path as a discrete argv element', () => {
    mockExecFileSync.mockReturnValue('')

    isFileDirty('weird; rm -rf ~/HappyHQ.md')

    const [file, args] = mockExecFileSync.mock.calls[0]
    expect(file).toBe('git')
    expect(args).toEqual([
      'diff',
      'HEAD',
      '--name-only',
      '--',
      'weird; rm -rf ~/HappyHQ.md',
    ])
  })
})

describe('getFileHistory', () => {
  it('parses git output into entries', () => {
    mockExecFileSync.mockReturnValue(
      'abc1234---FIELD---first commit---FIELD---2 days ago\n' +
        'def5678---FIELD---second commit---FIELD---1 day ago\n',
    )

    expect(getFileHistory('readme.md')).toEqual([
      { hash: 'abc1234', subject: 'first commit', date: '2 days ago' },
      { hash: 'def5678', subject: 'second commit', date: '1 day ago' },
    ])
  })

  it('returns an empty array when git throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('git error')
    })

    expect(getFileHistory('readme.md')).toEqual([])
  })

  it('passes filePath as a discrete argv element', () => {
    mockExecFileSync.mockReturnValue('')

    getFileHistory('weird; rm -rf ~.md', 5)

    const [file, args] = mockExecFileSync.mock.calls[0]
    expect(file).toBe('git')
    expect(args).toContain('--')
    expect(args[args.length - 1]).toBe('weird; rm -rf ~.md')
    expect(args).toContain('-5')
  })
})

describe('readFileAtRef', () => {
  it('returns the file contents on success', () => {
    mockExecFileSync.mockReturnValue('hello world\n')

    expect(readFileAtRef('HEAD~1', 'readme.md')).toBe('hello world\n')
  })

  it('returns null when git fails', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('bad ref')
    })

    expect(readFileAtRef('does-not-exist', 'readme.md')).toBeNull()
  })

  it('combines ref and path into a single argv element so neither can break out', () => {
    mockExecFileSync.mockReturnValue('contents')

    readFileAtRef('main', 'weird; rm -rf ~.md')

    const [file, args] = mockExecFileSync.mock.calls[0]
    expect(file).toBe('git')
    expect(args).toEqual(['show', 'main:weird; rm -rf ~.md'])
  })
})

describe('getGitLog', () => {
  it('parses git output into entries', () => {
    mockExecFileSync.mockReturnValue(
      'abc1234---FIELD---feat: x---FIELD---3 hours ago\n',
    )

    expect(getGitLog(10)).toEqual([
      { hash: 'abc1234', subject: 'feat: x', date: '3 hours ago' },
    ])
  })

  it('returns an empty array when git throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('git error')
    })

    expect(getGitLog()).toEqual([])
  })

  it('omits grep flags when no grep is supplied', () => {
    mockExecFileSync.mockReturnValue('')

    getGitLog(7)

    const [, args] = mockExecFileSync.mock.calls[0]
    expect(args).not.toContain('--extended-regexp')
    expect(args.some((a: string) => a.startsWith('--grep'))).toBe(false)
  })

  it('passes the grep pattern as a discrete --grep=<value> argv element', () => {
    mockExecFileSync.mockReturnValue('')

    getGitLog(7, '^\\[my-stream/my-task\\]')

    const [file, args] = mockExecFileSync.mock.calls[0]
    expect(file).toBe('git')
    expect(args).toContain('--extended-regexp')
    expect(args).toContain('--grep=^\\[my-stream/my-task\\]')
  })
})
