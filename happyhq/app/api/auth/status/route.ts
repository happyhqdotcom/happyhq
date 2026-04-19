import { checkAuthStatus } from '@/lib/agents/auth.server'
import { log } from '@/lib/log.server'

export async function GET() {
  try {
    const status = await checkAuthStatus()
    return Response.json({
      ...status,
      deployed: !!process.env.Q_PASSWORD,
    })
  } catch (error) {
    log('api.error', {
      route: '/api/auth/status',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    )
  }
}
