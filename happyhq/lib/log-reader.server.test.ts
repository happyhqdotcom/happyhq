import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testDir = '/tmp/test-happyhq-log-reader'
const mockLogsDir = vi.hoisted(() =>
  vi.fn(() => '/tmp/test-happyhq-log-reader'),
)

vi.mock('@/lib/fs/paths', () => ({
  logsDir: mockLogsDir,
}))

import { formatLogEntries, readLogs } from './log-reader.server'

/** Write a JSONL file for a given date. */
function writeLog(date: string, entries: Record<string, unknown>[]) {
  fs.mkdirSync(testDir, { recursive: true })
  const lines = entries.map((e) => JSON.stringify(e)).join('\n') + '\n'
  fs.writeFileSync(path.join(testDir, `${date}.jsonl`), lines)
}

describe('readLogs', () => {
  beforeEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-04-07T12:00:00.000Z'))
  })

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true })
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('returns recent entries from today in reverse order', () => {
    writeLog('2025-04-07', [
      { t: '2025-04-07T10:00:00Z', event: 'task.created', task: 'a' },
      { t: '2025-04-07T10:01:00Z', event: 'task.created', task: 'b' },
      { t: '2025-04-07T10:02:00Z', event: 'task.created', task: 'c' },
    ])

    const results = readLogs()
    expect(results).toHaveLength(3)
    expect(results[0].task).toBe('c') // newest first
    expect(results[1].task).toBe('b')
    expect(results[2].task).toBe('a')
  })

  it('filters by task slug', () => {
    writeLog('2025-04-07', [
      { t: '2025-04-07T10:00:00Z', event: 'run.started', task: 'alpha' },
      { t: '2025-04-07T10:01:00Z', event: 'run.started', task: 'beta' },
      { t: '2025-04-07T10:02:00Z', event: 'run.error', task: 'alpha' },
    ])

    const results = readLogs({ task: 'alpha' })
    expect(results).toHaveLength(2)
    expect(results.every((e) => e.task === 'alpha')).toBe(true)
  })

  it('filters by stream slug', () => {
    writeLog('2025-04-07', [
      {
        t: '2025-04-07T10:00:00Z',
        event: 'task.created',
        stream: 'reports',
      },
      {
        t: '2025-04-07T10:01:00Z',
        event: 'task.created',
        stream: 'proposals',
      },
    ])

    const results = readLogs({ stream: 'reports' })
    expect(results).toHaveLength(1)
    expect(results[0].stream).toBe('reports')
  })

  it('filters by event prefix', () => {
    writeLog('2025-04-07', [
      { t: '2025-04-07T10:00:00Z', event: 'run.started', task: 'x' },
      { t: '2025-04-07T10:01:00Z', event: 'run.error', task: 'x' },
      { t: '2025-04-07T10:02:00Z', event: 'task.created', task: 'x' },
      { t: '2025-04-07T10:03:00Z', event: 'run.completed', task: 'x' },
    ])

    const results = readLogs({ event: 'run.' })
    expect(results).toHaveLength(3)
    expect(results.every((e) => e.event.startsWith('run.'))).toBe(true)
  })

  it('filters by since timestamp', () => {
    writeLog('2025-04-07', [
      { t: '2025-04-07T08:00:00Z', event: 'task.created', task: 'old' },
      { t: '2025-04-07T10:00:00Z', event: 'task.created', task: 'mid' },
      { t: '2025-04-07T11:00:00Z', event: 'task.created', task: 'new' },
    ])

    const results = readLogs({ since: '2025-04-07T09:00:00Z' })
    expect(results).toHaveLength(2)
    expect(results[0].task).toBe('new')
    expect(results[1].task).toBe('mid')
  })

  it('respects the last limit', () => {
    writeLog('2025-04-07', [
      { t: '2025-04-07T10:00:00Z', event: 'task.created', task: 'a' },
      { t: '2025-04-07T10:01:00Z', event: 'task.created', task: 'b' },
      { t: '2025-04-07T10:02:00Z', event: 'task.created', task: 'c' },
    ])

    const results = readLogs({ last: 2 })
    expect(results).toHaveLength(2)
    expect(results[0].task).toBe('c')
    expect(results[1].task).toBe('b')
  })

  it('clamps last to max 100', () => {
    // Write 5 entries, request 200 — should still work, just clamped
    writeLog('2025-04-07', [
      { t: '2025-04-07T10:00:00Z', event: 'a', task: '1' },
      { t: '2025-04-07T10:01:00Z', event: 'b', task: '2' },
    ])

    const results = readLogs({ last: 200 })
    expect(results).toHaveLength(2)
  })

  it('reads across multiple days (backward)', () => {
    writeLog('2025-04-07', [
      { t: '2025-04-07T10:00:00Z', event: 'task.created', task: 'today' },
    ])
    writeLog('2025-04-06', [
      {
        t: '2025-04-06T15:00:00Z',
        event: 'task.created',
        task: 'yesterday',
      },
    ])

    const results = readLogs({ last: 10 })
    expect(results).toHaveLength(2)
    expect(results[0].task).toBe('today')
    expect(results[1].task).toBe('yesterday')
  })

  it('skips days with no log files', () => {
    writeLog('2025-04-07', [
      { t: '2025-04-07T10:00:00Z', event: 'task.created', task: 'today' },
    ])
    // Skip 2025-04-06 (no file)
    writeLog('2025-04-05', [
      {
        t: '2025-04-05T10:00:00Z',
        event: 'task.created',
        task: 'two-days-ago',
      },
    ])

    const results = readLogs({ last: 10 })
    expect(results).toHaveLength(2)
    expect(results[0].task).toBe('today')
    expect(results[1].task).toBe('two-days-ago')
  })

  it('returns empty array when no log files exist', () => {
    const results = readLogs()
    expect(results).toEqual([])
  })

  it('returns empty array when logs dir does not exist', () => {
    mockLogsDir.mockReturnValue('/tmp/nonexistent-dir-xyz')
    const results = readLogs()
    expect(results).toEqual([])
  })

  it('skips malformed JSON lines', () => {
    fs.mkdirSync(testDir, { recursive: true })
    fs.writeFileSync(
      path.join(testDir, '2025-04-07.jsonl'),
      '{"t":"2025-04-07T10:00:00Z","event":"good","task":"a"}\nnot json\n{"t":"2025-04-07T10:01:00Z","event":"also-good","task":"b"}\n',
    )

    const results = readLogs()
    expect(results).toHaveLength(2)
  })

  it('skips lines missing t or event fields', () => {
    fs.mkdirSync(testDir, { recursive: true })
    fs.writeFileSync(
      path.join(testDir, '2025-04-07.jsonl'),
      '{"event":"no-timestamp"}\n{"t":"2025-04-07T10:00:00Z"}\n{"t":"2025-04-07T10:01:00Z","event":"valid","task":"x"}\n',
    )

    const results = readLogs()
    expect(results).toHaveLength(1)
    expect(results[0].event).toBe('valid')
  })

  it('combines multiple filters', () => {
    writeLog('2025-04-07', [
      {
        t: '2025-04-07T10:00:00Z',
        event: 'run.started',
        task: 'alpha',
        stream: 'reports',
      },
      {
        t: '2025-04-07T10:01:00Z',
        event: 'run.error',
        task: 'alpha',
        stream: 'reports',
      },
      {
        t: '2025-04-07T10:02:00Z',
        event: 'task.created',
        task: 'alpha',
        stream: 'reports',
      },
      {
        t: '2025-04-07T10:03:00Z',
        event: 'run.error',
        task: 'beta',
        stream: 'reports',
      },
    ])

    const results = readLogs({
      task: 'alpha',
      event: 'run.',
      stream: 'reports',
    })
    expect(results).toHaveLength(2)
    expect(results[0].event).toBe('run.error')
    expect(results[1].event).toBe('run.started')
  })
})

