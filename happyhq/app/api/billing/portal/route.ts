import { createPortalSession } from '@/ee/lib/billing/portal.server'
import { requireAuth } from '@/lib/accounts/auth.server'
import { log } from '@/lib/log.server'

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { userId } = auth

  try {
    const url = await createPortalSession(userId)
    return Response.json({ url })
  } catch (error) {
    log('api.error', {
      route: '/api/billing/portal',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Portal failed' },
      { status: 500 },
    )
  }
}
