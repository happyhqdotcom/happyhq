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
  mockPlanningAgentOptions,
  mockWorkingAgentOptions,
  mockIsTaskCompleted,
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
  planningAgentOptions: mockPlanningAgentOptions,
  workingAgentOptions: mockWorkingAgentOptions,
}))

vi.mock('@/lib/git/sync.server', () => ({
  syncGitState: vi.fn(),
  commitGitState: vi.fn(),
  isTaskCompleted: mockIsTaskCompleted,
}))

vi.mock('@/lib/fs/write.server', () => ({
  writeTextFile: mockWriteTextFile,
  clearDirectory: mockClearDirectory,
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
  mockClearDirectory.mockResolvedValue(undefined)
  mockWriteTextFile.mockResolvedValue(undefined)
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
      iteration: 0,
      error: null,
    })
    expect(writes[0].startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('writes initial .run.json with running status for working mode', async () => {
    mockQuery.mockReturnValue(fakeQuery([]))

    await startRun('s1', 't1', 'working')
    await _waitForLoop()

    const writes = getRunInfoWrites()
    expect(writes[0]).toMatchObject({
      status: 'working',
      iteration: 0,
      error: null,
    })
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
      iteration: 0,
      error: null,
    })
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
      iteration: 0,
      error: 'SDK exploded',
    })
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
      error: null,
    })
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
      iteration: 2,
    })
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
      iteration: 3,
      error: 'Iteration limit reached',
    })
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
      iteration: 3,
      error: 'Iteration limit reached',
    })
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
      error: null,
    })
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
    mockStartTaskRun.mockRejectedValue(new Error('DB down'))

    mockQuery.mockReturnValue(fakeQuery([]))
    mockIsTaskCompleted.mockReturnValue(true)

    await startRun('s1', 't1', 'working', TEST_USER_ID)
    await _waitForLoop()

    // Run should still complete normally despite billing failure
    const writes = getRunInfoWrites()
    const terminal = writes[writes.length - 1]
    expect(terminal.status).toBe('completed')
  })
})
