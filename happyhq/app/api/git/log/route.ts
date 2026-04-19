import { getGitLog } from '@/lib/git/log.server'
import { log } from '@/lib/log.server'

/** Build a grep pattern from stream/task slugs. */
function buildGrepPattern(
  stream: string | null,
  task: string | null,
): string | undefined {
  if (stream && task) return `^\\[${stream}/${task}\\]`
  if (stream) return `^\\[${stream}\\] `
  return undefined
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') ?? '50', 10)
    const stream = searchParams.get('stream')
    const task = searchParams.get('task')
    const grep = buildGrepPattern(stream, task)
    const entries = getGitLog(limit, grep)
    return Response.json(entries)
  } catch (err) {
    log('api.error', {
      route: '/api/git/log',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
