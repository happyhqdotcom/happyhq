import {
  allowConfirmation,
  denyConfirmation,
} from '@/lib/chat/pending-confirmations'
import { denyPending, submitAnswer } from '@/lib/chat/pending-questions'

export async function POST(request: Request) {
  let body: {
    sessionId?: string
    toolUseId?: string
    answers?: Record<string, string>
    deny?: boolean
    allow?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { sessionId, toolUseId, deny, allow } = body
  if (!sessionId) {
    return Response.json({ error: 'Missing sessionId' }, { status: 400 })
  }

  // User allowed a pending confirmation (keyed by toolUseId)
  if (allow) {
    if (!toolUseId) {
      return Response.json({ error: 'Missing toolUseId' }, { status: 400 })
    }
    const found = allowConfirmation(toolUseId)
    if (!found) {
      return Response.json(
        { error: 'No pending confirmation for this tool call' },
        { status: 404 },
      )
    }
    return Response.json({ ok: true })
  }

  // User dismissed — try pending question first, then pending confirmation
  if (deny) {
    const deniedQuestion = denyPending(sessionId)
    if (deniedQuestion) return Response.json({ ok: true })

    if (toolUseId) {
      const deniedConfirmation = denyConfirmation(toolUseId)
      if (deniedConfirmation) return Response.json({ ok: true })
    }

    return Response.json(
      { error: 'No pending question or confirmation for this session' },
      { status: 404 },
    )
  }

  const { answers } = body
  if (!answers) {
    return Response.json({ error: 'Missing answers' }, { status: 400 })
  }

  const resolved = submitAnswer(sessionId, answers)
  if (!resolved) {
    return Response.json(
      { error: 'No pending question for this session' },
      { status: 404 },
    )
  }

  return Response.json({ ok: true })
}
