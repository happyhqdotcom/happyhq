import { exchangeOAuthCode } from '@/lib/auth/oauth.server'
import { log } from '@/lib/log.server'

export async function POST(request: Request) {
  let sessionId: string | undefined
  let code: string | undefined

  try {
    const body = await request.json()
    sessionId = body.sessionId
    code = body.code
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!sessionId || !code) {
    return Response.json(
      { error: 'sessionId and code are required' },
      { status: 400 },
    )
  }

  try {
    const result = await exchangeOAuthCode(code, sessionId)
    if (result.ok) {
      return Response.json({ success: true })
    }
    const { status, ...body } = result
    return Response.json(body, { status })
  } catch (error) {
    log('api.error', {
      route: '/api/auth/login/code',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      {
        error: 'OAuth exchange failed',
        detail: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}
