import path from 'path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

export function streamPath(streamName: string): string {
  return path.join(HAPPYHQ_ROOT, assertSafeStreamName(streamName))
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
  return path.join(HAPPYHQ_ROOT, 'tasks', assertSafeTaskSlug(taskSlug))
}

/** Resolve chat directory path — always at root. */
export function chatPath(sessionId: string): string {
  return path.join(HAPPYHQ_ROOT, '.chats', assertSafeSessionId(sessionId))
}

/** Daily log files directory (~/HappyHQ/.logs/). */
export function logsDir(): string {
  return path.join(HAPPYHQ_ROOT, '.logs')
}

/** Per-run wire-event tee directory (~/HappyHQ/.runs/). */
export function runsDir(): string {
  return path.join(HAPPYHQ_ROOT, '.runs')
}

/** Path to wire.jsonl for a single run (~/HappyHQ/.runs/<runId>/wire.jsonl). */
export function runWirePath(runId: string): string {
  assertSafePathSegment(runId, 'run id')
  return path.join(HAPPYHQ_ROOT, '.runs', runId, 'wire.jsonl')
}

/** Exercise harness artifact root (~/HappyHQ/.exercises/). */
export function exercisesDir(): string {
  return path.join(HAPPYHQ_ROOT, '.exercises')
}

/** Per-exercise artifact directory (~/HappyHQ/.exercises/<id>/). */
export function exerciseDir(id: string): string {
  assertSafePathSegment(id, 'exercise id')
  return path.join(HAPPYHQ_ROOT, '.exercises', id)
}

/**
 * Resolve `targetPath` to a canonical absolute path under `HAPPYHQ_ROOT`,
 * throwing if it would escape the root. Callers MUST use the returned value
 * for the actual fs operation — passing back the original `targetPath` keeps
 * the attacker-controlled string in the call and defeats the sanitization
 * (CodeQL flags this as `js/path-injection` for that reason).
 */
export function safePath(targetPath: string): string {
  const root = path.resolve(HAPPYHQ_ROOT)
  const resolved = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(root, targetPath)
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path ${targetPath} is outside ~/HappyHQ/`)
  }
  return resolved
}

/**
 * Void-returning guard kept for callers outside `lib/fs/` that don't yet
 * thread the canonical path through. Prefer `safePath()` in new code.
 */
export function validatePath(targetPath: string): void {
  safePath(targetPath)
}

/**
 * Reject sessionIds that aren't a plain UUID-shaped string. Chat session IDs
 * are minted by `crypto.randomUUID()` on the client, so anything else is a
 * malformed (or hostile) request — refuse before the value reaches `path.join`.
 */
const SESSION_ID_RE = /^[a-zA-Z0-9-]{1,64}$/
export function assertSafeSessionId(sessionId: string): string {
  if (!SESSION_ID_RE.test(sessionId)) {
    throw new Error('Invalid session id')
  }
  return sessionId
}

/**
 * Reject path segments that aren't a plain identifier. Stream names and task
 * slugs are user-supplied identifiers that get joined into filesystem paths,
 * so the character class is locked to alnum + `._-` with a leading-alnum rule
 * (rejects `.hidden` / `..` / traversal). The character-class regex is also
 * what CodeQL recognises as a `js/path-injection` sanitiser barrier — the
 * semantic `safePath()` resolve+startsWith check isn't modelled as one.
 */
const SAFE_PATH_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/

export function assertSafeStreamName(streamName: string): string {
  if (!SAFE_PATH_SEGMENT_RE.test(streamName)) {
    throw new Error('Invalid stream name')
  }
  return streamName
}

export function assertSafeTaskSlug(taskSlug: string): string {
  if (!SAFE_PATH_SEGMENT_RE.test(taskSlug)) {
    throw new Error('Invalid task slug')
  }
  return taskSlug
}

/**
 * Generic single-segment asserter for identifiers that aren't specifically a
 * stream name, task slug, or session id — e.g. spec names, sample names,
 * sample-category slugs, file slugs. Same regex as the others.
 */
export function assertSafePathSegment(
  value: string,
  label = 'path segment',
): string {
  if (!SAFE_PATH_SEGMENT_RE.test(value)) {
    throw new Error(`Invalid ${label}`)
  }
  return value
}
