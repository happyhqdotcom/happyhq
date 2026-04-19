import { stat } from 'node:fs/promises'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { validatePath } from '@/lib/fs/paths'
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

  const fullPath = path.join(HAPPYHQ_ROOT, filePath)

  try {
    validatePath(fullPath)
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
      route: '/api/fs/reveal',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }

  // `open -R` is macOS-only. In Docker/Linux containers it doesn't exist.
  if (process.platform !== 'darwin') {
    return Response.json(
      { error: 'Not supported on this platform' },
      { status: 501 },
    )
  }

  // Reveal in Finder (macOS). execSync is intentional here — we need
  // the shell to invoke `open -R` and this is a user-triggered action.
  const { execSync } = await import('node:child_process')
  try {
    execSync(`open -R "${fullPath}"`)
  } catch (err) {
    log('api.error', {
      route: '/api/fs/reveal',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Failed to reveal file' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
