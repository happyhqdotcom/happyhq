import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

function taskDir(task: string) {
  return path.join(MOCK_ROOT, 'tasks', task)
}

// Hoisted mock functions — available in vi.mock() factories
const {
  mockQuery,
  MockAbortError,
  mockDiscoveryAgentOptions,
  mockPlanningAgentOptions,
  mockWorkingAgentOptions,
  mockIsTaskCompleted,
  mockGetLatestTaskCommit,
  mockCommitGitState,
  mockWriteTextFile,
  mockClearDirectory,
  mockIsBillingEnabled,
  mockStartTaskRun,
  mockUpdateUsage,
  mockFinalizeTaskRun,
  mockCanStartTask,
  mockReadConfig,
} = vi.hoisted(() => {
  return {
    mockQuery: vi.fn(),
    mockReadConfig: vi.fn().mockResolvedValue({ limits: { maxIterations: 3 } }),
    MockAbortError: class MockAbortError extends Error {
      constructor(msg?: string) {
        super(msg ?? 'Aborted')
        this.name = 'AbortError'
      }
    },
    // Agent option mocks capture the AbortController so query mock can access the signal
    mockDiscoveryAgentOptions: vi.fn(
      (
        _s: string,
        _t: string,
        _sid: string,
        ac: AbortController,
        _opts?: any,
      ) => ({
        abortController: ac,
        maxBudgetUsd: 2,
      }),
    ),
    mockPlanningAgentOptions: vi.fn(
      (_s: string, _t: string, ac: AbortController, _opts?: any) => ({
        abortController: ac,
        maxBudgetUsd: 5,
      }),
    ),
    mockWorkingAgentOptions: vi.fn(
      (_s: string, _t: string, ac: AbortController, _opts?: any) => ({
        abortController: ac,
        maxBudgetUsd: 10,
      }),
    ),
    mockIsTaskCompleted: vi.fn().mockReturnValue(false),
    // Defaults to a fresh SHA per call so tests that don't care about the
    // no-progress check keep passing — the loop sees commit advance every
    // iteration and never trips the staleness counter.
    mockGetLatestTaskCommit: vi.fn(() => `sha-${Math.random()}`),
    mockCommitGitState: vi.fn(),
    mockWriteTextFile: vi.fn(),
    mockClearDirectory: vi.fn(),
    mockIsBillingEnabled: vi.fn().mockReturnValue(false),
    mockStartTaskRun: vi.fn().mockResolvedValue(null),
    mockUpdateUsage: vi.fn().mockResolvedValue(undefined),
    mockFinalizeTaskRun: vi.fn().mockResolvedValue(undefined),
    mockCanStartTask: vi
      .fn()
      .mockResolvedValue({ allowed: true, remainingMinutes: 60 }),
  }
})

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: mockQuery,
  AbortError: MockAbortError,
}))

vi.mock('@/lib/agents/auth.server', () => ({
  getAuthEnv: vi.fn().mockResolvedValue(undefined),
  clearCredentials: vi.fn().mockResolvedValue(undefined),
  isAuthError: vi.fn().mockReturnValue(false),
}))

vi.mock('@/lib/agents/config.server', () => ({
  discoveryAgentOptions: mockDiscoveryAgentOptions,
  planningAgentOptions: mockPlanningAgentOptions,
  workingAgentOptions: mockWorkingAgentOptions,
}))

vi.mock('@/lib/git/sync.server', () => ({
  syncGitState: vi.fn(),
  commitGitState: mockCommitGitState,
  isTaskCompleted: mockIsTaskCompleted,
  getLatestTaskCommit: mockGetLatestTaskCommit,
  restorePlanFromGit: vi.fn(),
}))

vi.mock('@/lib/fs/write.server', () => ({
  writeTextFile: mockWriteTextFile,
  clearDirectory: mockClearDirectory,
}))

