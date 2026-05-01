import path from 'path'
import { describe, expect, it, vi } from 'vitest'

// Mock constants before importing paths — HAPPYHQ_ROOT uses os.homedir()
vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

import {
  assertSafeStreamName,
  assertSafeTaskSlug,
  safePath,
  streamPath,
  validatePath,
} from './paths'

describe('streamPath', () => {
  it('returns the full path for a stream', () => {
    expect(streamPath('my-stream')).toBe(
      path.join('/mock/home/HappyHQ', 'my-stream'),
    )
  })
})

describe('validatePath', () => {
  it('accepts a path inside ~/HappyHQ/', () => {
    expect(() =>
      validatePath('/mock/home/HappyHQ/my-stream/specs/tone.md'),
    ).not.toThrow()
  })

  it('rejects a path that traverses outside ~/HappyHQ/', () => {
    expect(() => validatePath('/mock/home/HappyHQ/../../etc/passwd')).toThrow(
      'outside ~/HappyHQ/',
    )
  })

  it('rejects an absolute path outside ~/HappyHQ/', () => {
    expect(() => validatePath('/etc/passwd')).toThrow('outside ~/HappyHQ/')
  })

  it('accepts the root ~/HappyHQ/ itself', () => {
    expect(() => validatePath('/mock/home/HappyHQ')).not.toThrow()
  })

  it('accepts nested subdirectories', () => {
    expect(() =>
      validatePath('/mock/home/HappyHQ/stream/tasks/task-1/working'),
    ).not.toThrow()
  })
})

describe('safePath', () => {
  it('returns the canonical path for a value already inside ~/HappyHQ/', () => {
    expect(safePath('/mock/home/HappyHQ/foo/bar')).toBe(
      path.join('/mock/home/HappyHQ', 'foo', 'bar'),
    )
  })

  it('canonicalizes traversal segments that stay inside the root', () => {
    // ~/HappyHQ/stream/../foo resolves to ~/HappyHQ/foo — still inside root.
    // The point of returning the canonical value is that downstream fs ops
    // see the resolved path, not the attacker's original string.
    expect(safePath('/mock/home/HappyHQ/stream/../foo')).toBe(
      path.join('/mock/home/HappyHQ', 'foo'),
    )
  })

  it('throws on traversal that escapes the root', () => {
    expect(() => safePath('/mock/home/HappyHQ/../etc/passwd')).toThrow(
      'outside ~/HappyHQ/',
    )
  })

  it('throws on an absolute path outside the root', () => {
    expect(() => safePath('/etc/passwd')).toThrow('outside ~/HappyHQ/')
  })

  it('returns the root itself unchanged', () => {
    expect(safePath('/mock/home/HappyHQ')).toBe('/mock/home/HappyHQ')
  })
})

describe('assertSafeStreamName', () => {
  it('accepts a typical slug', () => {
    expect(() => assertSafeStreamName('my-stream')).not.toThrow()
  })

  it('accepts dotted and underscored alnum slugs', () => {
    expect(() => assertSafeStreamName('my_stream.v2')).not.toThrow()
  })

  it('rejects an empty string', () => {
    expect(() => assertSafeStreamName('')).toThrow('Invalid stream name')
  })

  it('rejects a leading dot (hidden)', () => {
    expect(() => assertSafeStreamName('.hidden')).toThrow('Invalid stream name')
  })

  it('rejects parent-traversal `..`', () => {
    expect(() => assertSafeStreamName('..')).toThrow('Invalid stream name')
  })

  it('rejects values containing `/`', () => {
    expect(() => assertSafeStreamName('foo/bar')).toThrow('Invalid stream name')
  })

  it('rejects values containing `\\`', () => {
    expect(() => assertSafeStreamName('foo\\bar')).toThrow(
      'Invalid stream name',
    )
  })

  it('rejects values longer than 128 characters', () => {
    expect(() => assertSafeStreamName('a'.repeat(129))).toThrow(
      'Invalid stream name',
    )
  })
})

describe('assertSafeTaskSlug', () => {
  it('accepts a typical dated slug', () => {
    expect(() => assertSafeTaskSlug('2026-04-30-feature-x')).not.toThrow()
  })

  it('accepts dotted and underscored alnum slugs', () => {
    expect(() => assertSafeTaskSlug('task_1.draft')).not.toThrow()
  })

  it('rejects an empty string', () => {
    expect(() => assertSafeTaskSlug('')).toThrow('Invalid task slug')
  })

  it('rejects a leading dot (hidden)', () => {
    expect(() => assertSafeTaskSlug('.hidden')).toThrow('Invalid task slug')
  })

  it('rejects parent-traversal `..`', () => {
    expect(() => assertSafeTaskSlug('..')).toThrow('Invalid task slug')
  })

  it('rejects values containing `/`', () => {
    expect(() => assertSafeTaskSlug('foo/bar')).toThrow('Invalid task slug')
  })

  it('rejects values containing `\\`', () => {
    expect(() => assertSafeTaskSlug('foo\\bar')).toThrow('Invalid task slug')
  })

  it('rejects values longer than 128 characters', () => {
    expect(() => assertSafeTaskSlug('a'.repeat(129))).toThrow(
      'Invalid task slug',
    )
  })
})
