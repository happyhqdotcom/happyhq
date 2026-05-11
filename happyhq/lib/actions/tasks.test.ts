import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const { mockAccess, mockRm } = vi.hoisted(() => ({
  mockAccess: vi.fn(),
  mockRm: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: { access: mockAccess, rm: mockRm },
  access: mockAccess,
  rm: mockRm,
}))

vi.mock('@/lib/git/sync.server', () => ({
  commitGitState: vi.fn(),
}))

vi.mock('@/lib/log.server', () => ({
  log: vi.fn(),
}))

import { deleteTaskInput } from './tasks'

describe('deleteTaskInput', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('deletes a single-segment file input', async () => {
    mockAccess.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)

    await deleteTaskInput('task-1', 'project-brief')

    const expected = path.join(
      MOCK_ROOT,
      'tasks',
      'task-1',
      'inputs',
      'project-brief',
    )
    expect(mockRm).toHaveBeenCalledWith(expected, {
      recursive: true,
      force: true,
    })
  })

  it('deletes a two-segment web input (web/<domain>)', async () => {
    mockAccess.mockResolvedValue(undefined)
    mockRm.mockResolvedValue(undefined)

    await deleteTaskInput('task-1', 'web/planning-wandsworth-gov-uk')

    const expected = path.join(
      MOCK_ROOT,
      'tasks',
      'task-1',
      'inputs',
      'web',
      'planning-wandsworth-gov-uk',
    )
    expect(mockRm).toHaveBeenCalledWith(expected, {
      recursive: true,
      force: true,
    })
  })

  it('rejects traversal attempts in single-segment names', async () => {
    await expect(deleteTaskInput('task-1', '../escape')).rejects.toThrow(
      /Invalid input name/,
    )
    expect(mockRm).not.toHaveBeenCalled()
  })

  it('rejects traversal attempts in the web/ domain segment', async () => {
    await expect(deleteTaskInput('task-1', 'web/..')).rejects.toThrow(
      /Invalid input name/,
    )
    expect(mockRm).not.toHaveBeenCalled()
  })

  it('rejects non-web two-segment names', async () => {
    await expect(deleteTaskInput('task-1', 'foo/bar')).rejects.toThrow(
      /Invalid input name/,
    )
    expect(mockRm).not.toHaveBeenCalled()
  })

  it('rejects three-segment names', async () => {
    await expect(
      deleteTaskInput('task-1', 'web/example-com/extra'),
    ).rejects.toThrow(/Invalid input name/)
    expect(mockRm).not.toHaveBeenCalled()
  })
})