describe('formatLogEntries', () => {
  it('returns "No matching log entries." for empty array', () => {
    expect(formatLogEntries([])).toBe('No matching log entries.')
  })

  it('formats entries as time + event + key=value fields', () => {
    const entries = [
      {
        t: '2025-04-07T10:04:00.123Z',
        event: 'run.error',
        task: 'quarterly-report',
        error: 'EACCES: permission denied',
      },
    ]

    const output = formatLogEntries(entries)
    expect(output).toContain('10:04:00')
    expect(output).toContain('run.error')
    expect(output).toContain('task="quarterly-report"')
    expect(output).toContain('error="EACCES: permission denied"')
    // Should NOT include raw t field as a key=value pair
    expect(output).not.toMatch(/t="2025/)
  })

  it('formats numeric values without quotes', () => {
    const entries = [
      {
        t: '2025-04-07T10:03:00Z',
        event: 'run.iteration',
        iteration: 1,
        cost: 0.32,
      },
    ]

    const output = formatLogEntries(entries)
    expect(output).toContain('iteration=1')
    expect(output).toContain('cost=0.32')
  })

  it('formats multiple entries on separate lines', () => {
    const entries = [
      { t: '2025-04-07T10:02:00Z', event: 'run.completed', task: 'a' },
      { t: '2025-04-07T10:01:00Z', event: 'run.started', task: 'a' },
    ]

    const lines = formatLogEntries(entries).split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('run.completed')
    expect(lines[1]).toContain('run.started')
  })
})
