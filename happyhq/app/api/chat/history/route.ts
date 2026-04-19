import { loadChatHistory } from '@/lib/chat/load-history.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const session = searchParams.get('session')

  if (!session) {
    return Response.json(
      { error: 'Missing session parameter' },
      { status: 400 },
    )
  }

  // Reject path separators to prevent directory traversal
  if (
    session.includes('/') ||
    session.includes('\\') ||
    session.includes('..')
  ) {
    return Response.json({ error: 'Invalid session ID' }, { status: 400 })
  }

  try {
    const data = await loadChatHistory(session)
    return Response.json(data)
  } catch (err) {
    log('api.error', {
      route: '/api/chat/history',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
