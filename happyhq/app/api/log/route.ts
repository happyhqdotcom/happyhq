import { log } from '@/lib/log.server'

const MAX_STACK_LENGTH = 5_000

/**
 * Client-side error reporting endpoint.
 *
 * Accepts { event, data? } and writes to the server log via log().
 * Events must be prefixed with "client." to namespace them from server events.
 * Always returns 204 — logging must never fail the caller.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    if (
      typeof body !== 'object' ||
      body === null ||
      typeof body.event !== 'string'
    ) {
      return new Response(null, { status: 204 })
    }

    const event: string = body.event.startsWith('client.')
      ? body.event
      : `client.${body.event}`

    const data: Record<string, unknown> = body.data ?? {}

    // Cap long stack traces to prevent log bloat
    if (
      typeof data.stack === 'string' &&
      data.stack.length > MAX_STACK_LENGTH
    ) {
      data.stack = data.stack.slice(0, MAX_STACK_LENGTH) + '…[truncated]'
    }

    log(event, data)
  } catch {
    // Swallow — logging endpoint must never fail
  }

  return new Response(null, { status: 204 })
}
