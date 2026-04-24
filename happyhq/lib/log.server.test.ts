import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Undo the global mock so we can test the real implementation
vi.unmock('@/lib/log.server')

const mockLogsDir = vi.hoisted(() => vi.fn(() => '/tmp/test-happyhq-logs'))

vi.mock('@/lib/fs/paths', () => ({
  logsDir: mockLogsDir,
}))

import { log } from './log.server'

describe('log', () => {
  const testDir = '/tmp/test-happyhq-logs'

  beforeEach(() => {
    // Clean up test directory before each test
    fs.rmSync(testDir, { recursive: true, force: true })
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('appends a valid JSON line with t and event fields', () => {
    log('task.created', { task: 'my-task', stream: 'reports' })

    const files = fs.readdirSync(testDir)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/)

    const content = fs.readFileSync(path.join(testDir, files[0]), 'utf-8')
    const parsed = JSON.parse(content.trim())
    expect(parsed.t).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(parsed.event).toBe('task.created')
    expect(parsed.task).toBe('my-task')
    expect(parsed.stream).toBe('reports')
  })

  it('includes all data fields in the JSON line', () => {
    log('run.completed', {
      task: 'x',
      cost: 0.45,
      iterations: 3,
      duration_ms: 12000,
    })

    const files = fs.readdirSync(testDir)
    const content = fs.readFileSync(path.join(testDir, files[0]), 'utf-8')
    const parsed = JSON.parse(content.trim())
    expect(parsed.cost).toBe(0.45)
    expect(parsed.iterations).toBe(3)
    expect(parsed.duration_ms).toBe(12000)
  })

  it('creates .logs/ directory if missing', () => {
    expect(fs.existsSync(testDir)).toBe(false)
    log('task.created', { task: 'x' })
    expect(fs.existsSync(testDir)).toBe(true)
  })

  it('creates daily file named by ISO date', () => {
    const fakeDate = new Date('2025-04-07T10:00:00.000Z')
    vi.setSystemTime(fakeDate)

    log('task.created', { task: 'x' })

    const files = fs.readdirSync(testDir)
    expect(files).toContain('2025-04-07.jsonl')

    vi.useRealTimers()
  })

  it('appends to existing daily file (does not overwrite)', () => {
    log('task.created', { task: 'first' })
    log('task.deleted', { task: 'second' })

    const files = fs.readdirSync(testDir)
    expect(files).toHaveLength(1)

    const lines = fs
      .readFileSync(path.join(testDir, files[0]), 'utf-8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0]).task).toBe('first')
    expect(JSON.parse(lines[1]).task).toBe('second')
  })

  it('does not throw when directory creation fails', () => {
    // Use a mock instead of a real "impossible" path: fs.mkdirSync on
    // /proc/* paths hangs synchronously on Linux (CI), even though it
    // returns an error on macOS. A direct mock is platform-independent.
    const mkdirSpy = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {
      throw new Error('mock mkdir failure')
    })
    expect(() => log('task.created', { task: 'x' })).not.toThrow()
    mkdirSpy.mockRestore()
  })

  it('does not throw when file write fails', () => {
    // Create the dir as a file to make appendFileSync fail
    fs.mkdirSync(path.dirname(testDir), { recursive: true })
    fs.writeFileSync(testDir, 'not a directory')

    expect(() => log('task.created', { task: 'x' })).not.toThrow()

    // Clean up
    fs.rmSync(testDir, { force: true })
  })

  it('handles undefined/null data gracefully', () => {
    log('task.created')
    log('task.deleted', undefined)

    const files = fs.readdirSync(testDir)
    const lines = fs
      .readFileSync(path.join(testDir, files[0]), 'utf-8')
      .trim()
      .split('\n')
    expect(lines).toHaveLength(2)

    for (const line of lines) {
      const parsed = JSON.parse(line)
      expect(parsed.t).toBeDefined()
      expect(parsed.event).toBeDefined()
    }
  })

  it('writes fallback line with _serializationError on circular reference', () => {
    const circular: Record<string, unknown> = { task: 'x' }
    circular.self = circular

    log('run.error', circular)

    const files = fs.readdirSync(testDir)
    const content = fs.readFileSync(path.join(testDir, files[0]), 'utf-8')
    const parsed = JSON.parse(content.trim())
    expect(parsed.event).toBe('run.error')
    expect(parsed._serializationError).toBe(true)
  })
})
