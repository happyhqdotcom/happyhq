import { setChatMode } from '@/lib/actions'
import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { log } from '@/lib/log.server'
import path from 'path'

interface ModeRequest {
  streamSlug?: string
  sessionId: string
  mode: 'general' | 'learning'
  modeStreamSlug?: string
}

/**
 * POST /api/chat/mode — persist a chat mode change.
 *
 * Called fire-and-forget from the client when the user toggles
 * the composer mode toggle. Writes mode to chat.json so it
 * survives page reload.
 */
export async function POST(request: Request) {
  let body: ModeRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { streamSlug, sessionId, mode, modeStreamSlug } = body
  if (!sessionId || (mode !== 'general' && mode !== 'learning')) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)

  try {
    await setChatMode(chatDir, mode, modeStreamSlug)
    return Response.json({ ok: true })
  } catch (err) {
    log('api.error', {
      route: '/api/chat/mode',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Failed to save chat mode' }, { status: 500 })
  }
}