// In-memory fs so writes by writeTextFile become readable by readRunInfo —
// runPlanningIteration depends on this to carry the discovery PhaseRecord
// forward when running after a successful discovery iteration.
const mockFs = new Map<string, string>()
vi.mock('node:fs/promises', () => ({
  default: {
    readFile: vi.fn(async (filePath: string) => {
      if (mockFs.has(filePath)) return mockFs.get(filePath)!
      const err = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException
      err.code = 'ENOENT'
      throw err
    }),
    rm: vi.fn().mockResolvedValue(undefined),
  },
  readFile: vi.fn(async (filePath: string) => {
    if (mockFs.has(filePath)) return mockFs.get(filePath)!
    const err = new Error(`ENOENT: ${filePath}`) as NodeJS.ErrnoException
    err.code = 'ENOENT'
    throw err
  }),
  rm: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/ee/lib/billing/config', () => ({
  isBillingEnabled: mockIsBillingEnabled,
}))

vi.mock('@/ee/lib/billing/usage.server', () => ({
  startTaskRun: mockStartTaskRun,
  updateUsage: mockUpdateUsage,
  finalizeTaskRun: mockFinalizeTaskRun,
}))

vi.mock('@/ee/lib/billing/limits.server', () => ({
  canStartTask: mockCanStartTask,
}))

vi.mock('@/lib/config/config.server', () => ({
  readConfig: mockReadConfig,
}))

// Import after mocks
import {
  _waitForLoop,
  getActiveStream,
  isRunActive,
  startRun,
  stopRun,
} from './loop.server'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an async generator that yields the given messages then returns. */
async function* fakeQuery(messages: Array<{ type: string; [k: string]: any }>) {
  for (const msg of messages) {
    yield msg
  }
}

/**
 * Create a query mock implementation that blocks until the abort signal fires.
 * Reads the AbortController from the options passed through agent config mocks.
 */
function blockingQueryImpl({ options }: { options?: any }) {
  const signal = options?.abortController?.signal as AbortSignal | undefined
  return (async function* () {
    if (!signal) return
    await new Promise<void>((_resolve, reject) => {
      if (signal.aborted) {
        reject(new MockAbortError())
        return
      }
      signal.addEventListener('abort', () => reject(new MockAbortError()), {
        once: true,
      })
    })
  })()
}

/** Parse all .run.json writes to extract the RunInfo objects. */
function getRunInfoWrites() {
  return mockWriteTextFile.mock.calls
    .filter((args) => (args[0] as string).endsWith('.run.json'))
    .map((args) => JSON.parse(args[1] as string))
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockFs.clear()
  mockClearDirectory.mockResolvedValue(undefined)
  // Mirror writeTextFile output into mockFs so subsequent readRunInfo calls
  // (via fs.readFile) can read what was written earlier in the same run.
  mockWriteTextFile.mockImplementation((p: string, c: string) => {
    mockFs.set(p, c)
    return Promise.resolve()
  })
  mockIsTaskCompleted.mockReturnValue(false)
})

afterEach(async () => {
  // Ensure any active run is stopped and cleaned up between tests
  if (isRunActive()) {
    try {
      stopRun()
    } catch {
      /* already stopped */
    }
  }
  // Always await the loop promise to ensure module state is fully cleaned up
  await _waitForLoop()
})

// ---------------------------------------------------------------------------
// startRun
// ---------------------------------------------------------------------------

describe('startRun', () => {
  it('writes initial .run.json with planning status for planning mode', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'planning')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    expect(writes[0]).toMatchObject({
      status: 'planning',
      phases: [],
    })
    expect(writes[0].error).toBeUndefined()
    expect(writes[0].startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('writes initial .run.json with running status for working mode', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    expect(writes[0]).toMatchObject({
      status: 'working',
      phases: [],
    })
    expect(writes[0].error).toBeUndefined()
  })

  it('throws when a run is already active', async () => {
    mockQuery.mockImplementation(blockingQueryImpl)

    await startRun('s1', 't1', 'planning')
    await expect(startRun('s1', 't2', 'working')).rejects.toThrow()
  })

  it('clears working/ and outputs/ directories', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    expect(mockClearDirectory).toHaveBeenCalledWith(
      path.join(taskDir('t1'), 'working'),
    )
    expect(mockClearDirectory).toHaveBeenCalledWith(
      path.join(taskDir('t1'), 'outputs'),
    )
  })
})

