import path from 'path'
import { describe, expect, it, vi } from 'vitest'

// Mock constants before importing paths — HAPPYHQ_ROOT uses os.homedir()
vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

import { safePath, streamPath, validatePath } from './paths'

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
