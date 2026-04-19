import { readTaskContent } from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const task = searchParams.get('task')

  if (!task) {
    return Response.json({ error: 'Missing task parameter' }, { status: 400 })
  }

  try {
    const content = await readTaskContent(task)
    if (!content) {
      return Response.json({ error: 'Task not found' }, { status: 404 })
    }
    return Response.json(content)
  } catch (error) {
    log('api.error', {
      route: '/api/fs/task',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