// ---------------------------------------------------------------------------
// Discovery mode
// ---------------------------------------------------------------------------

describe('discovery mode', () => {
  it('writes initial .run.json with discovering status for discovery mode', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'discovery')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    expect(writes[0]).toMatchObject({
      status: 'discovering',
      phases: [],
    })
    expect(writes[0].error).toBeUndefined()
  })

  it('auto-transitions to planning when discovery completes without errors', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'discovery')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    // Find the first write where status flips to 'planning'.
    const flipIdx = writes.findIndex((w: any) => w.status === 'planning')
    expect(flipIdx).toBeGreaterThan(0)

    // The flip-to-planning write must include the discovery PhaseRecord.
    const flipWrite = writes[flipIdx]
    expect(
      flipWrite.phases.filter(
        (p: { phase: string }) => p.phase === 'discovery',
      ),
    ).toHaveLength(1)

    // Loop must end at plan_ready (planning ran and finished).
    const terminal = writes[writes.length - 1]
    expect(terminal.status).toBe('plan_ready')
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'discovery'),
    ).toHaveLength(1)
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'planning'),
    ).toHaveLength(1)
  })

  it('commits "Discovery complete" before starting planning', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'discovery')
    await _waitForLoop()

    const messages = mockCommitGitState.mock.calls.map((c) => c[0] as string)
    expect(messages).toContain('[s1/t1] Discovery complete')

    // The commit must happen before any planning iteration starts. The mock
    // for planningAgentOptions records the call order.
    const commitCallOrder = mockCommitGitState.mock.invocationCallOrder
    const planCallOrder = mockPlanningAgentOptions.mock.invocationCallOrder
    const discoveryCommitOrder = mockCommitGitState.mock.calls
      .map((c, i) =>
        c[0] === '[s1/t1] Discovery complete' ? commitCallOrder[i] : null,
      )
      .find((v) => v !== null) as number
    expect(discoveryCommitOrder).toBeLessThan(planCallOrder[0])
  })

  it('skips planning when discovery fails', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        throw new Error('SDK exploded during discovery')
      })(),
    )

    await startRun('s1', 't1', 'discovery')
    await _waitForLoop()

    // Planning must not have been invoked
    expect(mockPlanningAgentOptions).not.toHaveBeenCalled()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'discovery',
      stopReason: 'error',
    })
    expect(terminal.error).toContain('SDK exploded during discovery')
  })

  it('writes stopped/discovery without error when user stops during discovery', async () => {
    mockQuery.mockImplementation(blockingQueryImpl)

    await startRun('s1', 't1', 'discovery')
    // Allow the loop to enter the discovery query
    await new Promise((r) => setTimeout(r, 20))
    stopRun()
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'discovery',
    })
    expect(terminal.error).toBeUndefined()

    // Planning must NOT run after a user-stopped discovery
    expect(mockPlanningAgentOptions).not.toHaveBeenCalled()
  })

  it('writes budget stop with stoppedDuring: discovery when SDK reports max budget', async () => {
    mockQuery.mockImplementation(() =>
      fakeQuery([
        {
          type: 'result',
          subtype: 'error_max_budget_usd',
          total_cost_usd: 1.5,
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: true,
          num_turns: 1,
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          errors: ['Budget exceeded'],
          uuid: 'test-uuid',
          session_id: 'test-session',
        },
      ]),
    )

    // Make remaining budget cap the per-session budget so billingCapped triggers.
    mockCanStartTask.mockResolvedValue({ allowed: true, remainingMinutes: 0.5 })
    mockIsBillingEnabled.mockReturnValue(true)
    mockStartTaskRun.mockResolvedValue('task-run-disco')

    await startRun('s1', 't1', 'discovery', 'user-1')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'discovery',
      stopReason: 'budget',
    })
    expect(mockPlanningAgentOptions).not.toHaveBeenCalled()
  })

  it('appends discovery PhaseRecord with sessionId and durationMs', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'discovery')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    const discoveryPhase = terminal.phases.find(
      (p: { phase: string }) => p.phase === 'discovery',
    )
    expect(discoveryPhase).toBeDefined()
    expect(typeof discoveryPhase.sessionId).toBe('string')
    expect(discoveryPhase.sessionId.length).toBeGreaterThan(0)
    expect(typeof discoveryPhase.durationMs).toBe('number')
  })

  it('billing record spans discovery + planning (single startTaskRun/finalizeTaskRun)', async () => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockStartTaskRun.mockResolvedValue('task-run-spans')
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'discovery', 'user-1')
    await _waitForLoop()

    expect(mockStartTaskRun).toHaveBeenCalledTimes(1)
    expect(mockFinalizeTaskRun).toHaveBeenCalledTimes(1)
    expect(mockFinalizeTaskRun).toHaveBeenCalledWith(
      'task-run-spans',
      'completed',
      expect.any(Number),
      expect.any(Number),
    )
  })
})

