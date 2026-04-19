import { getGitStatus } from '@/lib/git/status.server'
import { log } from '@/lib/log.server'

export async function GET() {
  try {
    const files = getGitStatus()
    return Response.json(files)
  } catch (err) {
    log('api.error', {
      route: '/api/git/status',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
