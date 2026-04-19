import { getFileHistory, isFileDirty } from '@/lib/git/log.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('path')
  if (!filePath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 })
  }
  try {
    const entries = getFileHistory(filePath)
    const dirty = isFileDirty(filePath)
    return Response.json({ entries, dirty })
  } catch (err) {
    log('api.error', {
      route: '/api/fs/file-history',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
