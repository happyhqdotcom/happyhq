import { setChatName } from '@/lib/actions'
import { assertSafeSessionId } from '@/lib/fs/paths'
import { log } from '@/lib/log.server'

interface NameRequest {
  sessionId: string
  name: string
}

/**
 * POST /api/chat/name — persist a chat session name.
 *
 * Accepts a pre-computed name (derived client-side from the first message)
 * and writes it to chat.json via setChatName. Called fire-and-forget from
 * the client after the first message is sent.
 */
export async function POST(request: Request) {
  let body: NameRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId, name } = body
  if (!sessionId || !name) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    assertSafeSessionId(sessionId)
  } catch {
    return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
  }

  try {
    await setChatName(sessionId, name)
    return Response.json({ ok: true })
  } catch (err) {
    log('api.error', {
      route: '/api/chat/name',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Failed to save chat name' }, { status: 500 })
  }
}
