import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import path from 'path'

export function streamPath(streamName: string): string {
  return path.join(HAPPYHQ_ROOT, streamName)
}

/** Q's memory directory. */
export function qPath(): string {
  return path.join(HAPPYHQ_ROOT, '.q')
}

/** The tasks/ directory for the flat task list. */
export function tasksDir(): string {
  return path.join(HAPPYHQ_ROOT, 'tasks')
}

/** Path to a specific task directory (~/HappyHQ/tasks/{slug}). */
export function taskPath(taskSlug: string): string {
  return path.join(HAPPYHQ_ROOT, 'tasks', taskSlug)
}

/** Resolve chat directory path — always at root. */
export function chatPath(sessionId: string): string {
  return path.join(HAPPYHQ_ROOT, '.chats', sessionId)
}

/** Daily log files directory (~/HappyHQ/.logs/). */
export function logsDir(): string {
  return path.join(HAPPYHQ_ROOT, '.logs')
}

export function validatePath(targetPath: string): void {
  const resolved = path.resolve(targetPath)
  const root = path.resolve(HAPPYHQ_ROOT)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path ${targetPath} is outside ~/HappyHQ/`)
  }
}

/**
 * Reject sessionIds that aren't a plain UUID-shaped string. Chat session IDs
 * are minted by `crypto.randomUUID()` on the client, so anything else is a
 * malformed (or hostile) request — refuse before the value reaches `path.join`.
 */
const SESSION_ID_RE = /^[a-zA-Z0-9-]{1,64}$/
export function assertSafeSessionId(sessionId: string): void {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error('Invalid session id')
  }
}
