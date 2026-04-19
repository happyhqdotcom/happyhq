import { readStreams } from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'

export async function GET() {
  try {
    const streams = await readStreams()
    return Response.json(streams)
  } catch (error) {
    log('api.error', {
      route: '/api/fs/streams',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
