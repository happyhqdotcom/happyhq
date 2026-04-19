import { getActiveStream } from '@/lib/run/loop.server'

export async function GET() {
  const stream = getActiveStream()

  if (!stream) {
    return Response.json({ error: 'No active run' }, { status: 404 })
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson',
      'Cache-Control': 'no-cache',
      'Transfer-Encoding': 'chunked',
    },
  })
}
