import { readStreamContent, streamExists } from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const name = searchParams.get('name')
  if (!name) {
    return Response.json({ error: 'Missing name parameter' }, { status: 400 })
  }
  try {
    if (!(await streamExists(name))) {
      return Response.json({ error: 'Stream not found' }, { status: 404 })
    }
    const content = await readStreamContent(name)
    return Response.json(content)
  } catch (error) {
    log('api.error', {
      route: '/api/fs/stream',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