// ---------------------------------------------------------------------------
// Planning mode
// ---------------------------------------------------------------------------

describe('planning mode', () => {
  it('writes plan_ready status on successful planning completion', async () => {
    mockQuery.mockReturnValue(
      fakeQuery([{ type: 'assistant', message: { content: 'plan' } }]),
    )

    await startRun('s1', 't1', 'planning')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'plan_ready',
    })
    expect(terminal.error).toBeUndefined()
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'planning'),
    ).toHaveLength(1)
  })

  it('writes stopped with error when planning fails', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        throw new Error('SDK exploded')
      })(),
    )

    await startRun('s1', 't1', 'planning')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      error: 'SDK exploded',
    })
  })

  it('treats stderr-only fast-fail as an error rather than silent plan_ready', async () => {
    // Simulates Claude Code subprocess that writes to stderr (e.g. missing
    // ~/.claude.json) and exits before emitting any SDK message. Without
    // detection, the for-await would complete cleanly and the loop would
    // mark the run plan_ready despite producing no plan — see #216.
    mockQuery.mockImplementation(({ options }: any) => {
      options.stderr?.('Claude configuration file not found\n')
      return fakeQuery([])
    })

    await startRun('s1', 't1', 'planning')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      stoppedDuring: 'planning',
      stopReason: 'error',
    })
    expect(terminal.error).toContain('Claude configuration file not found')
  })

  it('writes stopped without error when user stops during planning', async () => {
    mockQuery.mockImplementation(blockingQueryImpl)

    await startRun('s1', 't1', 'planning')
    // Give the loop time to enter the query iteration
    await new Promise((r) => setTimeout(r, 20))
    stopRun()
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
    })
    expect(terminal.error).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Working mode
// ---------------------------------------------------------------------------

