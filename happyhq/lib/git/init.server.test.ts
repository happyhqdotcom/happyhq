import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const { mockExecSync, mockExecFileSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
  mockExecFileSync: vi.fn(),
}))

const { mockMkdirSync, mockWriteFileSync } = vi.hoisted(() => ({
  mockMkdirSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
}))

const { mockReadConfigSync } = vi.hoisted(() => ({
  mockReadConfigSync: vi.fn(() => ({})),
}))

vi.mock('@/lib/config/config.server', () => ({
  readConfigSync: mockReadConfigSync,
}))

vi.mock('node:child_process', () => ({
  default: { execSync: mockExecSync, execFileSync: mockExecFileSync },
  execSync: mockExecSync,
  execFileSync: mockExecFileSync,
}))

vi.mock('node:fs', () => ({
  default: { mkdirSync: mockMkdirSync, writeFileSync: mockWriteFileSync },
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
}))

import { initializeGitRepo } from './init.server'

afterEach(() => {
  vi.clearAllMocks()
})

describe('initializeGitRepo', () => {
  it('creates ~/HappyHQ/ directory', () => {
    initializeGitRepo()
    expect(mockMkdirSync).toHaveBeenCalledWith(MOCK_ROOT, { recursive: true })
  })

  it('initializes a git repo at ~/HappyHQ/', () => {
    initializeGitRepo()
    expect(mockExecSync).toHaveBeenCalledWith('git init', {
      cwd: MOCK_ROOT,
      stdio: 'pipe',
    })
  })

  it('writes .gitignore excluding OS files and .chats/', () => {
    initializeGitRepo()
    const [filePath, content, encoding] = mockWriteFileSync.mock.calls[0]
    expect(filePath).toBe(path.join(MOCK_ROOT, '.gitignore'))
    expect(content).toContain('.DS_Store')
    expect(content).toContain('Thumbs.db')
    expect(content).toContain('.chats/')
    expect(content).toContain('.logs/')
    expect(content).toContain('**/.run.json')
    expect(content).toContain('.settings.json')
    // uploads/ removed — after S1, uploads live inside .chats/ which is already excluded
    expect(content).not.toContain('uploads/')
    expect(encoding).toBe('utf-8')
  })

  it('configures local author as Q <q@happyhq.com> by default', () => {
    initializeGitRepo()
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.name', 'Q'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.email', 'q@happyhq.com'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
  })

  it('uses custom author name and email from config', () => {
    mockReadConfigSync.mockReturnValueOnce({
      git: { authorName: 'Alice', authorEmail: 'alice@example.com' },
    })
    initializeGitRepo()
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.name', 'Alice'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.email', 'alice@example.com'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
  })

  it('falls back to defaults when config author fields are empty strings', () => {
    mockReadConfigSync.mockReturnValueOnce({
      git: { authorName: '', authorEmail: '' },
    })
    initializeGitRepo()
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.name', 'Q'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
    expect(mockExecFileSync).toHaveBeenCalledWith(
      'git',
      ['config', 'user.email', 'q@happyhq.com'],
      { cwd: MOCK_ROOT, stdio: 'pipe' },
    )
  })

  it('creates initial commit when repo has no commits', () => {
    // git rev-parse HEAD throws when there are no commits
    mockExecSync.mockImplementation((cmd: string) => {
      if (cmd === 'git rev-parse HEAD') {
        throw new Error('fatal: ambiguous argument HEAD')
      }
      return Buffer.from('')
    })

    initializeGitRepo()

    expect(mockExecSync).toHaveBeenCalledWith('git add .gitignore', {
      cwd: MOCK_ROOT,
      stdio: 'pipe',
    })
    expect(mockExecSync).toHaveBeenCalledWith('git commit -m "Start HappyHQ"', {
      cwd: MOCK_ROOT,
      stdio: 'pipe',
    })
  })

  it('skips initial commit when repo already has commits', () => {
    // git rev-parse HEAD succeeds, git diff --cached --quiet succeeds (no changes)
    mockExecSync.mockReturnValue(Buffer.from('abc123'))

    initializeGitRepo()

    expect(mockExecSync).not.toHaveBeenCalledWith(
      'git commit -m "Start HappyHQ"',
      expect.anything(),
    )
  })

  it('commits .gitignore as "System update" when it changed in existing repo', () => {
    mockExecSync.mockImplementation((cmd: string) => {
      // git diff --cached --quiet exits non-zero when there are staged changes
      if (cmd.includes('git diff --cached --quiet')) {
        throw new Error('exit code 1')
      }
      return Buffer.from('')
    })

    initializeGitRepo()

    expect(mockExecSync).toHaveBeenCalledWith('git commit -m "System update"', {
      cwd: MOCK_ROOT,
      stdio: 'pipe',
    })
  })

  it('uses stdio: pipe on all git commands to suppress output', () => {
    initializeGitRepo()
    for (const call of mockExecSync.mock.calls) {
      expect(call[1]).toHaveProperty('stdio', 'pipe')
    }
  })
})
