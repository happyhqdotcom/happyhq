import { assembleDebugBundle } from '@/lib/chat/assemble-debug-bundle.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stream = searchParams.get('stream') // nullable — chats may not have a stream
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
    const bundle = await assembleDebugBundle(stream, session)
    const json = JSON.stringify(bundle, null, 2)
    const fileName = `debug-${stream ?? 'root'}-${session.slice(0, 8)}.json`

    return new Response(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(Buffer.byteLength(json)),
      },
    })
  } catch (err) {
    log('api.error', {
      route: '/api/chat/debug-bundle',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
