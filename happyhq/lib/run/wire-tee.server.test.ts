import fs from 'node:fs/promises'
import path from 'node:path'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

// Use a stable per-process tmpdir for HAPPYHQ_ROOT so wire-tee writes don't
// leak outside the test workspace. The path is hoisted via vi.hoisted so it
// resolves before the constants.server mock factory runs at import time.
// Real fs.appendFile/mkdir are exercised — the guarantee under test is that
// JSONL appears on disk in the right place.
const { MOCK_ROOT } = vi.hoisted(() => ({
  MOCK_ROOT: `/tmp/happyhq-wire-tee-test-${process.pid}`,
}))

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: MOCK_ROOT,
}))

import { appendWireEvent } from './wire-tee.server'

beforeAll(async () => {
  // Clear any stale state from a crashed previous run.
  await fs.rm(MOCK_ROOT, { recursive: true, force: true })
})

afterAll(async () => {
  await fs.rm(MOCK_ROOT, { recursive: true, force: true })
})

beforeEach(async () => {
  await fs.mkdir(MOCK_ROOT, { recursive: true })
})

afterEach(async () => {
  await fs.rm(MOCK_ROOT, { recursive: true, force: true })
})

describe('appendWireEvent', () => {
  it('writes one event as a JSONL line to .runs/<runId>/wire.jsonl', async () => {
    const runId = 'run-abc123'
    await appendWireEvent(runId, {
      type: 'heartbeat',
      t: '2026-04-30T00:00:00.000Z',
    })

    const file = path.join(MOCK_ROOT, '.runs', runId, 'wire.jsonl')
    const content = await fs.readFile(file, 'utf8')
    expect(content).toBe(
      JSON.stringify({
        type: 'heartbeat',
        t: '2026-04-30T00:00:00.000Z',
      }) + '\n',
    )
  })

  it('appends multiple events as separate JSONL lines', async () => {
    const runId = 'run-xyz789'
    await appendWireEvent(runId, {
      type: 'heartbeat',
      t: '2026-04-30T00:00:00.000Z',
    })
    await appendWireEvent(runId, {
      type: 'task_content_changed',
    })
    await appendWireEvent(runId, {
      type: 'error',
      message: 'boom',
    })

    const file = path.join(MOCK_ROOT, '.runs', runId, 'wire.jsonl')
    const content = await fs.readFile(file, 'utf8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0])).toEqual({
      type: 'heartbeat',
      t: '2026-04-30T00:00:00.000Z',
    })
    expect(JSON.parse(lines[1])).toEqual({ type: 'task_content_changed' })
    expect(JSON.parse(lines[2])).toEqual({ type: 'error', message: 'boom' })
  })

  it('creates the parent .runs/<runId>/ directory if missing', async () => {
    const runId = 'fresh-run-id'
    const dir = path.join(MOCK_ROOT, '.runs', runId)
    await expect(fs.access(dir)).rejects.toThrow()

    await appendWireEvent(runId, { type: 'heartbeat', t: 'now' })

    const stat = await fs.stat(dir)
    expect(stat.isDirectory()).toBe(true)
  })

  it('rejects path-traversal runIds before touching disk', async () => {
    await expect(
      appendWireEvent('../escape', { type: 'heartbeat', t: 'now' }),
    ).rejects.toThrow(/Invalid run id/)
    await expect(
      appendWireEvent('a/b', { type: 'heartbeat', t: 'now' }),
    ).rejects.toThrow(/Invalid run id/)
  })
})
