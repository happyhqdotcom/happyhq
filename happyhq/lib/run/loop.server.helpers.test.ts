import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { RunInfo } from '@/lib/fs/types'

// ---------------------------------------------------------------------------
// Mocks — must come before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

vi.mock('@/lib/constants', () => ({
  PLANNING_BUDGET_USD: 5,
  WORKING_BUDGET_USD: 10,
  LLM_COST_PER_MINUTE_USD: 11 / 60,
}))

const MOCK_ROOT = '/mock/home/HappyHQ'

const {
  mockReadFile,
  mockWriteTextFile,
  mockClearDirectory,
  mockUpdateTaskMdPending,
} = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteTextFile: vi.fn(),
  mockClearDirectory: vi.fn(),
  mockUpdateTaskMdPending: vi.fn(),
}))

vi.mock('node:fs/promises', async () => {
  const actual =
    await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises')
  return {
    ...actual,
    default: { ...actual, readFile: mockReadFile },
    readFile: mockReadFile,
  }
})

vi.mock('@/lib/fs/write.server', () => ({
  writeTextFile: mockWriteTextFile,
  clearDirectory: mockClearDirectory,
}))

vi.mock('@/lib/fs/task-md.server', () => ({
  updateTaskMdPending: mockUpdateTaskMdPending,
}))

// SDK / agent / billing mocks — required because importing loop.server pulls
// the whole module graph in. None of these helpers exercise these paths.
vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: vi.fn(),
  AbortError: class extends Error {
    constructor(msg?: string) {
      super(msg ?? 'Aborted')
      this.name = 'AbortError'
    }
  },
}))

vi.mock('@/lib/agents/auth.server', () => ({
  getAuthEnv: vi.fn().mockResolvedValue(undefined),
  clearCredentials: vi.fn().mockResolvedValue(undefined),
  isAuthError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/agents/config.server', () => ({
  planningAgentOptions: vi.fn(),
  workingAgentOptions: vi.fn(),
}))

vi.mock('@/lib/git/sync.server', () => ({
  syncGitState: vi.fn(),
  commitGitState: vi.fn(),
  isTaskCompleted: vi.fn().mockReturnValue(false),
  getLatestTaskCommit: vi.fn(() => 'sha-x'),
  restorePlanFromGit: vi.fn(),
}))

vi.mock('@/ee/lib/billing/config', () => ({
  isBillingEnabled: vi.fn().mockReturnValue(false),
}))

vi.mock('@/ee/lib/billing/usage.server', () => ({
  startTaskRun: vi.fn().mockResolvedValue(null),
  updateUsage: vi.fn().mockResolvedValue(undefined),
  finalizeTaskRun: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/ee/lib/billing/limits.server', () => ({
  canStartTask: vi
    .fn()
    .mockResolvedValue({ allowed: true, remainingMinutes: 60 }),
}))

vi.mock('@/lib/config/config.server', () => ({
  readConfig: vi.fn().mockResolvedValue({ limits: { maxIterations: 3 } }),
}))

// Import after mocks
import {
  clearStaleRun,
  getActiveDiscoverySessionId,
  healIfStaleRun,
  setActiveDiscoverySessionId,
  updateRunInfoPendingQuestions,
} from './loop.server'

