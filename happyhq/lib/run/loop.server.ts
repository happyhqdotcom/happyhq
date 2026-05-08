import type {
  SDKMessage,
  SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk'
import { query } from '@anthropic-ai/claude-agent-sdk'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  clearCredentials,
  getAuthEnv,
  isAuthError,
} from '@/lib/agents/auth.server'
import {
  planningAgentOptions,
  workingAgentOptions,
} from '@/lib/agents/config.server'
import { StderrBuffer } from '@/lib/agents/stderr-buffer.server'
import { readConfig } from '@/lib/config/config.server'
import { resolveConfig } from '@/lib/config/defaults'
import { LLM_COST_PER_MINUTE_USD } from '@/lib/constants'
import {
  assertSafeStreamName,
  assertSafeTaskSlug,
  taskPath,
} from '@/lib/fs/paths'
import { parseRunInfo } from '@/lib/fs/read.server'
import { updateTaskMdPending } from '@/lib/fs/task-md.server'
import type {
  PendingType,
  PhaseRecord,
  PhaseTokenMetrics,
  RunInfo,
} from '@/lib/fs/types'
import { clearDirectory, writeTextFile } from '@/lib/fs/write.server'
import {
  commitGitState,
  getLatestTaskCommit,
  isTaskCompleted,
  restorePlanFromGit,
} from '@/lib/git/sync.server'

import type { ChatStreamEvent } from '@/lib/chat/types'

import { log } from '@/lib/log.server'

import { encodeEvent, filterMessage } from './filter.server'

// ---------------------------------------------------------------------------
// Module-level state — one run at a time
//
// Stored on globalThis so the same state is shared across all Next.js route
// bundles in dev mode. Without this, /api/run/start and /api/run/stream get
// separate module instances and can't see each other's state.
// ---------------------------------------------------------------------------

interface RunLoopState {
  abortController: AbortController | null
  subscribers: Set<WritableStreamDefaultWriter<Uint8Array>>
  streamActive: boolean
  loopPromise: Promise<void> | null
  starting: boolean
  activeRunStream: string | null
  activeRunTask: string | null
  heartbeatInterval: ReturnType<typeof setInterval> | null
  selfPingInterval: ReturnType<typeof setInterval> | null
}

const STATE_KEY = Symbol.for('__happyhq_run_loop_state__')

