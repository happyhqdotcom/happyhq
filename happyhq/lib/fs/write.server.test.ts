import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Mock constants — must be before importing the module under test
vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

// vi.hoisted() runs before vi.mock hoisting, so these are available in the factory
const { mockMkdir, mockRm, mockWriteFile } = vi.hoisted(() => ({
  mockMkdir: vi.fn(),
  mockRm: vi.fn(),
  mockWriteFile: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: { mkdir: mockMkdir, rm: mockRm, writeFile: mockWriteFile },
  mkdir: mockMkdir,
  rm: mockRm,
  writeFile: mockWriteFile,
}))

import { clearDirectory, ensureDirectory, writeTextFile } from './write.server'

afterEach(() => {
  vi.clearAllMocks()
})

// --- ensureDirectory ---

describe('ensureDirectory', () => {
  it('succeeds when the directory already exists', async () => {
    // mkdir with recursive: true does not throw for existing directories
    mockMkdir.mockResolvedValue(undefined)
    await expect(
      ensureDirectory(path.join(MOCK_ROOT, 'existing-dir')),
    ).resolves.toBeUndefined()
  })

  it('rejects paths outside ~/HappyHQ/', async () => {
    await expect(ensureDirectory('/etc/evil')).rejects.toThrow(
      'outside ~/HappyHQ/',
    )
    expect(mockMkdir).not.toHaveBeenCalled()
  })

  it('propagates filesystem errors', async () => {
    const err = new Error('EACCES') as NodeJS.ErrnoException
    err.code = 'EACCES'
    mockMkdir.mockRejectedValue(err)
    await expect(
      ensureDirectory(path.join(MOCK_ROOT, 'stream')),
    ).rejects.toThrow('EACCES')
  })
})

// --- writeTextFile ---

describe('writeTextFile', () => {
  it('writes content to a file and creates parent directories', async () => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)

    const filePath = path.join(MOCK_ROOT, 'stream/specs/tone.md')
    await writeTextFile(filePath, '# Tone')

    // File should be written with UTF-8 encoding
    expect(mockWriteFile).toHaveBeenCalledWith(filePath, '# Tone', 'utf-8')
  })

  it('rejects paths outside ~/HappyHQ/', async () => {
    await expect(writeTextFile('/etc/passwd', 'evil')).rejects.toThrow(
      'outside ~/HappyHQ/',
    )
    expect(mockMkdir).not.toHaveBeenCalled()
    expect(mockWriteFile).not.toHaveBeenCalled()
  })

  it('propagates filesystem errors from writeFile', async () => {
    mockMkdir.mockResolvedValue(undefined)
    const err = new Error('ENOSPC') as NodeJS.ErrnoException
    err.code = 'ENOSPC'
    mockWriteFile.mockRejectedValue(err)

    await expect(
      writeTextFile(path.join(MOCK_ROOT, 'stream/file.md'), 'content'),
    ).rejects.toThrow('ENOSPC')
  })

  it('propagates filesystem errors from mkdir', async () => {
    const err = new Error('EACCES') as NodeJS.ErrnoException
    err.code = 'EACCES'
    mockMkdir.mockRejectedValue(err)

    await expect(
      writeTextFile(path.join(MOCK_ROOT, 'stream/file.md'), 'content'),
    ).rejects.toThrow('EACCES')
    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})

// --- clearDirectory ---

describe('clearDirectory', () => {
  it('succeeds when the directory does not exist', async () => {
    // rm with force: true does not throw for nonexistent directories
    mockRm.mockResolvedValue(undefined)
    mockMkdir.mockResolvedValue(undefined)

    await expect(
      clearDirectory(path.join(MOCK_ROOT, 'nonexistent')),
    ).resolves.toBeUndefined()
  })

  it('rejects paths outside ~/HappyHQ/', async () => {
    await expect(clearDirectory('/etc/evil')).rejects.toThrow(
      'outside ~/HappyHQ/',
    )
    expect(mockRm).not.toHaveBeenCalled()
    expect(mockMkdir).not.toHaveBeenCalled()
  })
})
