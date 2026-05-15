import type { InstaQLResult } from '@instantdb/core'

import { getAdminDb, id } from '@/lib/database/instant.server'
import type schema from '@/lib/database/schema'

type AppSchema = typeof schema

import { getTierLimits } from './plans'
import type { TaskRunStatus, Usage } from './types'

/**
 * Finds the user's current usage period — the one whose date range covers now.
 * Returns null if no current period exists (e.g. free user with no billing cycle).
 */
export async function getCurrentUsage(userId: string): Promise<Usage | null> {
  const adminDb = getAdminDb()
  const now = Date.now()

  // Fetch usage records and subscriptions in a single query so we don't
  // need a follow-up query when no current usage period exists.
  const result = await adminDb.query({
    usage: { $: { where: { 'user.id': userId } } },
    subscriptions: { $: { where: { 'user.id': userId } } },
  })

  const records = result.usage ?? []

  // Find the period that covers the current time.
  // periodStart/periodEnd are stored as epoch ms via Date.now().
  const current = records.find(
    (u) => Number(u.periodStart) <= now && Number(u.periodEnd) >= now,
  )

  if (!current) {
    // No usage period exists — check if this is a free user and create one lazily.
    // Paid users get usage periods via the invoice.paid webhook; free users never
    // go through Stripe, so we bootstrap their first period here.
    const activeSub = result.subscriptions?.find(
      (s) => s.status === 'active' || s.status === 'past_due',
    )

    // If the user has an active subscription, they're a paid user whose
    // invoice.paid webhook hasn't fired yet — don't create a free period.
    if (activeSub) return null

    const limits = getTierLimits('free')
    const usageId = id()
    const periodStart = now
    const periodEnd = now + 30 * 24 * 60 * 60 * 1000 // 30 days

    await adminDb.transact([
      adminDb.tx.usage[usageId].update({
        periodStart,
        periodEnd,
        usedMinutes: 0,
        includedMinutes: limits.runtimeMinutes,
      }),
      adminDb.tx.usage[usageId].link({ user: userId }),
    ])

    return {
      id: usageId,
      periodStart,
      periodEnd,
      usedMinutes: 0,
      includedMinutes: limits.runtimeMinutes,
    }
  }

  return {
    id: current.id,
    periodStart: current.periodStart as number,
    periodEnd: current.periodEnd as number,
    usedMinutes: current.usedMinutes as number,
    includedMinutes: current.includedMinutes as number,
  }
}

/**
 * Creates a task run record for the user. Always links to the user; links to
 * the current usage period when one exists. When no usage period covers now
 * (e.g. a paid user whose renewal webhook dropped), the task run is still
 * recorded as an orphan — discoverable via the user link, summable later by
 * reconciliation. Returns the task run ID, or null only on hard failures.
 */
export async function startTaskRun(
  userId: string,
  stream: string,
  task: string,
): Promise<string | null> {
  const usage = await getCurrentUsage(userId)
  const adminDb = getAdminDb()
  const taskRunId = id()

  const txs = [
    adminDb.tx.taskRuns[taskRunId].update({
      stream,
      task,
      startedAt: Date.now(),
      minutes: 0,
      status: 'running',
    }),
    adminDb.tx.taskRuns[taskRunId].link({ user: userId }),
  ]
  if (usage) {
    txs.push(adminDb.tx.taskRuns[taskRunId].link({ usagePeriod: usage.id }))
  } else {
    console.warn(
      `usage_anomaly: startTaskRun for user ${userId} with no covering usage period — task run ${taskRunId} recorded as orphan`,
    )
  }

  await adminDb.transact(txs)
  return taskRunId
}

/**
 * Adds elapsed minutes to the task run's own minute counter.
 * Called after each working iteration to track cumulative runtime.
 *
 * Unlike the previous approach, this does NOT update usedMinutes on the
 * usage period directly — that's recomputed from the sum of all task runs
 * in finalizeTaskRun(). This eliminates a race condition where two concurrent
 * runs could read the same usedMinutes and lose an increment.
 */
export async function updateUsage(
  taskRunId: string,
  elapsedMinutes: number,
): Promise<void> {
  const adminDb = getAdminDb()

  const result = await adminDb.query({
    taskRuns: { $: { where: { id: taskRunId } } },
  })
  const taskRun = result.taskRuns?.[0]
  if (!taskRun) {
    console.error(`updateUsage: Task run ${taskRunId} not found`)
    return
  }

  const currentMinutes = (taskRun.minutes as number) ?? 0
  await adminDb.transact(
    adminDb.tx.taskRuns[taskRunId].update({
      minutes: currentMinutes + elapsedMinutes,
    }),
  )
}

/**
 * Finalizes a task run with the given status and total duration.
 * Called when a run ends (completed, stopped, aborted, or failed).
 *
 * After writing the task run's final state, recomputes and caches the
 * total usedMinutes on the usage period from the sum of all linked task runs.
 * This keeps the client-side denormalized counter accurate.
 */
export async function finalizeTaskRun(
  taskRunId: string,
  status: TaskRunStatus,
  totalMinutes: number,
  costUsd?: number,
): Promise<void> {
  const adminDb = getAdminDb()

  await adminDb.transact(
    adminDb.tx.taskRuns[taskRunId].update({
      endedAt: Date.now(),
      minutes: totalMinutes,
      costUsd: costUsd ?? 0,
      status,
    }),
  )

  // Recompute usedMinutes on the usage period from the authoritative sum
  // of all linked task runs. This keeps the client-side cache accurate.
  const runResult = (await adminDb.query({
    taskRuns: {
      $: { where: { id: taskRunId } },
      usagePeriod: {},
    },
  })) as InstaQLResult<AppSchema, { taskRuns: { usagePeriod: {} } }>
  const usagePeriods = runResult.taskRuns?.[0]?.usagePeriod
  const usagePeriod = Array.isArray(usagePeriods)
    ? usagePeriods[0]
    : usagePeriods
  if (usagePeriod) {
    const allRunsResult = await adminDb.query({
      taskRuns: { $: { where: { 'usagePeriod.id': usagePeriod.id } } },
    })
    const totalUsed =
      allRunsResult.taskRuns?.reduce(
        (sum, r) => sum + ((r.minutes as number) ?? 0),
        0,
      ) ?? 0
    await adminDb.transact(
      adminDb.tx.usage[usagePeriod.id].update({ usedMinutes: totalUsed }),
    )
  }
}
