import { resetGitHistory } from '@/lib/git/reset.server'
import { log } from '@/lib/log.server'

export async function POST() {
  try {
    resetGitHistory()
    return Response.json({ success: true })
  } catch (err) {
    log('api.error', {
      route: '/api/git/reset',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
