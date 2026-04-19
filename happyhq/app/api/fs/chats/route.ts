import { listAllChats, listChats, streamExists } from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')

  // No name param → return all chats across all streams
  if (!name) {
    try {
      const chats = await listAllChats()
      return Response.json(chats)
    } catch (err) {
      log('api.error', {
        route: '/api/fs/chats',
        status: 500,
        error: err instanceof Error ? err.message : String(err),
      })
      return Response.json({ error: 'Internal server error' }, { status: 500 })
    }
  }

  // With name param → return chats for a specific stream
  try {
    if (!(await streamExists(name))) {
      return Response.json({ error: 'Stream not found' }, { status: 404 })
    }
    const chats = await listChats(name)
    return Response.json(chats)
  } catch (err) {
    log('api.error', {
      route: '/api/fs/chats',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
