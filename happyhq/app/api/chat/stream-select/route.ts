import { setChatSelectedStream } from '@/lib/actions'
import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { log } from '@/lib/log.server'
import path from 'path'

interface StreamSelectRequest {
  sessionId: string
  /** The stream the user selected (null = "something new"). */
  selectedStreamSlug: string | null
}

/**
 * POST /api/chat/stream-select — persist a mid-chat stream selection.
 *
 * Called fire-and-forget from the client when the user picks a different
 * stream in the composer's StreamContextSelector.
 */
export async function POST(request: Request) {
  let body: StreamSelectRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId, selectedStreamSlug } = body
  if (!sessionId) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)

  try {
    await setChatSelectedStream(chatDir, selectedStreamSlug)
    return Response.json({ ok: true })
  } catch (err) {
    log('api.error', {
      route: '/api/chat/stream-select',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json(
      { error: 'Failed to save stream selection' },
      { status: 500 },
    )
  }
}
