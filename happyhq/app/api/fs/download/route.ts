import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { safePath } from '@/lib/fs/paths'
import { log } from '@/lib/log.server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const filePath = searchParams.get('path')
  if (!filePath) {
    return Response.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  let fullPath: string
  try {
    fullPath = safePath(path.join(HAPPYHQ_ROOT, filePath))
  } catch {
    return Response.json({ error: 'Invalid path' }, { status: 403 })
  }

  try {
    // Single readFile call avoids the stat/read TOCTOU window where a
    // symlink swap could redirect the read after the canonical-path check.
    const buffer = await readFile(fullPath)
    const fileName = path.basename(fullPath)
    const ext = path.extname(fullPath).toLowerCase()

    // Content-Type is required for binary files — without it, middleware
    // or the browser may apply text encoding that corrupts the data.
    const MIME_TYPES: Record<string, string> = {
      '.pdf': 'application/pdf',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.docx':
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xlsx':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.pptx':
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.eml': 'message/rfc822',
      '.zip': 'application/zip',
      '.csv': 'text/csv',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.json': 'application/json',
    }

    return new Response(buffer, {
      headers: {
        'Content-Type': MIME_TYPES[ext] ?? 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Content-Length': String(buffer.length),
      },
    })
  } catch (error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      return Response.json({ error: 'File not found' }, { status: 404 })
    }
    if (code === 'EISDIR') {
      return Response.json({ error: 'Not a file' }, { status: 400 })
    }
    log('api.error', {
      route: '/api/fs/download',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