function getState(): RunLoopState {
  const g = globalThis as unknown as Record<symbol, RunLoopState | undefined>
  if (!g[STATE_KEY]) {
    g[STATE_KEY] = {
      abortController: null,
      subscribers: new Set(),
      streamActive: false,
      loopPromise: null,
      starting: false,
      activeRunStream: null,
      activeRunTask: null,
      heartbeatInterval: null,
      selfPingInterval: null,
    }
  }
  return g[STATE_KEY]
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Start a new planning or working run for the given task.
 *
 * - Clears working/ and outputs/ (fresh-run model).
 * - Writes initial .run.json.
 * - Launches the loop as a detached async function.
 * - Returns immediately.
 *
 * Throws if a run is already active (caller returns 409).
 */
export async function startRun(
  streamName: string,
  taskName: string,
  mode: 'planning' | 'working',
  userId?: string,
  resume?: boolean,
): Promise<void> {
  // Regex barriers on the original taint sources — every fs op below
  // (taskPath/clearDirectory/fs.rm/writeRunInfo/readRunInfo) flows through
  // these names. Asserting at the entry point is what CodeQL recognises
  // as a `js/path-injection` sanitiser barrier.
  assertSafeStreamName(streamName)
  assertSafeTaskSlug(taskName)
  const s = getState()

  // If a previous run was aborted but the loop hasn't finished cleaning up,
  // wait for it (with a timeout) instead of rejecting immediately.
  if (s.abortController?.signal.aborted && s.loopPromise) {
    await Promise.race([
      s.loopPromise,
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ])
  }

  if (s.abortController !== null || s.starting) {
    const detail = s.activeRunStream
      ? ` (${s.activeRunStream}/${s.activeRunTask})`
      : ''
    throw new Error(`Run already active${detail}`)
  }
  // Set synchronous flag before any async work to prevent TOCTOU race
  // between concurrent POST /api/run/start requests.
  s.starting = true

  try {
    // Preserve run data before clearDirectory wipes state.
    // Read for working mode (carries planning cost forward) and for resume
    // (preserves iteration/cost data from the stopped run).
    const existingRun =
      mode === 'working' || resume ? await readRunInfo(taskName) : null
    const startedAt = new Date().toISOString()

    s.abortController = new AbortController()
    s.streamActive = true
    s.subscribers = new Set()
    s.activeRunStream = streamName
    s.activeRunTask = taskName
    startKeepalives(s)

    // Defer heavy work (commitGitState shells out to git synchronously) with
    // setImmediate so the HTTP response is sent before we block the event loop.
    s.loopPromise = new Promise<void>((resolve) => {
      setImmediate(() => {
        ;(async () => {
          try {
            // TODO: Turning off syncGitState while we harden the git layer
            // with more discrete interactions. Will consider turning back on
            // if there are gaps left from this work.
            // syncGitState()

            const isResume =
              existingRun?.status === 'stopped' &&
              existingRun.stoppedDuring === mode &&
              (existingRun.stopReason === 'budget' || resume)

            if (isResume) {
              // Resume from stop: preserve working dir, outputs, and plan.md
              // (partial plan preserved for planning resume).
              await writeRunInfo(taskName, {
                ...existingRun,
                status: mode,
                stoppedDuring: undefined,
                stopReason: undefined,
                lastIterationAt: startedAt,
                error: undefined,
              })
            } else {
              // Fresh-run cleanup — no-op on first run from createTask()
              const taskDir = taskPath(taskName)
              await Promise.all([
                clearDirectory(path.join(taskDir, 'working')),
                clearDirectory(path.join(taskDir, 'outputs')),
                // Clear old plan and progress when re-planning so the agent starts fresh
                ...(mode === 'planning'
                  ? [fs.rm(path.join(taskDir, 'plan.md'), { force: true })]
                  : []),
              ])

              // Restore plan.md to the version the user originally approved.
              // Q mutates plan.md during working (progress tracking), so on
              // restart-from-plan we reset it to the "Plan accepted" snapshot.
              if (mode === 'working') {
                restorePlanFromGit(taskName)
              }

              // Commit the cleared state so the git log shows a restart boundary.
              // No-op on first run (nothing to clear = clean tree = no commit).
              const restartMsg =
                mode === 'planning'
                  ? `[${streamName}/${taskName}] Task restarted from scratch`
                  : `[${streamName}/${taskName}] Task restarted from plan`
              commitGitState(restartMsg)

              // Write .run.json AFTER the restart commit so it doesn't dirty
              // the tree and cause a false "Task restarted" on first run.
              await writeRunInfo(taskName, {
                status: mode === 'planning' ? 'planning' : 'working',
                startedAt,
                lastIterationAt: startedAt,
                costUsd: existingRun?.costUsd ?? 0,
                phases: existingRun?.phases ?? [],
              })
            }
          } catch (err) {
            // If setup fails before runLoop(), clean up state so we don't
            // permanently block future runs.
            console.error('[Q:run] Setup error before loop:', err)
            stopKeepalives(s)
            for (const writer of s.subscribers) {
              writer.close().catch(() => {})
            }
            s.subscribers.clear()
            s.streamActive = false
            s.abortController = null
            s.activeRunStream = null
            s.activeRunTask = null
            return
          }

          log('run.started', { task: taskName, stream: streamName, mode })
          await runLoop(streamName, taskName, mode, startedAt, userId)
        })().then(resolve, resolve)
      })
    })
  } finally {
    s.starting = false
  }
}

/**
 * Stop the active run immediately via AbortController.abort().
 * The loop catches the abort, writes final state, and cleans up.
 *
 * Throws if no run is active (caller returns 404).
 */
export function stopRun(): void {
  const s = getState()
  if (!s.abortController) {
    return // Already stopped or never started — no-op
  }
  s.abortController.abort()
}

/**
 * Get a readable stream for the active run, or null if no run.
 * Each call creates a new independent subscriber stream (fan-out pattern)
 * so multiple clients or reconnecting clients each get their own reader.
 */
export function getActiveStream(): ReadableStream<Uint8Array> | null {
  const s = getState()
  if (!s.streamActive) {
    return null
  }
  const ts = new TransformStream<Uint8Array, Uint8Array>()
  s.subscribers.add(ts.writable.getWriter())
  return ts.readable
}

/**
 * Check whether a run is currently active (module-level state, not .run.json).
 */
export function isRunActive(): boolean {
  return getState().abortController !== null
}

/**
 * Clear a stale .run.json that says 'running'/'planning' but has no
 * corresponding server-side process (e.g. after HMR killed the loop).
 */
export async function clearStaleRun(taskName: string): Promise<void> {
  assertSafeTaskSlug(taskName)
  const info = await readRunInfo(taskName)
  if (!info) return
  const stoppedDuring: RunInfo['stoppedDuring'] =
    info.status === 'discovering'
      ? 'discovery'
      : info.status === 'planning'
        ? 'planning'
        : info.status === 'working'
          ? 'working'
          : info.stoppedDuring
  // Clear pendingQuestions when flipping a leftover discovering run — otherwise
  // a stopped run with pendingQuestions still set would render the question UI.
  await writeRunInfo(taskName, {
    ...info,
    status: 'stopped',
    stoppedDuring,
    stopReason: 'error',
    error: 'Run lost (server restarted)',
    pendingQuestions: undefined,
  })
}

/**
 * Get info about the currently active run, or null if no run is active.
 * Used by the /api/run/active endpoint so the chat view can show busy state.
 */
export function getActiveRunInfo(): {
  stream: string
  task: string
} | null {
  const s = getState()
  if (s.activeRunStream && s.activeRunTask) {
    return { stream: s.activeRunStream, task: s.activeRunTask }
  }
  return null
}

/**
 * Wait for the detached loop promise to settle. Test-only — allows tests to
 * reliably await loop completion instead of polling isRunActive().
 */
export function _waitForLoop(): Promise<void> {
  return getState().loopPromise ?? Promise.resolve()
}

// ---------------------------------------------------------------------------
// Loop orchestration
// ---------------------------------------------------------------------------

async function runLoop(
  streamName: string,
  taskName: string,
  mode: 'planning' | 'working',
  startedAt: string,
  userId?: string,
): Promise<void> {
  const s = getState()
  const ac = s.abortController! // guaranteed non-null by startRun
  const env = await getAuthEnv()

  // Billing: start a task run record if billing is enabled and user is known
  let taskRunId: string | null = null
  if (userId) {
    try {
      const { isBillingEnabled } = await import('@/ee/lib/billing/config')
      if (isBillingEnabled()) {
        const { startTaskRun } = await import('@/ee/lib/billing/usage.server')
        taskRunId = await startTaskRun(userId, streamName, taskName)
      }
    } catch (err) {
      console.error('[Q:billing] Failed to start task run:', err)
    }
  }

  // Billing: compute remaining budget so the SDK can stop at the right point.
  // Converts remaining minutes to USD using the fixed cost rate.
  let remainingBudgetUsd: number | undefined
  if (userId) {
    try {
      const { canStartTask } = await import('@/ee/lib/billing/limits.server')
      const result = await canStartTask(userId)
      if (result.allowed && result.remainingMinutes != null) {
        remainingBudgetUsd = result.remainingMinutes * LLM_COST_PER_MINUTE_USD
      }
    } catch {
      // Billing unavailable — no cap
    }
  }

  // Track final run status for billing finalization
  let finalStatus: RunInfo['status'] = 'stopped'

  try {
    if (mode === 'planning') {
      finalStatus = await runPlanningIteration(
        streamName,
        taskName,
        ac.signal,
        startedAt,
        env,
        remainingBudgetUsd,
      )

      // Billing: record planning LLM cost
      if (taskRunId) {
        try {
          const { updateUsage } = await import('@/ee/lib/billing/usage.server')
          const planRun = await readRunInfo(taskName)
          const planCost =
            planRun?.phases?.find((p) => p.phase === 'planning')?.costUsd ?? 0
          const planCostMinutes = planCost / LLM_COST_PER_MINUTE_USD
          await updateUsage(taskRunId, planCostMinutes)
        } catch (err) {
          console.error('[Q:billing] Planning usage update failed:', err)
        }
      }
    } else {
      finalStatus = await runWorkingLoop(
        streamName,
        taskName,
        ac.signal,
        startedAt,
        env,
        userId,
        taskRunId,
        remainingBudgetUsd,
      )
    }
  } finally {
    // Billing: finalize the task run record
    if (taskRunId) {
      try {
        const { finalizeTaskRun } =
          await import('@/ee/lib/billing/usage.server')
        // Successful terminal states differ by mode: working ends at
        // 'completed' (agent emitted [done]), planning ends at 'plan_ready'.
        // Everything else (user stop, error, budget, iteration limit) is an
        // abort. Without this, every successful planning run was classified
        // as 'aborted' in billing, skewing dashboards.
        const successful =
          finalStatus === 'completed' || finalStatus === 'plan_ready'
        const billingStatus = successful
          ? ('completed' as const)
          : ('aborted' as const)
        // Read final cost from .run.json to get accurate total including planning
        const finalRun = await readRunInfo(taskName)
        const finalCostUsd = finalRun?.costUsd ?? 0
        const finalCostMinutes = finalCostUsd / LLM_COST_PER_MINUTE_USD
        await finalizeTaskRun(
          taskRunId,
          billingStatus,
          finalCostMinutes,
          finalCostUsd,
        )
      } catch (err) {
        console.error('[Q:billing] Failed to finalize task run:', err)
      }
    }

    stopKeepalives(s)
    // Close all subscriber streams (fire-and-forget)
    for (const writer of s.subscribers) {
      writer.close().catch(() => {})
    }
    s.subscribers.clear()
    s.streamActive = false
    s.abortController = null
    s.activeRunStream = null
    s.activeRunTask = null
  }
}

// ---------------------------------------------------------------------------
// Planning — single iteration
// ---------------------------------------------------------------------------

async function runPlanningIteration(
  streamName: string,
  taskName: string,
  parentSignal: AbortSignal,
  startedAt: string,
  env?: Record<string, string | undefined>,
  remainingBudgetUsd?: number,
): Promise<RunInfo['status']> {
  const planningSessionId = crypto.randomUUID()
  const { controller: iterController, cleanup } =
    createIterationController(parentSignal)

  const stderrBuf = new StderrBuffer()
  const iterStartMs = Date.now()
  let iterationCost = 0
  let peakInputTokens = 0
  let tokenMetrics: Partial<PhaseTokenMetrics> = {}
  let receivedAnyMessage = false

  try {
    const notifyClient = (event: ChatStreamEvent) => {
      broadcast(encodeEvent(event))
    }
    const options = await planningAgentOptions(
      streamName,
      taskName,
      iterController,
      {
        env,
        notifyClient,
        sessionId: planningSessionId,
      },
    )
    // Cap the per-session budget with remaining billing budget
    const billingCapped =
      remainingBudgetUsd != null &&
      options.maxBudgetUsd != null &&
      remainingBudgetUsd < options.maxBudgetUsd
    if (billingCapped) {
      options.maxBudgetUsd = remainingBudgetUsd
    }

    options.stderr = stderrBuf.write
    const sdkQuery = query({ prompt: 'Begin.', options })

    let resultSubtype: string | undefined
    for await (const msg of sdkQuery) {
      if (parentSignal.aborted) throw new Error('Aborted')
      receivedAnyMessage = true
      peakInputTokens = trackPeakInputTokens(msg, peakInputTokens)
      const event = filterMessage(msg)
      if (event) {
        broadcast(encodeEvent(event))
        if (event.type === 'result') {
          iterationCost = event.costUsd
          resultSubtype = event.subtype
          tokenMetrics = extractTokenMetrics(
            msg as SDKResultMessage,
            peakInputTokens,
          )
        }
      }
    }

    // Silent fast-fail: subprocess exited before emitting any SDK message
    // (e.g. missing ~/.claude.json, startup auth failure). Without this, the
    // loop falls through to plan_ready below despite producing nothing.
    if (!receivedAnyMessage && stderrBuf.getLines().length > 0) {
      throw new Error('Agent exited before producing any output')
    }

    const planningPhase: PhaseRecord = {
      phase: 'planning',
      sessionId: planningSessionId,
      costUsd: iterationCost,
      durationMs: Date.now() - iterStartMs,
      ...tokenMetrics,
    }

    // Carry forward any prior phases (e.g. discovery) when appending planning.
    const priorPhases = (await readRunInfo(taskName))?.phases ?? []

    // Billing budget hit during planning — stop with budget reason
    if (billingCapped && resultSubtype === 'error_max_budget_usd') {
      await writeRunInfo(taskName, {
        status: 'stopped',
        stoppedDuring: 'planning',
        stopReason: 'budget',
        startedAt,
        lastIterationAt: new Date().toISOString(),
        costUsd: iterationCost,
        phases: [...priorPhases, planningPhase],
      })
      log('run.stopped', {
        task: taskName,
        stream: streamName,
        mode: 'planning',
        session: planningSessionId,
        reason: 'budget',
        cost: iterationCost,
      })
      return 'stopped'
    }

    // Success: planning agent finished — write terminal status so the
    // client knows it's safe to show the approve dialog.
    await writeRunInfo(taskName, {
      status: 'plan_ready',
      startedAt,
      lastIterationAt: new Date().toISOString(),
      costUsd: iterationCost,
      phases: [...priorPhases, planningPhase],
    })
    log('run.completed', {
      task: taskName,
      stream: streamName,
      mode: 'planning',
      session: planningSessionId,
      cost: iterationCost,
      duration_ms: Date.now() - iterStartMs,
    })
    return 'plan_ready'
  } catch (error) {
    cleanup()

    if (stderrBuf.getLines().length > 0) {
      console.error('[Q:stderr:planning]', stderrBuf.getLines().join('\n'))
    }

    const planningPhase: PhaseRecord = {
      phase: 'planning',
      sessionId: planningSessionId,
      costUsd: iterationCost,
      durationMs: Date.now() - iterStartMs,
      ...tokenMetrics,
    }
    const priorPhases = (await readRunInfo(taskName))?.phases ?? []

    if (parentSignal.aborted) {
      // User clicked Stop during planning
      await writeRunInfo(taskName, {
        status: 'stopped',
        stoppedDuring: 'planning',
        stopReason: 'user',
        startedAt,
        lastIterationAt: new Date().toISOString(),
        costUsd: iterationCost,
        phases: [...priorPhases, planningPhase],
      })
      log('run.stopped', {
        task: taskName,
        stream: streamName,
        mode: 'planning',
        session: planningSessionId,
        reason: 'user',
        cost: iterationCost,
      })
      return 'stopped'
    }

    // Auth error — clear stored key so user gets redirected to /setup
    if (isAuthError(error)) {
      await clearCredentials()
    }

    const errMsg = error instanceof Error ? error.message : String(error)
    const stderrTail = stderrBuf.getTail()
    // Planning failed — write stopped with error and broadcast an error event
    // so the UI surfaces a toast. Without the broadcast, fast-fail subprocess
    // exits (e.g. missing config, startup auth) ended the run silently.
    await writeRunInfo(taskName, {
      status: 'stopped',
      stoppedDuring: 'planning',
      stopReason: 'error',
      startedAt,
      lastIterationAt: new Date().toISOString(),
      error: stderrTail ? `${errMsg}\n\nstderr:\n${stderrTail}` : errMsg,
      costUsd: iterationCost,
      phases: [...priorPhases, planningPhase],
    })
    broadcastErrorEvent(error, stderrTail)
    log('run.error', {
      task: taskName,
      stream: streamName,
      mode: 'planning',
      session: planningSessionId,
      error: errMsg,
      stderr: stderrTail || undefined,
      cost: iterationCost,
    })
    return 'stopped'
  } finally {
    cleanup()
  }
}

// ---------------------------------------------------------------------------
// Working — multi-iteration loop with [done] completion detection
// ---------------------------------------------------------------------------

async function runWorkingLoop(
  streamName: string,
  taskName: string,
  parentSignal: AbortSignal,
  startedAt: string,
  env?: Record<string, string | undefined>,
  userId?: string,
  taskRunId?: string | null,
  remainingBudgetUsd?: number,
): Promise<RunInfo['status']> {
  const config = resolveConfig(await readConfig())
  const maxIterations = config.limits.maxIterations

  // Seed cost accumulators from existing .run.json (carries planning + prior
  // working phases forward). Phases are append-only, so we copy and grow.
  const existingRun = await readRunInfo(taskName)
  let totalCost = existingRun?.costUsd ?? 0
  const phases: PhaseRecord[] = [...(existingRun?.phases ?? [])]
  const planningCostUsd =
    phases.find((p) => p.phase === 'planning')?.costUsd ?? 0

  // Track cost-based minutes for billing (planning cost + working iterations)
  let totalCostMinutes = planningCostUsd / LLM_COST_PER_MINUTE_USD

  // Track only cost accrued in THIS loop invocation for budget calculation.
  // remainingBudgetUsd (from canStartTask) already accounts for historical spend,
  // so we must not subtract it again via totalCost which includes prior iterations.
  let currentLoopWorkingCost = 0

  // Resume from pause: start from the next iteration after where we stopped.
  // Each iteration is independent (fresh SDK session, reads filesystem state).
  // Derive iteration count from the phases array — last working PhaseRecord
  // wins (working iterations are 1-based and append-only).
  const priorWorkingCount = phases.filter((p) => p.phase === 'working').length
  const startIteration =
    existingRun?.status === 'working' && priorWorkingCount > 0
      ? priorWorkingCount + 1
      : 1

  // No-progress detection. The working prompt mandates a `git commit` per
  // iteration. If the latest commit touching tasks/<task>/ doesn't advance for
  // NO_PROGRESS_LIMIT consecutive iterations, the agent is stuck (e.g. plan
  // already complete but `[done]` not emitted, or persistently confused).
  // Stop early with a `no_progress` reason so the user sees a diagnosable
  // failure instead of burning to maxIterations with `iteration_limit`.
  //
  // Threshold of 2 tolerates a single iteration that errored before commit
  // ("fresh context self-heals"), but catches the actual stuck pattern.
  const NO_PROGRESS_LIMIT = 2
  let lastTaskCommit = getLatestTaskCommit(taskName)
  let staleIterations = 0

  for (
    let iteration = startIteration;
    iteration <= maxIterations;
    iteration++
  ) {
    // Check parent abort before starting a new iteration
    if (parentSignal.aborted) {
      await writeRunInfo(taskName, {
        status: 'stopped',
        stoppedDuring: 'working',
        stopReason: 'user',
        startedAt,
        lastIterationAt: new Date().toISOString(),
        costUsd: totalCost,
        phases,
      })
      log('run.stopped', {
        task: taskName,
        stream: streamName,
        mode: 'working',
        reason: 'user',
        iteration: iteration - 1,
        cost: totalCost,
      })
      return 'stopped'
    }

    const iterSessionId = crypto.randomUUID()
    const { controller: iterController, cleanup } =
      createIterationController(parentSignal)

    const stderrBuf = new StderrBuffer()
    const iterStartMs = Date.now()
    let iterationCost = 0
    let peakInputTokens = 0
    let tokenMetrics: Partial<PhaseTokenMetrics> = {}
    let billingCapped = false
    let resultSubtype: string | undefined
    let receivedAnyMessage = false

    try {
      const notifyClient = (event: ChatStreamEvent) => {
        broadcast(encodeEvent(event))
      }
      const options = await workingAgentOptions(
        streamName,
        taskName,
        iterController,
        { env, notifyClient, sessionId: iterSessionId },
      )
      // Cap the per-iteration budget with remaining billing budget.
      // Only subtract cost accrued in this loop invocation — remainingBudgetUsd
      // (from canStartTask) already accounts for all historical spend.
      const iterRemainingBudget =
        remainingBudgetUsd != null
          ? remainingBudgetUsd - currentLoopWorkingCost
          : undefined
      billingCapped =
        iterRemainingBudget != null &&
        options.maxBudgetUsd != null &&
        iterRemainingBudget < options.maxBudgetUsd
      if (billingCapped && iterRemainingBudget != null) {
        options.maxBudgetUsd = Math.max(0, iterRemainingBudget)
      }

      options.stderr = stderrBuf.write
      const sdkQuery = query({ prompt: 'Begin.', options })
      for await (const msg of sdkQuery) {
        if (parentSignal.aborted) throw new Error('Aborted')
        receivedAnyMessage = true
        peakInputTokens = trackPeakInputTokens(msg, peakInputTokens)
        const event = filterMessage(msg)
        if (event) {
          broadcast(encodeEvent(event))
          if (event.type === 'result') {
            iterationCost = event.costUsd
            resultSubtype = event.subtype
            tokenMetrics = extractTokenMetrics(
              msg as SDKResultMessage,
              peakInputTokens,
            )
          }
        }
      }

      // Silent fast-fail: subprocess exited before emitting any SDK message.
      // Throw into the catch path so the iteration is treated as errored
      // (and the user sees a toast) rather than continuing as a silent no-op.
      if (!receivedAnyMessage && stderrBuf.getLines().length > 0) {
        throw new Error('Agent exited before producing any output')
      }
    } catch (error) {
      cleanup()

      if (stderrBuf.getLines().length > 0) {
        console.error('[Q:stderr:working]', stderrBuf.getLines().join('\n'))
      }

      totalCost += iterationCost
      currentLoopWorkingCost += iterationCost
      const iterDurationMs = Date.now() - iterStartMs
      phases.push({
        phase: 'working',
        iteration,
        sessionId: iterSessionId,
        costUsd: iterationCost,
        durationMs: iterDurationMs,
        ...tokenMetrics,
      })

      // Billing: update usage with this iteration's LLM cost
      if (taskRunId) {
        try {
          const { updateUsage } = await import('@/ee/lib/billing/usage.server')
          const iterCostMinutes = iterationCost / LLM_COST_PER_MINUTE_USD
          totalCostMinutes += iterCostMinutes
          await updateUsage(taskRunId, iterCostMinutes)
        } catch (err) {
          console.error('[Q:billing] Usage update failed:', err)
        }
      }

      if (parentSignal.aborted) {
        // User clicked Stop
        await writeRunInfo(taskName, {
          status: 'stopped',
          stoppedDuring: 'working',
          stopReason: 'user',
          startedAt,
          lastIterationAt: new Date().toISOString(),
          costUsd: totalCost,
          phases,
        })
        log('run.stopped', {
          task: taskName,
          stream: streamName,
          mode: 'working',
          session: iterSessionId,
          reason: 'user',
          iteration,
          cost: totalCost,
        })
        return 'stopped'
      }

      // Auth error — clear stored key and stop (retrying won't help)
      if (isAuthError(error)) {
        await clearCredentials()
        const errMsg = error instanceof Error ? error.message : String(error)
        const stderrTail = stderrBuf.getTail()
        await writeRunInfo(taskName, {
          status: 'stopped',
          stoppedDuring: 'working',
          stopReason: 'error',
          startedAt,
          lastIterationAt: new Date().toISOString(),
          error: stderrTail ? `${errMsg}\n\nstderr:\n${stderrTail}` : errMsg,
          costUsd: totalCost,
          phases,
        })
        broadcastErrorEvent(error, stderrTail)
        log('run.error', {
          task: taskName,
          stream: streamName,
          mode: 'working',
          session: iterSessionId,
          iteration,
          error: errMsg,
          stderr: stderrTail || undefined,
          cost: totalCost,
        })
        return 'stopped'
      }

      // Iteration timeout or other error — continue to next iteration.
      // "Fresh context self-heals problems."
      //
      // Transient (non-terminal) iteration errors stay in the runtime log
      // (`run.iteration` below) and are not toasted. The toast surface is
      // reserved for terminal errors that flip `.run.json` to `stopped` —
      // those are picked up by the client's SWR-observed terminal-error
      // toast in useTaskData (see #227). Surfacing transient stderr-fails
      // on top would create a second timing-sensitive surface for very
      // little user value (the run continues; the next iteration usually
      // self-heals).
      const iterErrMsg = error instanceof Error ? error.message : String(error)
      const iterStderrTail = stderrBuf.getTail()
      await writeRunInfo(taskName, {
        status: 'working',
        startedAt,
        lastIterationAt: new Date().toISOString(),
        costUsd: totalCost,
        phases,
      })
      log('run.iteration', {
        task: taskName,
        iteration,
        session: iterSessionId,
        cost: iterationCost,
        duration_ms: Date.now() - iterStartMs,
        error: iterErrMsg,
        stderr: iterStderrTail || undefined,
      })

      // No-progress check applies to errored iterations too — if the agent
      // crashed before committing two iterations running, that's still stuck.
      {
        const currentCommit = getLatestTaskCommit(taskName)
        if (currentCommit === lastTaskCommit) {
          staleIterations++
        } else {
          staleIterations = 0
          lastTaskCommit = currentCommit
        }
        if (staleIterations >= NO_PROGRESS_LIMIT) {
          await writeRunInfo(taskName, {
            status: 'stopped',
            stoppedDuring: 'working',
            stopReason: 'no_progress',
            startedAt,
            lastIterationAt: new Date().toISOString(),
            error: `No progress: agent committed no work for ${NO_PROGRESS_LIMIT} consecutive iterations`,
            costUsd: totalCost,
            phases,
          })
          log('run.stopped', {
            task: taskName,
            stream: streamName,
            mode: 'working',
            reason: 'no_progress',
            iteration,
            cost: totalCost,
          })
          return 'stopped'
        }
      }
      continue
    } finally {
      cleanup()
    }

    totalCost += iterationCost
    currentLoopWorkingCost += iterationCost
    const iterDurationMs = Date.now() - iterStartMs
    phases.push({
      phase: 'working',
      iteration,
      sessionId: iterSessionId,
      costUsd: iterationCost,
      durationMs: iterDurationMs,
      ...tokenMetrics,
    })

    // Billing: update usage with this iteration's LLM cost
    if (taskRunId) {
      try {
        const { updateUsage } = await import('@/ee/lib/billing/usage.server')
        const iterCostMinutes = iterationCost / LLM_COST_PER_MINUTE_USD
        totalCostMinutes += iterCostMinutes
        await updateUsage(taskRunId, iterCostMinutes)
      } catch (err) {
        console.error('[Q:billing] Usage update failed:', err)
      }
    }

    // Billing budget hit during this iteration — stop with budget reason
    if (billingCapped && resultSubtype === 'error_max_budget_usd') {
      await writeRunInfo(taskName, {
        status: 'stopped',
        stoppedDuring: 'working',
        stopReason: 'budget',
        startedAt,
        lastIterationAt: new Date().toISOString(),
        costUsd: totalCost,
        phases,
      })
      log('run.stopped', {
        task: taskName,
        stream: streamName,
        mode: 'working',
        reason: 'budget',
        iteration,
        cost: totalCost,
      })
      return 'stopped'
    }

    // Iteration completed normally. Update .run.json.
    await writeRunInfo(taskName, {
      status: 'working',
      startedAt,
      lastIterationAt: new Date().toISOString(),
      costUsd: totalCost,
      phases,
    })
    log('run.iteration', {
      task: taskName,
      iteration,
      session: iterSessionId,
      cost: iterationCost,
      duration_ms: iterDurationMs,
    })

    // Check for [done] in the latest commit touching this task. [done] wins
    // over the no-progress check below: if the agent's final commit declares
    // completion, honor it even if the same commit makes this iteration
    // technically "stale" relative to the previous one.
    if (isTaskCompleted(taskName)) {
      await writeRunInfo(taskName, {
        status: 'completed',
        startedAt,
        lastIterationAt: new Date().toISOString(),
        costUsd: totalCost,
        phases,
      })
      log('run.completed', {
        task: taskName,
        stream: streamName,
        mode: 'working',
        cost: totalCost,
        iterations: iteration,
        duration_ms: Date.now() - new Date(startedAt).getTime(),
      })
      return 'completed'
    }

    // No-progress check: did this iteration advance the head of git log for
    // tasks/<task>/? Agents that aren't committing any work (plan exhausted,
    // confused, or stuck in a no-op loop) get caught here before burning
    // through maxIterations.
    {
      const currentCommit = getLatestTaskCommit(taskName)
      if (currentCommit === lastTaskCommit) {
        staleIterations++
      } else {
        staleIterations = 0
        lastTaskCommit = currentCommit
      }
      if (staleIterations >= NO_PROGRESS_LIMIT) {
        await writeRunInfo(taskName, {
          status: 'stopped',
          stoppedDuring: 'working',
          stopReason: 'no_progress',
          startedAt,
          lastIterationAt: new Date().toISOString(),
          error: `No progress: agent committed no work for ${NO_PROGRESS_LIMIT} consecutive iterations`,
          costUsd: totalCost,
          phases,
        })
        log('run.stopped', {
          task: taskName,
          stream: streamName,
          mode: 'working',
          reason: 'no_progress',
          iteration,
          cost: totalCost,
        })
        return 'stopped'
      }
    }
  }

  // Hit maxIterations without [done]
  await writeRunInfo(taskName, {
    status: 'stopped',
    stoppedDuring: 'working',
    stopReason: 'iteration_limit',
    startedAt,
    lastIterationAt: new Date().toISOString(),
    error: 'Iteration limit reached',
    costUsd: totalCost,
    phases,
  })
  log('run.stopped', {
    task: taskName,
    stream: streamName,
    mode: 'working',
    reason: 'iteration_limit',
    iteration: maxIterations,
    cost: totalCost,
  })
  return 'stopped'
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Push an error toast to subscribers. Runs are background work, so even
 * auth-shaped failures emit a plain `error` (toast only) — the chat path
 * handles its own `auth_error` → redirect when the user is foreground.
 */
function broadcastErrorEvent(error: unknown, stderrTail: string): void {
  const message =
    error instanceof Error ? error.message : String(error || 'Run failed')
  const composed = stderrTail ? `${message}\n\n${stderrTail}` : message
  const event: ChatStreamEvent = { type: 'error', message: composed }
  broadcast(encodeEvent(event))
}

/**
 * Broadcast a chunk to all subscriber streams — fire-and-forget.
 *
 * Each subscriber is a WritableStreamDefaultWriter for an independent
 * TransformStream created per GET /api/run/stream request. Failed writes
 * (client disconnected, backpressure) remove the dead subscriber so future
 * broadcasts skip it. Events may be dropped under backpressure, which is
 * acceptable because the stream is a liveness signal, not a durable log.
 */
function broadcast(chunk: Uint8Array): void {
  const s = getState()

  for (const writer of s.subscribers) {
    writer.write(chunk).catch(() => {
      // Client disconnected — remove dead subscriber
      writer.close().catch(() => {})
      s.subscribers.delete(writer)
    })
  }
}

const HEARTBEAT_INTERVAL_MS = 20_000
const SELF_PING_INTERVAL_MS = 30_000

// Keeps bytes flowing to watching clients and traffic arriving at the machine
// so the edge proxy's idle-timeout and autostop-idle timers don't fire during
// long silent phases of a run (extended thinking, long tool calls). Without
// these, a run in progress looks idle to the platform and the machine can be
// stopped out from under it.
function startKeepalives(s: RunLoopState): void {
  s.heartbeatInterval = setInterval(() => {
    if (s.subscribers.size === 0) return
    broadcast(encodeEvent({ type: 'heartbeat', t: new Date().toISOString() }))
  }, HEARTBEAT_INTERVAL_MS)

  const appName = process.env.FLY_APP_NAME
  if (appName) {
    const pingUrl = `https://${appName}.fly.dev/api/health`
    s.selfPingInterval = setInterval(() => {
      fetch(pingUrl).catch(() => {})
    }, SELF_PING_INTERVAL_MS)
  }
}

function stopKeepalives(s: RunLoopState): void {
  if (s.heartbeatInterval) {
    clearInterval(s.heartbeatInterval)
    s.heartbeatInterval = null
  }
  if (s.selfPingInterval) {
    clearInterval(s.selfPingInterval)
    s.selfPingInterval = null
  }
}

/**
 * Create a child AbortController that aborts when the parent signal fires
 * (user clicked Stop). No timeout — maxBudgetUsd is the cost backstop.
 */
function createIterationController(parentSignal: AbortSignal): {
  controller: AbortController
  cleanup: () => void
} {
  const controller = new AbortController()

  // Parent already aborted before we created the child
  if (parentSignal.aborted) {
    controller.abort(parentSignal.reason)
    return { controller, cleanup: () => {} }
  }

  const onParentAbort = () => controller.abort(parentSignal.reason)
  parentSignal.addEventListener('abort', onParentAbort, { once: true })

  const cleanup = () => {
    parentSignal.removeEventListener('abort', onParentAbort)
  }

  return { controller, cleanup }
}

async function readRunInfo(taskName: string): Promise<RunInfo | null> {
  assertSafeTaskSlug(taskName)
  try {
    const raw = await fs.readFile(
      path.join(taskPath(taskName), '.run.json'),
      'utf-8',
    )
    return parseRunInfo(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Track peak input tokens from individual API calls via message_start events.
 * Each message_start carries usage for a single API call, giving us the actual
 * context window fill level (vs modelUsage which aggregates across all calls).
 */
function trackPeakInputTokens(msg: SDKMessage, current: number): number {
  if (msg.type !== 'stream_event' || msg.event.type !== 'message_start') {
    return current
  }
  const usage = (msg.event as any).message?.usage
  if (!usage) return current
  const callInputTokens =
    (usage.input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0)
  return Math.max(current, callInputTokens)
}

/**
 * Extract token usage metrics from an SDK result message.
 * Sums across all models and computes context window utilization percentage
 * using the peak single-call input tokens (not the aggregate).
 */
function extractTokenMetrics(
  msg: SDKResultMessage,
  peakInputTokens: number,
): Pick<
  PhaseTokenMetrics,
  | 'inputTokens'
  | 'outputTokens'
  | 'cacheReadInputTokens'
  | 'cacheCreationInputTokens'
  | 'contextWindow'
  | 'contextWindowUsedPct'
> {
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadInputTokens = 0
  let cacheCreationInputTokens = 0
  let contextWindow = 0

  for (const usage of Object.values(msg.modelUsage)) {
    inputTokens += usage.inputTokens
    outputTokens += usage.outputTokens
    cacheReadInputTokens += usage.cacheReadInputTokens
    cacheCreationInputTokens += usage.cacheCreationInputTokens
    contextWindow = Math.max(contextWindow, usage.contextWindow)
  }

  return {
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheCreationInputTokens,
    contextWindow: contextWindow || undefined,
    contextWindowUsedPct:
      contextWindow > 0 && peakInputTokens > 0
        ? Math.round((peakInputTokens / contextWindow) * 1000) / 10
        : undefined,
  }
}

async function writeRunInfo(taskName: string, info: RunInfo): Promise<void> {
  assertSafeTaskSlug(taskName)
  const runPath = path.join(taskPath(taskName), '.run.json')
  await writeTextFile(runPath, JSON.stringify(info, null, 2))
  // Sync task.md status if it exists (best-effort)
  await syncTaskMdFromRun(taskName, info).catch(() => {})
}

/** Sync the pending field in task.md based on the current run state. */
async function syncTaskMdFromRun(
  taskName: string,
  run: RunInfo,
): Promise<void> {
  const pending: PendingType | undefined =
    run.status === 'plan_ready'
      ? 'approval'
      : run.status === 'completed'
        ? 'review'
        : run.status === 'stopped' && run.stopReason === 'budget'
          ? 'checkpoint'
          : undefined

  await updateTaskMdPending(taskPath(taskName), pending)
}
