import {
  listAllChats,
  readStreamContent,
  readTaskContent,
  streamExists,
} from '@/lib/fs/read.server'
import { log } from '@/lib/log.server'

/**
 * Combined desktop data endpoint — returns stream content, task content,
 * and chats in a single request. This is the only data fetch the desktop
 * provider needs, matching the single-query pattern of InstantDB in HQ.
 *
 * When `runOnly=true`, skips the expensive readStreamContent and listChats
 * reads and returns only taskContent + updated taskList. The client merges
 * these into its cached DesktopData. This makes mid-run refreshes fast
 * since specs, samples, playbook, and chats don't change during a run.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const stream = searchParams.get('stream')
  const task = searchParams.get('task') || undefined
  const runOnly = searchParams.get('runOnly') === 'true'

  if (!stream && !task) {
    return Response.json(
      { error: 'Missing stream or task parameter' },
      { status: 400 },
    )
  }

  try {
    // ── Task-only mode (no stream) ──────────────────────────────────
    if (!stream) {
      if (runOnly) {
        const taskContent = await readTaskContent(task!)
        return Response.json({ taskContent, runOnly: true })
      }
      const taskContent = await readTaskContent(task!)
      return Response.json({ streamContent: null, taskContent, chats: [] })
    }

    // ── Stream mode (with optional task) ────────────────────────────
    if (!(await streamExists(stream))) {
      return Response.json({ error: 'Stream not found' }, { status: 404 })
    }

    if (runOnly && task) {
      const taskContent = await readTaskContent(task)
      return Response.json({ taskContent, runOnly: true })
    }

    const [streamContent, taskContent, chats] = await Promise.all([
      readStreamContent(stream),
      task ? readTaskContent(task) : Promise.resolve(null),
      listAllChats(),
    ])

    return Response.json({ streamContent, taskContent, chats })
  } catch (err) {
    log('api.error', {
      route: '/api/fs/desktop',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
