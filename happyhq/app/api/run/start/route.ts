import path from 'path'

import { taskPath } from '@/lib/fs/paths'
import { readTaskContent } from '@/lib/fs/read.server'
import type { RunInfo } from '@/lib/fs/types'
import { writeTextFile } from '@/lib/fs/write.server'
import { commitGitState } from '@/lib/git/sync.server'
import { log } from '@/lib/log.server'
import { startRun } from '@/lib/run/loop.server'

export async function POST(request: Request) {
  let body: {
    stream?: string
    task: string
    mode: 'planning' | 'working'
    resume?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { stream, task, mode } = body
  if (!task || (mode !== 'planning' && mode !== 'working')) {
    return Response.json(
      { error: 'Missing or invalid fields' },
      { status: 400 },
    )
  }
  if (!stream) {
    return Response.json(
      { error: 'Task must be assigned to a stream before running' },
      { status: 400 },
    )
  }

  // Verify task directory exists on filesystem (always root)
  const content = await readTaskContent(task)
  if (!content) {
    return Response.json({ error: 'Task not found' }, { status: 404 })
  }

  // When billing is enabled, resolve the user identity so the run loop
  // can track usage, and enforce runtime limits before starting.
  // The client passes user.refresh_token as a Bearer token, verified
  // server-side via adminDb.auth.verifyToken() (InstantDB recommended pattern).
  let userId: string | undefined
  let billingWarning: string | undefined
  let remainingMinutes: number | undefined
  try {
    const { isBillingEnabled } = await import('@/ee/lib/billing/config')
    if (isBillingEnabled()) {
      const authHeader = request.headers.get('authorization')
      const token = authHeader?.startsWith('Bearer ')
        ? authHeader.slice(7)
        : undefined
      if (token) {
        const { verifyToken } = await import('@/lib/accounts/auth.server')
        const verified = await verifyToken(token)
        userId = verified?.id
        if (verified) {
          const { isEmailAllowed } = await import('@/lib/accounts/config')
          if (!isEmailAllowed(verified.email)) {
            return Response.json(
              { error: 'This instance is restricted' },
              { status: 403 },
            )
          }
        }
      }

      // Pre-run limit check: block if runtime is exhausted.
      // When blocking a working start (plan was approved), record the approval
      // and transition to stopped (budget) so the user isn't asked to approve again.
      if (userId) {
        const { canStartTask } = await import('@/ee/lib/billing/limits.server')
        const result = await canStartTask(userId)
        if (!result.allowed) {
          if (mode === 'working' && content.run?.status !== 'stopped') {
            const prefix = stream ? `${stream}/` : ''
            commitGitState(`[${prefix}${task}] Plan accepted`)
            const now = new Date().toISOString()
            const runInfo: RunInfo = {
              status: 'stopped',
              stoppedDuring: 'working',
              stopReason: 'budget',
              iteration: 0,
              startedAt: now,
              lastIterationAt: now,
              error: null,
              costUsd: content.run?.costUsd ?? 0,
              planningCostUsd: content.run?.planningCostUsd ?? null,
              iterations: content.run?.iterations ?? [],
              planningSessionId: content.run?.planningSessionId,
              workingSessionIds: [],
            }
            await writeTextFile(
              path.join(taskPath(task), '.run.json'),
              JSON.stringify(runInfo, null, 2),
            )
          }
          return Response.json(
            { error: 'Runtime limit reached', upgrade: true },
            { status: 403 },
          )
        }
        if (result.warning === 'low_balance') {
          billingWarning = 'low_balance'
          remainingMinutes = result.remainingMinutes
        }
      }
    }
  } catch {
    // Billing module not available — proceed without userId
  }

  try {
    await startRun(stream ?? '', task, mode, userId, body.resume)
  } catch (error) {
    if (error instanceof Error && error.message.includes('already active')) {
      return Response.json({ error: error.message }, { status: 409 })
    }
    const errMsg = error instanceof Error ? error.message : 'Internal error'
    log('api.error', {
      route: '/api/run/start',
      status: 500,
      error: errMsg,
      task,
      stream,
      mode,
    })
    return Response.json({ error: errMsg }, { status: 500 })
  }

  // Commit plan.md on approval — planning agent no longer commits it, so this
  // is the semantic record that a human reviewed and accepted this specific plan.
  // Placed after startRun so a failed start (409) doesn't create a stale commit.
  // Skip when resuming from stopped — plan was already accepted.
  if (mode === 'working' && content.run?.status !== 'stopped') {
    const prefix = stream ? `${stream}/` : ''
    commitGitState(`[${prefix}${task}] Plan accepted`)
  }

  return Response.json({
    status: mode === 'planning' ? 'planning' : 'working',
    ...(billingWarning && { warning: billingWarning, remainingMinutes }),
  })
}
