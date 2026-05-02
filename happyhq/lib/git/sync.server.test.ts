import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const { mockExecSync, mockExecFileSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExecFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  default: { execSync: mockExecSync, execFileSync: mockExecFileSync },
  execSync: mockExecSync,
  execFileSync: mockExecFileSync,
}))

import {
  commitGitState,
  getLatestTaskCommit,
  isTaskCompleted,
  restorePlanFromGit,
  syncGitState,
} from './sync.server'

afterEach(() => {
  vi.clearAllMocks()
})

describe('syncGitState', () => {
  it('skips commit when working tree is clean', () => {
    mockExecSync.mockReturnValue(Buffer.from(''))

    syncGitState()

    expect(mockExecSync).toHaveBeenCalledTimes(1)
    expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', {
      cwd: MOCK_ROOT,
      stdio: 'pipe',
    })
  })

  it('commits when working tree has changes', () => {
    mockExecSync.mockReturnValue(Buffer.from(' M some-file.md\n'))

    syncGitState()

    expect(mockExecSync).toHaveBeenCalledTimes(2)
    expect(mockExecSync).toHaveBeenCalledWith(
      'git add -A && git commit -m "[sync] Filesystem changes"',
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
  })

  it('treats whitespace-only status as clean', () => {
    mockExecSync.mockReturnValue(Buffer.from('   \n  \n'))

    syncGitState()

    // Only the status check, no commit
    expect(mockExecSync).toHaveBeenCalledTimes(1)
  })

  it('does not throw when git status fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mockExecSync.mockImplementation(() => {
        throw new Error('git not found')
      })

      expect(() => syncGitState()).not.toThrow()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does not throw when git commit fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mockExecSync.mockImplementation((cmd: string) => {
        if (cmd.startsWith('git status')) return Buffer.from('M file.txt')
        throw new Error('commit failed: nothing to commit')
      })

      expect(() => syncGitState()).not.toThrow()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('logs a warning when an error occurs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockExecSync.mockImplementation(() => {
      throw new Error('repository corrupt')
    })

    syncGitState()

    expect(warnSpy).toHaveBeenCalledWith(
      '[syncGitState] Failed to sync:',
      'repository corrupt',
    )
    warnSpy.mockRestore()
  })

  it('logs non-Error values when thrown', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockExecSync.mockImplementation(() => {
      throw 'string error'
    })

    syncGitState()

    expect(warnSpy).toHaveBeenCalledWith(
      '[syncGitState] Failed to sync:',
      'string error',
    )
    warnSpy.mockRestore()
  })

  it('runs all commands in HAPPYHQ_ROOT', () => {
    mockExecSync.mockReturnValue(Buffer.from('?? new-file.txt'))

    syncGitState()

    for (const call of mockExecSync.mock.calls) {
      expect(call[1]).toHaveProperty('cwd', MOCK_ROOT)
    }
  })
})

describe('isTaskCompleted', () => {
  it('returns true when latest commit subject contains [done]', () => {
    mockExecFileSync.mockReturnValue(
      '[my-stream/my-task] [done] Final deliverables\n',
    )

    expect(isTaskCompleted('my-task')).toBe(true)
  })

  it('returns false when latest commit subject does not contain [done]', () => {
    mockExecFileSync.mockReturnValue('[my-stream/my-task] Work in progress\n')

    expect(isTaskCompleted('my-task')).toBe(false)
  })

  it('returns false when git log returns empty output (no commits)', () => {
    mockExecFileSync.mockReturnValue('')

    expect(isTaskCompleted('my-task')).toBe(false)
  })

  it('returns false when execFileSync throws (git error)', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not a git repository')
    })

    expect(isTaskCompleted('my-task')).toBe(false)
  })

  it('passes the task path as a discrete argv element so a hostile task name cannot inject shell args', () => {
    // Security contract: taskName flows through `--` as a positional argument,
    // never interpolated into a shell command line.
    mockExecFileSync.mockReturnValue('')

    isTaskCompleted('my-task; rm -rf /')

    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    const [file, args, opts] = mockExecFileSync.mock.calls[0]
    expect(file).toBe('git')
    expect(args).toEqual([
      'log',
      '--format=%s',
      '-1',
      '--',
      'tasks/my-task; rm -rf /',
    ])
    expect(opts).toMatchObject({ cwd: MOCK_ROOT, encoding: 'utf8' })
  })
})

describe('getLatestTaskCommit', () => {
  it('returns the SHA from git log', () => {
    mockExecFileSync.mockReturnValue('abc123def\n')

    expect(getLatestTaskCommit('my-task')).toBe('abc123def')
  })

  it('returns null when git log returns empty output (no commits)', () => {
    mockExecFileSync.mockReturnValue('')

    expect(getLatestTaskCommit('my-task')).toBeNull()
  })

  it('returns null when execFileSync throws', () => {
    mockExecFileSync.mockImplementation(() => {
      throw new Error('not a git repository')
    })

    expect(getLatestTaskCommit('my-task')).toBeNull()
  })

  it('passes the task path as a discrete argv element', () => {
    mockExecFileSync.mockReturnValue('')

    getLatestTaskCommit('my-task; rm -rf /')

    const [file, args] = mockExecFileSync.mock.calls[0]
    expect(file).toBe('git')
    expect(args).toEqual([
      'log',
      '--format=%H',
      '-1',
      '--',
      'tasks/my-task; rm -rf /',
    ])
  })
})

