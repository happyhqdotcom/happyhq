import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { readTextFile } from '@/lib/fs/read.server'
import { readFileAtRef } from '@/lib/git/log.server'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('path')
  const ref = searchParams.get('ref')
  if (!filePath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 })
  }
  try {
    // When a git ref is provided, read the file at that commit
    if (ref) {
      // filePath must be relative to HAPPYHQ_ROOT for git show
      const relativePath = filePath.startsWith(HAPPYHQ_ROOT)
        ? path.relative(HAPPYHQ_ROOT, filePath)
        : filePath
      const content = readFileAtRef(ref, relativePath)
      if (content === null) {
        return Response.json(
          { error: 'File not found at ref' },
          { status: 404 },
        )
      }
      return Response.json({ content })
    }

    // Accept both relative paths and absolute paths within HAPPYHQ_ROOT
    const fullPath = filePath.startsWith(HAPPYHQ_ROOT)
      ? filePath
      : path.join(HAPPYHQ_ROOT, filePath)
    const content = await readTextFile(fullPath)
    if (content === null) {
      return Response.json({ error: 'File not found' }, { status: 404 })
    }
    return Response.json({ content })
  } catch (error) {
    log('api.error', {
      route: '/api/fs/file',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
