import { stat } from 'node:fs/promises'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { assertSafePathSegment, safePath } from '@/lib/fs/paths'
import { log } from '@/lib/log.server'

export async function POST(request: Request) {
  let body: { path?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const filePath = body.path
  if (!filePath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  // Regex barrier on every segment of the user-supplied relative path —
  // sits on the original taint source so CodeQL sees a sanitiser before
  // the value reaches `path.join` and the fs op.
  try {
    for (const segment of filePath.split('/').filter(Boolean)) {
      assertSafePathSegment(segment)
    }
  } catch {
    return Response.json({ error: 'Invalid path' }, { status: 400 })
  }

  let fullPath: string
  try {
    fullPath = safePath(path.join(HAPPYHQ_ROOT, filePath))
  } catch {
    return Response.json({ error: 'Invalid path' }, { status: 403 })
  }

  try {
    await stat(fullPath)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Response.json({ error: 'File not found' }, { status: 404 })
    }
    log('api.error', {
      route: '/api/fs/open',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }

  if (process.platform !== 'darwin') {
    return Response.json(
      { error: 'Not supported on this platform' },
      { status: 501 },
    )
  }

  const { execFileSync } = await import('node:child_process')
  try {
    execFileSync('open', [fullPath])
  } catch (err) {
    log('api.error', {
      route: '/api/fs/open',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Failed to open file' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
