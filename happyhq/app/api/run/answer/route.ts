import { submitAnswer } from '@/lib/chat/pending-questions'
import { getActiveDiscoverySessionId } from '@/lib/run/loop.server'

// Resolves the pending AskUserQuestion promise for the active discovery session.
// v0 looks up the sessionId from module-level state (single active run per process).
// The body shape stays additive — v1 concurrency adds a `task` field without
// breaking this endpoint.
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { answers } = body as { answers?: unknown }
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return Response.json(
      { error: 'Missing or invalid answers' },
      { status: 400 },
    )
  }

  for (const value of Object.values(answers)) {
    if (typeof value !== 'string') {
      return Response.json({ error: 'Invalid answer value' }, { status: 400 })
    }
  }

  const sessionId = getActiveDiscoverySessionId()
  if (!sessionId) {
    return Response.json({ error: 'No pending question' }, { status: 404 })
  }

  const resolved = submitAnswer(sessionId, answers as Record<string, string>)
  if (!resolved) {
    return Response.json({ error: 'No pending question' }, { status: 404 })
  }

  return Response.json({ status: 'answered' })
}
