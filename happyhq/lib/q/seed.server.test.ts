import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const { mockEnsureDirectory, mockWriteTextFile } = vi.hoisted(() => ({
  mockEnsureDirectory: vi.fn(),
  mockWriteTextFile: vi.fn(),
}))

vi.mock('@/lib/fs/write.server', () => ({
  ensureDirectory: mockEnsureDirectory,
  writeTextFile: mockWriteTextFile,
}))

const { mockReadFileSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
}))

vi.mock('node:fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

import { seedQMemory } from './seed.server'

afterEach(() => {
  vi.clearAllMocks()
})

describe('seedQMemory', () => {
  it('creates required directory structure under .q/', async () => {
    mockReadFileSync.mockReturnValue('content')

    await seedQMemory()

    const dirCalls = mockEnsureDirectory.mock.calls.map((c: string[]) => c[0])
    expect(dirCalls).toContain('/mock/home/HappyHQ/.q/specs')
    expect(dirCalls).toContain(
      '/mock/home/HappyHQ/.q/samples/playbooks/weekly-updates',
    )
    expect(dirCalls).toContain(
      '/mock/home/HappyHQ/.q/samples/specs/weekly-updates',
    )
  })

  it('reads all five seed files from the source q/ directory', async () => {
    mockReadFileSync.mockReturnValue('content')

    await seedQMemory()

    expect(mockReadFileSync).toHaveBeenCalledTimes(5)
    const readPaths = mockReadFileSync.mock.calls.map((c: string[]) => c[0])
    // All reads come from process.cwd()/q/
    for (const p of readPaths) {
      expect(p).toContain('/q/')
    }
  })

  it('writes each seed file to the corresponding .q/ destination', async () => {
    mockReadFileSync.mockReturnValue('seed content')

    await seedQMemory()

    expect(mockWriteTextFile).toHaveBeenCalledTimes(5)
    const writePaths = mockWriteTextFile.mock.calls.map((c: string[]) => c[0])
    expect(writePaths).toContain('/mock/home/HappyHQ/.q/playbook.md')
    expect(writePaths).toContain('/mock/home/HappyHQ/.q/specs/playbook.md')
    expect(writePaths).toContain('/mock/home/HappyHQ/.q/specs/spec.md')
    expect(writePaths).toContain(
      '/mock/home/HappyHQ/.q/samples/playbooks/weekly-updates/playbook.md',
    )
    expect(writePaths).toContain(
      '/mock/home/HappyHQ/.q/samples/specs/weekly-updates/spec.md',
    )
  })

  it('passes the file content read from source to writeTextFile', async () => {
    let callCount = 0
    mockReadFileSync.mockImplementation(() => {
      callCount++
      return `content-${callCount}`
    })

    await seedQMemory()

    // Each writeTextFile call should receive the content from the corresponding readFileSync
    for (const call of mockWriteTextFile.mock.calls) {
      expect(call[1]).toMatch(/^content-\d+$/)
    }
  })

  it('always overwrites — no existence check before writing', async () => {
    mockReadFileSync.mockReturnValue('updated content')

    await seedQMemory()
    await seedQMemory()

    // Both calls write all 5 files, no skipping
    expect(mockWriteTextFile).toHaveBeenCalledTimes(10)
  })

  it('propagates readFileSync errors when a seed file is missing', async () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error(
        "ENOENT: no such file or directory, open '/q/playbook.md'",
      )
    })

    await expect(seedQMemory()).rejects.toThrow('ENOENT')
  })

  it('propagates writeTextFile errors', async () => {
    mockReadFileSync.mockReturnValue('content')
    mockWriteTextFile.mockRejectedValue(new Error('EACCES: permission denied'))

    await expect(seedQMemory()).rejects.toThrow('EACCES')
  })

  it('creates directories before writing files', async () => {
    const callOrder: string[] = []
    mockEnsureDirectory.mockImplementation(() => {
      callOrder.push('ensureDir')
      return Promise.resolve()
    })
    mockWriteTextFile.mockImplementation(() => {
      callOrder.push('write')
      return Promise.resolve()
    })
    mockReadFileSync.mockReturnValue('content')

    await seedQMemory()

    // All 3 ensureDirectory calls happen before any writeTextFile calls
    // (they're in a Promise.all that resolves before the write loop)
    const firstWrite = callOrder.indexOf('write')
    const lastEnsureDir = callOrder.lastIndexOf('ensureDir')
    expect(lastEnsureDir).toBeLessThan(firstWrite)
  })
})
