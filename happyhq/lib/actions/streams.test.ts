import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock constants — must be before importing the module under test
vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const { mockRename, mockRm, mockStat, mockMkdir } = vi.hoisted(() => ({
  mockRename: vi.fn(),
  mockRm: vi.fn(),
  mockStat: vi.fn(),
  mockMkdir: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: {
    rename: mockRename,
    rm: mockRm,
    stat: mockStat,
    mkdir: mockMkdir,
  },
  rename: mockRename,
  rm: mockRm,
  stat: mockStat,
  mkdir: mockMkdir,
}))

const { mockCommitGitState } = vi.hoisted(() => ({
  mockCommitGitState: vi.fn(),
}))

vi.mock('@/lib/git/sync.server', () => ({
  commitGitState: mockCommitGitState,
}))

// Auth + billing mocks — used by createStream limit checks
const { mockAssertAuthorizedRequest, mockCanCreateStream } = vi.hoisted(() => ({
  mockAssertAuthorizedRequest: vi.fn(
    async (): Promise<{ id: string; email: string } | null> => null,
  ),
  mockCanCreateStream: vi.fn(
    async (): Promise<{ allowed: boolean; reason?: string }> => ({
      allowed: true,
    }),
  ),
}))

vi.mock('@/lib/accounts/auth.server', () => ({
  assertAuthorizedRequest: mockAssertAuthorizedRequest,
  verifyToken: vi.fn(),
}))

vi.mock('@/ee/lib/billing/limits.server', () => ({
  canCreateStream: mockCanCreateStream,
}))

const MOCK_TOKEN = 'test-refresh-token'

import {
  checkStreamExists,
  createStream,
  deleteStream,
  renameStream,
} from './streams'

afterEach(() => {
  vi.restoreAllMocks()
})

// --- createStream ---

describe('createStream', () => {
  it('creates root directory and two subdirectories (specs, samples)', async () => {
    mockMkdir.mockResolvedValue(undefined)

    await createStream('weekly-reports')

    const root = path.join(MOCK_ROOT, 'weekly-reports')
    expect(mockMkdir).toHaveBeenCalledWith(root, { recursive: true })
    expect(mockMkdir).toHaveBeenCalledWith(path.join(root, 'specs'), {
      recursive: true,
    })
    expect(mockMkdir).toHaveBeenCalledWith(path.join(root, 'samples'), {
      recursive: true,
    })
    expect(mockMkdir).not.toHaveBeenCalledWith(path.join(root, 'tasks'), {
      recursive: true,
    })
    expect(mockMkdir).toHaveBeenCalledTimes(3)
  })

  it('does not create a stream-level uploads/ directory', async () => {
    mockMkdir.mockResolvedValue(undefined)

    await createStream('weekly-reports')

    const root = path.join(MOCK_ROOT, 'weekly-reports')
    expect(mockMkdir).not.toHaveBeenCalledWith(path.join(root, 'uploads'), {
      recursive: true,
    })
  })

  it('commits after creating directories', async () => {
    mockMkdir.mockResolvedValue(undefined)

    await createStream('weekly-reports')

    expect(mockCommitGitState).toHaveBeenCalledWith(
      '[weekly-reports] Create stream',
    )
  })

  it('rejects reserved root directory names', async () => {
    await expect(createStream('tasks')).rejects.toThrow('reserved name')
    expect(mockMkdir).not.toHaveBeenCalled()
  })

  it('rejects traversal in stream name', async () => {
    // Traversal segments fail the SAFE_PATH_SEGMENT_RE asserter at construction
    // time, before path.join — that's the regex barrier CodeQL recognises.
    await expect(createStream('../../etc/evil')).rejects.toThrow(
      'Invalid stream name',
    )
    expect(mockMkdir).not.toHaveBeenCalled()
  })

  it('throws when billing limit blocks stream creation', async () => {
    mockAssertAuthorizedRequest.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    })
    mockCanCreateStream.mockResolvedValue({
      allowed: false,
      reason: 'Free plan allows 1 stream. Upgrade to create more.',
    })

    await expect(createStream('second-stream', MOCK_TOKEN)).rejects.toThrow(
      'Free plan allows 1 stream. Upgrade to create more.',
    )
    expect(mockMkdir).not.toHaveBeenCalled()
  })

  it('creates stream when authorized and billing allows it', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockAssertAuthorizedRequest.mockResolvedValue({
      id: 'user-123',
      email: 'test@example.com',
    })
    mockCanCreateStream.mockResolvedValue({ allowed: true })

    await createStream('my-stream', MOCK_TOKEN)

    expect(mockAssertAuthorizedRequest).toHaveBeenCalledWith(MOCK_TOKEN)
    expect(mockCanCreateStream).toHaveBeenCalledWith('user-123')
    expect(mockMkdir).toHaveBeenCalled()
  })

  it('skips billing check when authorization returns null (billing disabled)', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockAssertAuthorizedRequest.mockResolvedValue(null)

    await createStream('my-stream')

    expect(mockCanCreateStream).not.toHaveBeenCalled()
    expect(mockMkdir).toHaveBeenCalled()
  })

  it('throws when authorization fails', async () => {
    mockAssertAuthorizedRequest.mockRejectedValue(
      new Error('Sign in required.'),
    )

    await expect(createStream('my-stream')).rejects.toThrow('Sign in required.')
    expect(mockMkdir).not.toHaveBeenCalled()
  })
})

