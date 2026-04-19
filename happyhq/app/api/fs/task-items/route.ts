import { listAllTaskItems } from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'

export async function GET() {
  try {
    const tasks = await listAllTaskItems()
    return Response.json(tasks)
  } catch (err) {
    log('api.error', {
      route: '/api/fs/task-items',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