describe('commitGitState', () => {
  it('skips commit when working tree is clean', () => {
    mockExecFileSync.mockReturnValue(Buffer.from(''))

    commitGitState('[my-stream] Create stream')

    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['status', '--porcelain'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
  })

  it('commits with the provided message when tree has changes', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('?? new-dir/'))

    commitGitState('[my-stream] Create stream')

    // status + add + commit = 3 calls (no shell, so add and commit are split)
    expect(mockExecFileSync).toHaveBeenCalledTimes(3)
    expect(mockExecFileSync).toHaveBeenNthCalledWith(2, 'git', ['add', '-A'], {
      cwd: MOCK_ROOT,
      stdio: 'pipe',
    })
    expect(mockExecFileSync).toHaveBeenNthCalledWith(
      3,
      'git',
      ['commit', '-m', '[my-stream] Create stream'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
  })

  it('passes the message as a discrete argv element so shell metacharacters cannot inject commands', () => {
    // Security contract: the commit message is never interpolated into a shell
    // command — it travels as its own argv slot to `git commit -m`.
    mockExecFileSync.mockReturnValue(Buffer.from('M file.txt'))

    const hostile = '" && rm -rf $HOME && echo "'
    commitGitState(hostile)

    const commitCall = mockExecFileSync.mock.calls.find(
      (c) => Array.isArray(c[1]) && c[1][0] === 'commit',
    )
    expect(commitCall).toBeDefined()
    expect(commitCall![1]).toEqual(['commit', '-m', hostile])
  })

  it('treats whitespace-only status as clean', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('   \n  \n'))

    commitGitState('[my-stream] Delete stream')

    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
  })

  it('does not throw when git status fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mockExecFileSync.mockImplementation(() => {
        throw new Error('git not found')
      })

      expect(() => commitGitState('[x] Create stream')).not.toThrow()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('does not throw when git commit fails', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      mockExecFileSync.mockImplementation((_file: string, args: string[]) => {
        if (args[0] === 'status') return Buffer.from('M file.txt')
        if (args[0] === 'add') return Buffer.from('')
        throw new Error('commit failed')
      })

      expect(() => commitGitState('[x] Create stream')).not.toThrow()
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('logs a warning when an error occurs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockExecFileSync.mockImplementation(() => {
      throw new Error('repository corrupt')
    })

    commitGitState('[x] Create stream')

    expect(warnSpy).toHaveBeenCalledWith(
      '[commitGitState] Failed to commit:',
      'repository corrupt',
    )
    warnSpy.mockRestore()
  })

  it('runs all commands in HAPPYHQ_ROOT', () => {
    mockExecFileSync.mockReturnValue(Buffer.from('D deleted-file.txt'))

    commitGitState('[my-stream] Delete stream')

    for (const call of mockExecFileSync.mock.calls) {
      expect(call[2]).toHaveProperty('cwd', MOCK_ROOT)
    }
  })
})

describe('restorePlanFromGit', () => {
  it('skips restore when no "Plan accepted" commit exists for the task', () => {
    mockExecFileSync.mockReturnValue('')

    restorePlanFromGit('my-task')

    // Only the log lookup runs; no restore call when hash is empty.
    expect(mockExecFileSync).toHaveBeenCalledTimes(1)
    const [file, args] = mockExecFileSync.mock.calls[0]
    expect(file).toBe('git')
    expect(args).toEqual([
      'log',
      '--format=%H',
      '--grep=Plan accepted',
      '-1',
      '--',
      'tasks/my-task/plan.md',
    ])
  })

  it('restores plan.md from the matching commit when one exists', () => {
    mockExecFileSync
      .mockReturnValueOnce('abc123\n')
      .mockReturnValueOnce(Buffer.from(''))

    restorePlanFromGit('my-task')

    expect(mockExecFileSync).toHaveBeenCalledTimes(2)
    const [file, args] = mockExecFileSync.mock.calls[1]
    expect(file).toBe('git')
    expect(args).toEqual([
      'restore',
      '--source=abc123',
      '--',
      'tasks/my-task/plan.md',
    ])
  })

  it('does not throw when git fails (graceful no-op)', () => {
    // Production callers depend on this: a missing git binary or any other
    // git error must not crash the run-restart path.
    mockExecFileSync.mockImplementation(() => {
      throw new Error('spawnSync git ENOENT')
    })

    expect(() => restorePlanFromGit('my-task')).not.toThrow()
  })

  it('passes the task path as a discrete argv element so a hostile task name cannot inject shell args', () => {
    mockExecFileSync.mockReturnValue('')

    restorePlanFromGit('my-task; rm -rf /')

    const [, args] = mockExecFileSync.mock.calls[0]
    expect(args).toEqual([
      'log',
      '--format=%H',
      '--grep=Plan accepted',
      '-1',
      '--',
      'tasks/my-task; rm -rf //plan.md',
    ])
  })
})
