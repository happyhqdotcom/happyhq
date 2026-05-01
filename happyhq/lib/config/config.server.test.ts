import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadTextFile = vi.hoisted(() => vi.fn())
const mockWriteTextFile = vi.hoisted(() => vi.fn())
const mockReadFileSync = vi.hoisted(() => vi.fn())

vi.mock('@/lib/fs/read.server', () => ({
  readTextFile: mockReadTextFile,
}))

vi.mock('@/lib/fs/write.server', () => ({
  writeTextFile: mockWriteTextFile,
}))

vi.mock('node:fs', () => ({
  default: { readFileSync: mockReadFileSync },
  readFileSync: mockReadFileSync,
}))

import { readConfig, readConfigSync, writeConfig } from './config.server'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('readConfig', () => {
  it('returns empty object when config file is missing', async () => {
    mockReadTextFile.mockResolvedValue(null)
    const config = await readConfig()
    expect(config).toEqual({})
  })

  it('parses valid JSON from the config file', async () => {
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({ limits: { maxIterations: 30 } }),
    )
    const config = await readConfig()
    expect(config.limits?.maxIterations).toBe(30)
  })

  it('returns empty object when JSON is malformed', async () => {
    mockReadTextFile.mockResolvedValue('not valid json{{{')
    const config = await readConfig()
    expect(config).toEqual({})
  })
})

describe('readConfigSync', () => {
  it('returns empty object when file does not exist', () => {
    mockReadFileSync.mockImplementation(() => {
      const err = new Error('ENOENT') as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    })
    expect(readConfigSync()).toEqual({})
  })

  it('parses valid JSON synchronously', () => {
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ git: { authorName: 'Bob' } }),
    )
    expect(readConfigSync().git?.authorName).toBe('Bob')
  })

  it('returns empty object on malformed JSON', () => {
    mockReadFileSync.mockReturnValue('broken')
    expect(readConfigSync()).toEqual({})
  })
})

describe('writeConfig', () => {
  it('merges partial update with existing config', async () => {
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({
        limits: { maxIterations: 15 },
        git: { authorName: 'A' },
      }),
    )
    mockWriteTextFile.mockResolvedValue(undefined)

    const result = await writeConfig({ limits: { planningBudgetUsd: 20 } })

    // Existing fields preserved
    expect(result.limits?.maxIterations).toBe(15)
    expect(result.git?.authorName).toBe('A')
    // New field applied
    expect(result.limits?.planningBudgetUsd).toBe(20)
    // Writes to disk
    expect(mockWriteTextFile).toHaveBeenCalledOnce()
  })

  it('creates config from scratch when file is missing', async () => {
    mockReadTextFile.mockResolvedValue(null)
    mockWriteTextFile.mockResolvedValue(undefined)

    const result = await writeConfig({
      models: { learning: { model: 'haiku' } },
    })

    expect(result.models?.learning?.model).toBe('haiku')
    expect(mockWriteTextFile).toHaveBeenCalledOnce()
  })

  it('drops __proto__ keys so attackers cannot pollute the prototype chain', async () => {
    mockReadTextFile.mockResolvedValue('{}')
    mockWriteTextFile.mockResolvedValue(undefined)

    // JSON.parse is the only way to get __proto__ as an own enumerable
    // property — TS won't let us write the literal directly, but a server
    // action receives parsed JSON.
    const malicious = JSON.parse(
      '{"__proto__":{"polluted":"top"},"models":{"learning":{"__proto__":{"polluted":"nested"}}}}',
    )

    const merged = await writeConfig(malicious)

    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect(Object.getPrototypeOf(merged)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(merged.models?.learning ?? {})).toBe(
      Object.prototype,
    )
  })

  it('drops constructor and prototype keys so attackers cannot reach Object.prototype via the constructor chain', async () => {
    mockReadTextFile.mockResolvedValue('{}')
    mockWriteTextFile.mockResolvedValue(undefined)

    const malicious = JSON.parse(
      '{"constructor":{"polluted":"yes"},"prototype":{"polluted":"yes"}}',
    )

    const merged = await writeConfig(malicious)

    expect(Object.hasOwn(merged, 'constructor')).toBe(false)
    expect(Object.hasOwn(merged, 'prototype')).toBe(false)
    expect(Object.prototype.constructor).toBe(Object)
  })

  it('deep-merges nested model config without losing sibling keys', async () => {
    mockReadTextFile.mockResolvedValue(
      JSON.stringify({
        models: {
          learning: { model: 'opus', thinking: 'adaptive' },
          planning: { model: 'sonnet' },
        },
      }),
    )
    mockWriteTextFile.mockResolvedValue(undefined)

    const result = await writeConfig({
      models: { learning: { thinking: 'disabled' } },
    })

    // Updated field
    expect(result.models?.learning?.thinking).toBe('disabled')
    // Sibling preserved within same section
    expect(result.models?.learning?.model).toBe('opus')
    // Sibling section preserved
    expect(result.models?.planning?.model).toBe('sonnet')
  })
})
