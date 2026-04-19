import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { listDirectory } from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const dirPath = searchParams.get('path')
  if (!dirPath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 })
  }
  try {
    const fullPath = dirPath.startsWith(HAPPYHQ_ROOT)
      ? dirPath
      : path.join(HAPPYHQ_ROOT, dirPath)
    const entries = await listDirectory(fullPath)
    return Response.json({ entries })
  } catch (error) {
    log('api.error', {
      route: '/api/fs/directory',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