// Test-only: poke the module's globalThis-keyed state so we can simulate a
// live run in this process. Mirrors STATE_KEY in loop.server.ts.
const STATE_KEY = Symbol.for('__happyhq_run_loop_state__')
function setActiveRunForTest(stream: string | null, task: string | null): void {
  const g = globalThis as unknown as Record<symbol, any>
  const state = g[STATE_KEY]
  if (!state) throw new Error('loop.server state not initialised')
  state.activeRunStream = stream
  state.activeRunTask = task
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const taskName = 't1'
const runJsonPath = path.join(MOCK_ROOT, 'tasks', taskName, '.run.json')

function baseRun(overrides: Partial<RunInfo> = {}): RunInfo {
  return {
    status: 'discovering',
    startedAt: '2026-01-01T00:00:00.000Z',
    lastIterationAt: '2026-01-01T00:00:00.000Z',
    phases: [],
    ...overrides,
  }
}

function getLastRunInfoWrite(): RunInfo | undefined {
  const writes = mockWriteTextFile.mock.calls
    .filter((args) => (args[0] as string) === runJsonPath)
    .map((args) => JSON.parse(args[1] as string) as RunInfo)
  return writes[writes.length - 1]
}

const sampleQuestions = [
  {
    question: 'Pick a tone',
    header: 'Tone',
    options: [
      { label: 'Warm', description: 'Friendly tone' },
      { label: 'Crisp', description: 'Concise tone' },
    ],
    multiSelect: false,
  },
] as RunInfo['pendingQuestions']

beforeEach(() => {
  mockReadFile.mockReset()
  mockWriteTextFile.mockReset().mockResolvedValue(undefined)
  mockClearDirectory.mockResolvedValue(undefined)
  mockUpdateTaskMdPending.mockReset().mockResolvedValue(undefined)
  setActiveDiscoverySessionId(null)
  setActiveRunForTest(null, null)
})

afterEach(() => {
  setActiveDiscoverySessionId(null)
  setActiveRunForTest(null, null)
})

// ---------------------------------------------------------------------------
// updateRunInfoPendingQuestions
// ---------------------------------------------------------------------------

describe('updateRunInfoPendingQuestions', () => {
  it('writes the existing run with pendingQuestions added', async () => {
    const existing = baseRun()
    mockReadFile.mockResolvedValue(JSON.stringify(existing))

    await updateRunInfoPendingQuestions(taskName, sampleQuestions)

    const write = getLastRunInfoWrite()
    expect(write).toEqual({ ...existing, pendingQuestions: sampleQuestions })
  })

  it('clears pendingQuestions when called with undefined', async () => {
    const existing = baseRun({ pendingQuestions: sampleQuestions })
    mockReadFile.mockResolvedValue(JSON.stringify(existing))

    await updateRunInfoPendingQuestions(taskName, undefined)

    const write = getLastRunInfoWrite()
    expect(write?.pendingQuestions).toBeUndefined()
    expect(write?.status).toBe('discovering')
  })

  it('is a no-op when no .run.json exists', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFile.mockRejectedValue(enoent)

    await updateRunInfoPendingQuestions(taskName, sampleQuestions)

    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// syncTaskMdFromRun (exercised through writeRunInfo's cascade)
// ---------------------------------------------------------------------------

describe('pending field cascade for discovering status', () => {
  it("sets pending: 'clarification' when discovering with pendingQuestions", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify(baseRun({ status: 'discovering' })),
    )

    await updateRunInfoPendingQuestions(taskName, sampleQuestions)

    expect(mockUpdateTaskMdPending).toHaveBeenLastCalledWith(
      path.join(MOCK_ROOT, 'tasks', taskName),
      'clarification',
    )
  })

  it('clears pending when discovering with no pendingQuestions', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify(
        baseRun({ status: 'discovering', pendingQuestions: sampleQuestions }),
      ),
    )

    await updateRunInfoPendingQuestions(taskName, undefined)

    expect(mockUpdateTaskMdPending).toHaveBeenLastCalledWith(
      path.join(MOCK_ROOT, 'tasks', taskName),
      undefined,
    )
  })

  it("preserves prior arms — 'plan_ready' still maps to 'approval'", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify(baseRun({ status: 'plan_ready' })),
    )

    // Touch pendingQuestions on a non-discovering run — the wrapper still
    // writes, and the cascade should evaluate the plan_ready arm.
    await updateRunInfoPendingQuestions(taskName, undefined)

    expect(mockUpdateTaskMdPending).toHaveBeenLastCalledWith(
      path.join(MOCK_ROOT, 'tasks', taskName),
      'approval',
    )
  })

  it("maps 'completed' to 'review' and stopped+budget to 'checkpoint'", async () => {
    mockReadFile.mockResolvedValueOnce(
      JSON.stringify(baseRun({ status: 'completed' })),
    )
    await updateRunInfoPendingQuestions(taskName, undefined)
    expect(mockUpdateTaskMdPending).toHaveBeenLastCalledWith(
      path.join(MOCK_ROOT, 'tasks', taskName),
      'review',
    )

    mockReadFile.mockResolvedValueOnce(
      JSON.stringify(baseRun({ status: 'stopped', stopReason: 'budget' })),
    )
    await updateRunInfoPendingQuestions(taskName, undefined)
    expect(mockUpdateTaskMdPending).toHaveBeenLastCalledWith(
      path.join(MOCK_ROOT, 'tasks', taskName),
      'checkpoint',
    )
  })
})

// ---------------------------------------------------------------------------
// activeDiscoverySessionId module state
// ---------------------------------------------------------------------------

describe('activeDiscoverySessionId', () => {
  it('returns null by default', () => {
    expect(getActiveDiscoverySessionId()).toBeNull()
  })

  it('reflects the value most recently set', () => {
    setActiveDiscoverySessionId('session-abc')
    expect(getActiveDiscoverySessionId()).toBe('session-abc')
    setActiveDiscoverySessionId(null)
    expect(getActiveDiscoverySessionId()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// clearStaleRun — discovery cleanup
// ---------------------------------------------------------------------------

describe('clearStaleRun', () => {
  it('clears pendingQuestions and the active discovery session id when a discovering run is found', async () => {
    setActiveDiscoverySessionId('session-stale')
    mockReadFile.mockResolvedValue(
      JSON.stringify(
        baseRun({
          status: 'discovering',
          pendingQuestions: sampleQuestions,
        }),
      ),
    )

    await clearStaleRun(taskName)

    const write = getLastRunInfoWrite()
    expect(write).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'discovery',
      stopReason: 'error',
    })
    expect(write?.pendingQuestions).toBeUndefined()
    expect(getActiveDiscoverySessionId()).toBeNull()
  })

  it("maps a leftover 'planning' run to stoppedDuring 'planning'", async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify(baseRun({ status: 'planning' })),
    )

    await clearStaleRun(taskName)

    const write = getLastRunInfoWrite()
    expect(write).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'planning',
    })
  })

  it('is a no-op when no .run.json exists', async () => {
    const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    mockReadFile.mockRejectedValue(enoent)

    await clearStaleRun(taskName)

    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// healIfStaleRun — lazy on-read self-heal after server crash / HMR
// ---------------------------------------------------------------------------

describe('healIfStaleRun', () => {
  it('heals an active-status run with no live loop owner to stopped/lost', async () => {
    const stale = baseRun({ status: 'working' })
    mockReadFile.mockResolvedValue(JSON.stringify(stale))

    const healed = await healIfStaleRun(taskName, stale)

    expect(healed).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'working',
      stopReason: 'error',
      error: 'Run lost (server restarted)',
    })
    const write = getLastRunInfoWrite()
    expect(write).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'working',
      stopReason: 'error',
      error: 'Run lost (server restarted)',
    })
  })

  it('is a no-op when the active run in this process owns the task', async () => {
    setActiveRunForTest('s1', taskName)
    const live = baseRun({ status: 'working' })

    const result = await healIfStaleRun(taskName, live)

    expect(result).toBe(live)
    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })

  it('is a no-op for terminal-status runs (no liveness check, no write)', async () => {
    const done = baseRun({ status: 'completed' })

    const result = await healIfStaleRun(taskName, done)

    expect(result).toBe(done)
    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })
})
