import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRoot } = vi.hoisted(() => {
  return { mockRoot: { path: '' } }
})

vi.mock('@/lib/constants.server', () => ({
  get HAPPYHQ_ROOT() {
    return mockRoot.path
  },
}))

import {
  _resetDataRootCacheForTests,
  DataRootError,
  ensureDataRoot,
} from './data-root.server'

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), 'happyhq-data-root-test-'))
  mockRoot.path = path.join(tmpRoot, 'HappyHQ')
  _resetDataRootCacheForTests()
})

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
})

describe('ensureDataRoot', () => {
  it('creates the directory and writes the marker on first run', () => {
    ensureDataRoot()
    const marker = path.join(mockRoot.path, '.happyhq')
    expect(() => statSync(marker)).not.toThrow()
  })

  it('writes the marker when the directory exists but is empty', () => {
    mkdirSync(mockRoot.path, { recursive: true })
    ensureDataRoot()
    const marker = path.join(mockRoot.path, '.happyhq')
    expect(() => statSync(marker)).not.toThrow()
  })

  it('proceeds quietly when the marker is already present', () => {
    mkdirSync(mockRoot.path, { recursive: true })
    writeFileSync(path.join(mockRoot.path, '.happyhq'), '{"schemaVersion":1}\n')
    writeFileSync(path.join(mockRoot.path, 'foo'), 'bar')
    expect(() => ensureDataRoot()).not.toThrow()
  })

  it('throws when the directory has unrelated content and no marker', () => {
    mkdirSync(mockRoot.path, { recursive: true })
    mkdirSync(path.join(mockRoot.path, 'node_modules'))
    writeFileSync(path.join(mockRoot.path, 'package.json'), '{}')
    let err: unknown
    try {
      ensureDataRoot()
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DataRootError)
    const msg = (err as Error).message
    expect(msg).toContain('happyhq data folder is not initialized')
    expect(msg).toContain(mockRoot.path)
    expect(msg).toContain('node_modules/')
    expect(msg).toContain('package.json')
    expect(msg).toContain('source checkout')
    expect(msg).toContain('HAPPYHQ_ROOT=')
  })

  it('migrates a pre-marker happyhq root by detecting our .gitignore', () => {
    mkdirSync(mockRoot.path, { recursive: true })
    writeFileSync(
      path.join(mockRoot.path, '.gitignore'),
      '.DS_Store\n.chats/\n.logs/\n',
    )
    mkdirSync(path.join(mockRoot.path, 'tasks'))
    expect(() => ensureDataRoot()).not.toThrow()
    expect(() => statSync(path.join(mockRoot.path, '.happyhq'))).not.toThrow()
  })

  it('caches the failure so subsequent calls throw without re-checking', () => {
    mkdirSync(mockRoot.path, { recursive: true })
    writeFileSync(path.join(mockRoot.path, 'stray'), 'x')
    expect(() => ensureDataRoot()).toThrow(DataRootError)
    // Even if we clean up the folder, the cached failure still throws.
    rmSync(path.join(mockRoot.path, 'stray'))
    expect(() => ensureDataRoot()).toThrow(DataRootError)
  })
})