// --- deleteStream ---

describe('deleteStream', () => {
  it('commits after deleting stream', async () => {
    mockRm.mockResolvedValue(undefined)

    await deleteStream('old-stream')

    expect(mockCommitGitState).toHaveBeenCalledWith(
      '[old-stream] Delete stream',
    )
  })
})

// --- renameStream ---

describe('renameStream', () => {
  it('renames a stream directory atomically', async () => {
    mockRename.mockResolvedValue(undefined)

    await renameStream('abc12345', 'weekly-reports')

    expect(mockRename).toHaveBeenCalledWith(
      path.join(MOCK_ROOT, 'abc12345'),
      path.join(MOCK_ROOT, 'weekly-reports'),
    )
  })

  it('rejects traversal in source stream name', async () => {
    await expect(renameStream('../../etc/evil', 'good-name')).rejects.toThrow(
      'Invalid stream name',
    )
    expect(mockRename).not.toHaveBeenCalled()
  })

  it('rejects reserved root directory names as destination', async () => {
    await expect(renameStream('good-name', 'tasks')).rejects.toThrow(
      'reserved name',
    )
    expect(mockRename).not.toHaveBeenCalled()
  })

  it('rejects traversal in destination stream name', async () => {
    await expect(renameStream('good-name', '../../etc/evil')).rejects.toThrow(
      'Invalid stream name',
    )
    expect(mockRename).not.toHaveBeenCalled()
  })

  it('commits after renaming', async () => {
    mockRename.mockResolvedValue(undefined)

    await renameStream('abc12345', 'weekly-reports')

    expect(mockCommitGitState).toHaveBeenCalledWith(
      '[weekly-reports] Rename stream from abc12345',
    )
  })

  it('propagates filesystem errors', async () => {
    const err = new Error('ENOENT') as NodeJS.ErrnoException
    err.code = 'ENOENT'
    mockRename.mockRejectedValue(err)

    await expect(renameStream('old', 'new')).rejects.toThrow('ENOENT')
  })
})

// --- checkStreamExists ---

describe('checkStreamExists', () => {
  it('returns true for an existing stream directory', async () => {
    mockStat.mockResolvedValue({ isDirectory: () => true })

    const result = await checkStreamExists('my-stream')

    expect(result).toBe(true)
  })

  it('returns false when the stream does not exist', async () => {
    const enoent = new Error('ENOENT') as NodeJS.ErrnoException
    enoent.code = 'ENOENT'
    mockStat.mockRejectedValue(enoent)

    const result = await checkStreamExists('missing-stream')

    expect(result).toBe(false)
  })

  it('rejects traversal in stream name', async () => {
    await expect(checkStreamExists('../../etc/evil')).rejects.toThrow(
      'Invalid stream name',
    )
    expect(mockStat).not.toHaveBeenCalled()
  })
})
