import { query } from '@anthropic-ai/claude-agent-sdk'
import path from 'path'

import {
  clearCredentials,
  getAuthEnv,
  isAuthError,
} from '@/lib/agents/auth.server'
import { chatAgentOptions } from '@/lib/agents/config.server'
import { buildReminders } from '@/lib/agents/reminders.server'
import { StderrBuffer } from '@/lib/agents/stderr-buffer.server'
import { clearSession, registerSession } from '@/lib/chat/active-sessions'
import { clearSessionMode, setSessionMode } from '@/lib/chat/session-mode'
import type { ChatRequest, ChatStreamEvent } from '@/lib/chat/types'
import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { assertSafeSessionId, assertSafeStreamName } from '@/lib/fs/paths'
import { streamExists } from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'
import { encodeEvent, filterMessage } from '@/lib/run/filter.server'

export async function POST(request: Request) {
  let body: ChatRequest
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { message, sessionId, streamSlug, resume, taskSlug } = body
  if (typeof message !== 'string' || !sessionId) {
    return Response.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    assertSafeSessionId(sessionId)
  } catch {
    return Response.json({ error: 'Invalid sessionId' }, { status: 400 })
  }

  try {
    if (streamSlug) assertSafeStreamName(streamSlug)
    if (body.modeStreamSlug) assertSafeStreamName(body.modeStreamSlug)
  } catch {
    return Response.json({ error: 'Invalid stream slug' }, { status: 400 })
  }

  // Stream validation only when streamSlug is provided
  if (streamSlug && !(await streamExists(streamSlug))) {
    return Response.json({ error: 'Stream not found' }, { status: 404 })
  }

  // --- Mode determination ---
  // Client is authoritative for mode. It maintains mode via loadHistory (reads
  // chat.json), mode_changed events (from EnterLearningMode/ExitLearningMode),
  // and user toggle (updates store + persists via /api/chat/mode).
  // modeStreamSlug identifies the stream for learning mode — may differ from
  // streamSlug when a stream-less chat enters learning mode mid-conversation.
  const mode: 'general' | 'learning' = body.mode ?? 'general'
  let modeStreamSlug: string | null = body.modeStreamSlug ?? streamSlug ?? null

  setSessionMode(sessionId, mode, modeStreamSlug ?? undefined)

  // Resolve the effective stream slug for agent options
  const effectiveStreamSlug = modeStreamSlug ?? streamSlug ?? null

  // All chats live at root — streamSlug is metadata, not a path component
  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)

  const abortController = registerSession(sessionId)

  let streamController: ReadableStreamDefaultController<Uint8Array>

  const notifyClient = (event: ChatStreamEvent) => {
    streamController?.enqueue(encodeEvent(event))
  }

  const env = await getAuthEnv()

  const stream = new ReadableStream({
    async start(controller) {
      streamController = controller
      const stderrBuf = new StderrBuffer()

      try {
        if (abortController.signal.aborted) return

        // --- Agent options (systemPrompt is always general.md) ---
        const options = await chatAgentOptions({
          mode,
          streamSlug: effectiveStreamSlug,
          sessionId,
          resume,
          abortController,
          notifyClient,
          env,
          taskSlug,
          chatDir,
        })
        options.stderr = stderrBuf.write

        // --- Compose prompt: inject mode-appropriate context ---
        const reminders = await buildReminders({
          mode,
          streamSlug: effectiveStreamSlug,
          sessionId,
          taskSlug,
          message,
        })
        const reminderBlock =
          reminders.length > 0
            ? reminders
                .map((r) => `<system-reminder>\n${r}\n</system-reminder>`)
                .join('\n') + '\n'
            : ''
        const prompt = reminderBlock + message

        const sdkQuery = query({ prompt, options })

        for await (const msg of sdkQuery) {
          const event = filterMessage(msg)
          if (event) {
            if (
              event.type === 'result' &&
              event.subtype !== 'success' &&
              stderrBuf.getLines().length > 0
            ) {
              console.error('[Q:stderr]', stderrBuf.getLines().join('\n'))
            }
            controller.enqueue(encodeEvent(event))
          }
        }
      } catch (err) {
        if (!abortController.signal.aborted) {
          if (stderrBuf.getLines().length > 0) {
            console.error('[Q:stderr]', stderrBuf.getLines().join('\n'))
          }
          const message = err instanceof Error ? err.message : String(err)
          log('api.error', { route: '/api/chat', status: 500, error: message })
          if (isAuthError(err)) {
            await clearCredentials()
            const event: ChatStreamEvent = { type: 'auth_error', message }
            controller.enqueue(encodeEvent(event))
          } else {
            const event: ChatStreamEvent = { type: 'error', message }
            controller.enqueue(encodeEvent(event))
          }
        }
      } finally {
        clearSession(sessionId)
        clearSessionMode(sessionId)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}
