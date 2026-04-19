import { abortSession } from '@/lib/chat/active-sessions'

export async function POST(request: Request) {
  let body: { sessionId?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId } = body
  if (!sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  const aborted = abortSession(sessionId)
  if (!aborted) {
    return Response.json({ error: 'No active session' }, { status: 404 })
  }

  return Response.json({ status: 'stopping' })
}
