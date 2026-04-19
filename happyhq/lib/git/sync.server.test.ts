import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  default: { execSync: mockExecSync },
  execSync: mockExecSync,
}))

import { commitGitState, isTaskCompleted, syncGitState } from './sync.server'

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
    mockExecSync.mockImplementation(() => {
      throw new Error('git not found')
    })

    expect(() => syncGitState()).not.toThrow()
  })

  it('does not throw when git commit fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.startsWith('git status')) return Buffer.from('M file.txt')
      throw new Error('commit failed: nothing to commit')
    })

    expect(() => syncGitState()).not.toThrow()
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
    mockExecSync.mockReturnValue(
      '[my-stream/my-task] [done] Final deliverables\n',
    )

    expect(isTaskCompleted('my-task')).toBe(true)
  })

  it('returns false when latest commit subject does not contain [done]', () => {
    mockExecSync.mockReturnValue('[my-stream/my-task] Work in progress\n')

    expect(isTaskCompleted('my-task')).toBe(false)
  })

  it('returns false when git log returns empty output (no commits)', () => {
    mockExecSync.mockReturnValue('')

    expect(isTaskCompleted('my-task')).toBe(false)
  })

  it('returns false when execSync throws (git error)', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not a git repository')
    })

    expect(isTaskCompleted('my-task')).toBe(false)
  })

  it('runs git log from workspace root scoped to the task directory', () => {
    mockExecSync.mockReturnValue('')

    isTaskCompleted('my-task')

    expect(mockExecSync).toHaveBeenCalledWith(
      "git log --format='%s' -1 -- tasks/my-task",
      expect.objectContaining({
        cwd: MOCK_ROOT,
        encoding: 'utf8',
        timeout: 5000,
      }),
    )
  })
})

describe('commitGitState', () => {
  it('skips commit when working tree is clean', () => {
    mockExecSync.mockReturnValue(Buffer.from(''))

    commitGitState('[my-stream] Create stream')

    expect(mockExecSync).toHaveBeenCalledTimes(1)
    expect(mockExecSync).toHaveBeenCalledWith('git status --porcelain', {
      cwd: MOCK_ROOT,
      stdio: 'pipe',
    })
  })

  it('commits with the provided message when tree has changes', () => {
    mockExecSync.mockReturnValue(Buffer.from('?? new-dir/'))

    commitGitState('[my-stream] Create stream')

    expect(mockExecSync).toHaveBeenCalledTimes(2)
    expect(mockExecSync).toHaveBeenCalledWith(
      'git add -A && git commit -m "[my-stream] Create stream"',
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
  })

  it('treats whitespace-only status as clean', () => {
    mockExecSync.mockReturnValue(Buffer.from('   \n  \n'))

    commitGitState('[my-stream] Delete stream')

    expect(mockExecSync).toHaveBeenCalledTimes(1)
  })

  it('does not throw when git status fails', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('git not found')
    })

    expect(() => commitGitState('[x] Create stream')).not.toThrow()
  })

  it('does not throw when git commit fails', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd.startsWith('git status')) return Buffer.from('M file.txt')
      throw new Error('commit failed')
    })

    expect(() => commitGitState('[x] Create stream')).not.toThrow()
  })

  it('logs a warning when an error occurs', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockExecSync.mockImplementation(() => {
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
    mockExecSync.mockReturnValue(Buffer.from('D deleted-file.txt'))

    commitGitState('[my-stream] Delete stream')

    for (const call of mockExecSync.mock.calls) {
      expect(call[1]).toHaveProperty('cwd', MOCK_ROOT)
    }
  })
})