describe('working mode', () => {
  it('iterates until [done] found in git log, then writes completed', async () => {
    let iterationCount = 0
    mockQuery.mockImplementation(() => {
      iterationCount++
      return fakeQuery([
        { type: 'assistant', message: { content: `iter ${iterationCount}` } },
      ])
    })

    mockIsTaskCompleted.mockReturnValueOnce(false).mockReturnValueOnce(true)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'completed',
    })
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'working'),
    ).toHaveLength(2)
  })

  it('stops at MAX_ITERATIONS with error when [done] not found', async () => {
    mockQuery.mockImplementation(() => fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(false)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      error: 'Iteration limit reached',
    })
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'working'),
    ).toHaveLength(3)
  })

  it('continues on iteration errors — fresh context self-heals', async () => {
    let callCount = 0
    mockQuery.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return (async function* () {
          throw new Error('Network failure')
        })()
      }
      return fakeQuery([])
    })

    // [done] found on second iteration (after first fails)
    mockIsTaskCompleted.mockReturnValueOnce(true)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal.status).toBe('completed')
  })

  it('broadcasts iteration_error to subscribers when an iteration throws', async () => {
    mockQuery.mockImplementation(() =>
      (async function* () {
        throw new Error('Context limit exceeded')
      })(),
    )
    // Force the run to stop after the first errored iteration so the test
    // doesn't hang waiting for retries. Same SHA → staleness trips at 2.
    mockGetLatestTaskCommit.mockReturnValue('stuck-sha')
    mockIsTaskCompleted.mockReturnValue(false)

    const stream = (async () => {
      await startRun('s1', 't1', 'working')
      const s = getActiveStream()
      if (!s) throw new Error('no stream')
      return s
    })()
    const events: any[] = []
    const reader = (await stream).getReader()
    const decoder = new TextDecoder()
    const readerDone = (async () => {
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value)
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl)
          buf = buf.slice(nl + 1)
          if (line) events.push(JSON.parse(line))
        }
      }
    })()
    await _waitForLoop()
    // Allow stream to flush + close
    await readerDone.catch(() => {})

    const iterErrors = events.filter((e) => e.type === 'iteration_error')
    expect(iterErrors.length).toBeGreaterThan(0)
    expect(iterErrors[0].message).toContain('Context limit exceeded')
  })

  it('terminal no_progress error includes the last iteration error', async () => {
    mockQuery.mockImplementation(() =>
      (async function* () {
        throw new Error('Context limit exceeded')
      })(),
    )
    mockIsTaskCompleted.mockReturnValue(false)
    mockGetLatestTaskCommit.mockReturnValue('stuck-sha')

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      stopReason: 'no_progress',
    })
    expect(terminal.error).toContain('No progress')
    expect(terminal.error).toContain('Context limit exceeded')
  })

  it('stops with no_progress when agent commits nothing for 2 consecutive iterations', async () => {
    mockQuery.mockImplementation(() => fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(false)
    // Same SHA every call → loop sees no commit advance → staleness trips
    mockGetLatestTaskCommit.mockReturnValue('stuck-sha')

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      stopReason: 'no_progress',
    })
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'working'),
    ).toHaveLength(2)
    expect(terminal.error).toContain('No progress')
  })

  it('does not trip no_progress when agent commits something every iteration', async () => {
    mockQuery.mockImplementation(() => fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(false)
    // Distinct SHAs each call → commit "advances" every iteration → never stale
    let n = 0
    mockGetLatestTaskCommit.mockImplementation(() => `sha-${n++}`)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    // Should hit iteration_limit (maxIterations=3), not no_progress
    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      stopReason: 'iteration_limit',
    })
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'working'),
    ).toHaveLength(3)
  })

  it('continues iterating when isTaskCompleted returns false', async () => {
    mockQuery.mockImplementation(() => fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(false)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    // Should hit MAX_ITERATIONS (3) since [done] never appears
    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
      error: 'Iteration limit reached',
    })
    expect(
      terminal.phases.filter((p: { phase: string }) => p.phase === 'working'),
    ).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// stopRun
// ---------------------------------------------------------------------------

describe('stopRun', () => {
  it('is a no-op when no active run', () => {
    expect(() => stopRun()).not.toThrow()
  })

  it('stops the working loop with status stopped and no error', async () => {
    mockQuery.mockImplementation(blockingQueryImpl)

    await startRun('s1', 't1', 'working')
    await new Promise((r) => setTimeout(r, 20))

    stopRun()
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal).toMatchObject({
      status: 'stopped',
    })
    expect(terminal.error).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Module state cleanup
// ---------------------------------------------------------------------------

describe('module state after run ends', () => {
  it('nulls out abortController and activeStream after normal completion', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(true)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    expect(isRunActive()).toBe(false)
    expect(getActiveStream()).toBeNull()
  })

  it('nulls out state after error', async () => {
    mockQuery.mockReturnValue(
      (async function* () {
        throw new Error('fatal')
      })(),
    )

    await startRun('s1', 't1', 'planning')
    await _waitForLoop()

    expect(isRunActive()).toBe(false)
    expect(getActiveStream()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Stream behavior
// ---------------------------------------------------------------------------

describe('stream', () => {
  it('returns readable stream while run is active', async () => {
    mockQuery.mockImplementation(blockingQueryImpl)

    await startRun('s1', 't1', 'planning')

    const stream = getActiveStream()
    expect(stream).not.toBeNull()
    expect(stream).toBeInstanceOf(ReadableStream)
  })

  it('SDK messages are written to the stream as NDJSON', async () => {
    const assistantMsg = {
      type: 'assistant',
      message: { id: 'msg_1', role: 'assistant', content: [] },
      parent_tool_use_id: null,
      uuid: '1',
      session_id: 's1',
    }
    mockQuery.mockReturnValue(fakeQuery([assistantMsg]))
    mockIsTaskCompleted.mockReturnValue(true)

    await startRun('s1', 't1', 'working')

    const stream = getActiveStream()!
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let output = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      output += decoder.decode(value, { stream: true })
    }

    const lines = output.trim().split('\n')
    const parsed = lines.map((l) => JSON.parse(l))
    expect(parsed.some((e: any) => e.type === 'assistant')).toBe(true)
  })

  it('multiple getActiveStream() calls each receive the same events', async () => {
    const assistantMsg = {
      type: 'assistant',
      message: { id: 'msg_1', role: 'assistant', content: [] },
      parent_tool_use_id: null,
      uuid: '1',
      session_id: 's1',
    }
    mockQuery.mockReturnValue(fakeQuery([assistantMsg]))
    mockIsTaskCompleted.mockReturnValue(true)

    await startRun('s1', 't1', 'working')

    const stream1 = getActiveStream()!
    const stream2 = getActiveStream()!

    async function drain(stream: ReadableStream<Uint8Array>) {
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let output = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        output += decoder.decode(value, { stream: true })
      }
      return output
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l))
    }

    const [events1, events2] = await Promise.all([
      drain(stream1),
      drain(stream2),
    ])

    expect(events1.some((e: any) => e.type === 'assistant')).toBe(true)
    expect(events2.some((e: any) => e.type === 'assistant')).toBe(true)
    expect(events1.length).toBe(events2.length)
  })

  it('each getActiveStream() call returns an independent stream', async () => {
    mockQuery.mockImplementation(blockingQueryImpl)

    await startRun('s1', 't1', 'planning')

    const stream1 = getActiveStream()!
    const stream2 = getActiveStream()!

    // Each call returns a distinct ReadableStream
    expect(stream1).not.toBe(stream2)

    // Cancelling one does not affect the other
    await stream1.cancel()

    // stream2 should still be a valid readable stream
    expect(stream2.locked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// startedAt consistency
// ---------------------------------------------------------------------------

describe('startedAt consistency', () => {
  it('uses the same startedAt timestamp across all .run.json writes', async () => {
    mockQuery.mockImplementation(() => fakeQuery([]))
    mockIsTaskCompleted.mockReturnValueOnce(false).mockReturnValueOnce(true)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const startedAts = writes.map((w: any) => w.startedAt)
    expect(new Set(startedAts).size).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Billing integration
// ---------------------------------------------------------------------------

describe('billing integration', () => {
  const TEST_USER_ID = 'user-123'
  const TEST_TASK_RUN_ID = 'task-run-abc'

  beforeEach(() => {
    mockIsBillingEnabled.mockReturnValue(true)
    mockStartTaskRun.mockResolvedValue(TEST_TASK_RUN_ID)
  })

  it('creates and finalizes a task run when billing is enabled', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(true)

    await startRun('s1', 't1', 'working', TEST_USER_ID)
    await _waitForLoop()

    expect(mockStartTaskRun).toHaveBeenCalledWith(TEST_USER_ID, 's1', 't1')
    expect(mockFinalizeTaskRun).toHaveBeenCalledWith(
      TEST_TASK_RUN_ID,
      'completed',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('finalizes with completed status when planning succeeds (plan_ready)', async () => {
    // Planning's successful terminal state is 'plan_ready', not 'completed'.
    // Without treating plan_ready as a success for billing purposes, every
    // successful planning run would be misclassified as 'aborted'.
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'planning', TEST_USER_ID)
    await _waitForLoop()

    expect(mockFinalizeTaskRun).toHaveBeenCalledWith(
      TEST_TASK_RUN_ID,
      'completed',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('records usage after each working iteration', async () => {
    let callCount = 0
    mockQuery.mockImplementation(() => {
      callCount++
      return fakeQuery([
        { type: 'assistant', message: { content: `iter ${callCount}` } },
      ])
    })

    mockIsTaskCompleted.mockReturnValueOnce(false).mockReturnValueOnce(true)

    await startRun('s1', 't1', 'working', TEST_USER_ID)
    await _waitForLoop()

    // updateUsage called once per iteration (2 iterations)
    expect(mockUpdateUsage).toHaveBeenCalledTimes(2)
    expect(mockUpdateUsage).toHaveBeenCalledWith(
      TEST_TASK_RUN_ID,
      expect.any(Number),
    )
  })

  it('pauses when SDK hits billing budget cap', async () => {
    // Low remaining budget — will be less than the per-session cap
    mockCanStartTask.mockResolvedValue({
      allowed: true,
      remainingMinutes: 0.5,
    })

    // SDK returns error_max_budget_usd result
    mockQuery.mockImplementation(() =>
      fakeQuery([
        {
          type: 'result',
          subtype: 'error_max_budget_usd',
          total_cost_usd: 0.09,
          duration_ms: 1000,
          duration_api_ms: 800,
          is_error: true,
          num_turns: 1,
          stop_reason: null,
          usage: { input_tokens: 0, output_tokens: 0 },
          modelUsage: {},
          permission_denials: [],
          errors: ['Budget exceeded'],
          uuid: 'test-uuid',
          session_id: 'test-session',
        },
      ]),
    )
    mockIsTaskCompleted.mockReturnValue(false)

    await startRun('s1', 't1', 'working', TEST_USER_ID)
    await _waitForLoop()

    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal.status).toBe('stopped')
    expect(terminal.stopReason).toBe('budget')
  })

  it('skips all billing calls when no userId is provided', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(true)

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    expect(mockStartTaskRun).not.toHaveBeenCalled()
    expect(mockUpdateUsage).not.toHaveBeenCalled()
    expect(mockFinalizeTaskRun).not.toHaveBeenCalled()
  })

  it('skips billing calls when isBillingEnabled returns false', async () => {
    mockIsBillingEnabled.mockReturnValue(false)

    mockQuery.mockReturnValue(fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(true)

    await startRun('s1', 't1', 'working', TEST_USER_ID)
    await _waitForLoop()

    expect(mockStartTaskRun).not.toHaveBeenCalled()
  })

  it('finalizes with aborted status when user stops the run', async () => {
    mockQuery.mockImplementation(blockingQueryImpl)

    await startRun('s1', 't1', 'working', TEST_USER_ID)
    await new Promise((r) => setTimeout(r, 20))

    stopRun()
    await _waitForLoop()

    expect(mockFinalizeTaskRun).toHaveBeenCalledWith(
      TEST_TASK_RUN_ID,
      'aborted',
      expect.any(Number),
      expect.any(Number),
    )
  })

  it('continues gracefully when billing module throws', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      mockStartTaskRun.mockRejectedValue(new Error('DB down'))

      mockQuery.mockReturnValue(fakeQuery([]))
      mockIsTaskCompleted.mockReturnValue(true)

      await startRun('s1', 't1', 'working', TEST_USER_ID)
      await _waitForLoop()

      // Run should still complete normally despite billing failure
      const writes = getRunInfoWrites()
      const terminal = writes[writes.length - 1]
      expect(terminal.status).toBe('completed')
    } finally {
      errSpy.mockRestore()
    }
  })
})
