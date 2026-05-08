import { assertSafeTaskSlug } from '@/lib/fs/paths'
import { readTaskContent } from '@/lib/fs/read.server'
import {
  clearStaleRun,
  getActiveRunInfo,
  isRunActive,
  stopRun,
} from '@/lib/run/loop.server'

export async function POST(request: Request) {
  // Accept optional stream/task to validate we're stopping the right run
  let stream: string | undefined
  let task: string | undefined
  try {
    const body = await request.json()
    stream = body.stream
    task = body.task
  } catch {
    // Empty body is fine — backwards-compatible with no-param calls
  }

  // Regex barrier on the original user-supplied task slug, when provided —
  // see /api/run/start for the rationale.
  if (task !== undefined) {
    try {
      assertSafeTaskSlug(task)
    } catch {
      return Response.json({ error: 'Invalid task slug' }, { status: 400 })
    }
  }

  if (stream && task) {
    const active = getActiveRunInfo()
    if (active && (active.stream !== stream || active.task !== task)) {
      return Response.json(
        {
          error: `Active run belongs to ${active.stream}/${active.task}, not ${stream}/${task}`,
        },
        { status: 409 },
      )
    }
  }

  if (isRunActive()) {
    stopRun()
    return Response.json({ status: 'stopping' })
  }

  // No server-side run — if .run.json still says active, it's stale
  // (e.g. HMR killed the process). Clear it so the UI recovers.
  if (task) {
    const content = await readTaskContent(task)
    const status = content?.run?.status
    if (
      status === 'discovering' ||
      status === 'working' ||
      status === 'planning'
    ) {
      await clearStaleRun(task)
      return Response.json({ status: 'cleared_stale' })
    }
  }

  return Response.json({ status: 'no_run' })
}
