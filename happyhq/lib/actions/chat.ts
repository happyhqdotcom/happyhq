'use server'

import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import {
  assertSafePathSegment,
  assertSafeSessionId,
  safePath,
} from '@/lib/fs/paths'
import { readTextFile } from '@/lib/fs/read.server'
import { ensureDirectory, writeTextFile } from '@/lib/fs/write.server'
import { log } from '@/lib/log.server'

function isEnoent(err: unknown): boolean {
  return (err as NodeJS.ErrnoException)?.code === 'ENOENT'
}

/**
 * Create a chat session directory with its metadata file.
 * Must be called before the first POST /api/chat for a new session
 * so the SDK has a directory for session persistence.
 */
export async function createChatSession(
  sessionId: string,
  streamSlug?: string | null,
): Promise<void> {
  assertSafeSessionId(sessionId)
  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)
  await ensureDirectory(chatDir)
  await ensureDirectory(path.join(chatDir, 'uploads'))
  await writeTextFile(
    path.join(chatDir, 'chat.json'),
    JSON.stringify({
      name: null,
      mode: 'general',
      ...(streamSlug && { streamSlug }),
    }),
  )
  log('chat.created', {
    chat: sessionId,
    ...(streamSlug && { stream: streamSlug }),
  })
}

/**
 * Update the name of a chat session by rewriting its chat.json metadata file.
 * Used by auto-naming after the first assistant response.
 */
export async function setChatName(
  sessionId: string,
  name: string,
): Promise<void> {
  assertSafeSessionId(sessionId)
  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)
  const chatJsonPath = safePath(path.join(chatDir, 'chat.json'))

  // Read existing chat.json to preserve any future fields
  let existing: Record<string, unknown> = {}
  const raw = await readTextFile(chatJsonPath)
  if (raw) {
    try {
      existing = JSON.parse(raw)
    } catch {
      // Malformed — overwrite with fresh data
    }
  }

  // Write directly (not writeTextFile) to avoid ensureDirectory recreating
  // a directory that was renamed away by the deferred stream rename.
  // If the directory no longer exists, the write fails — that's fine because
  // the stream has already been renamed and the old path is stale.
  try {
    await writeFile(
      chatJsonPath,
      JSON.stringify({ ...existing, name }),
      'utf-8',
    )
  } catch (err) {
    if (!isEnoent(err)) throw err
  }
}

/**
 * Persist the user's mid-chat stream selection to chat.json.
 * Same read-merge-write pattern as setChatMode / setChatName.
 */
export async function setChatSelectedStream(
  chatDir: string,
  selectedStreamSlug: string | null,
): Promise<void> {
  const chatJsonPath = safePath(path.join(chatDir, 'chat.json'))

  let existing: Record<string, unknown> = {}
  const raw = await readTextFile(chatJsonPath)
  if (raw) {
    try {
      existing = JSON.parse(raw)
    } catch {
      // Malformed — overwrite with fresh data
    }
  }

  const update: Record<string, unknown> = {
    ...existing,
    selectedStreamSlug,
  }

  try {
    await writeFile(chatJsonPath, JSON.stringify(update), 'utf-8')
  } catch (err) {
    if (!isEnoent(err)) throw err
  }
}

/**
 * Update the chat mode in chat.json.
 * Same read-merge-write pattern as setChatName.
 * Optionally records the streamSlug when entering learning mode.
 */
export async function setChatMode(
  chatDir: string,
  mode: 'general' | 'learning',
  streamSlug?: string,
): Promise<void> {
  const chatJsonPath = safePath(path.join(chatDir, 'chat.json'))

  let existing: Record<string, unknown> = {}
  const raw = await readTextFile(chatJsonPath)
  if (raw) {
    try {
      existing = JSON.parse(raw)
    } catch {
      // Malformed — overwrite with fresh data
    }
  }

  const update: Record<string, unknown> = { ...existing, mode }
  if (streamSlug !== undefined) update.streamSlug = streamSlug

  try {
    await writeFile(chatJsonPath, JSON.stringify(update), 'utf-8')
  } catch (err) {
    if (!isEnoent(err)) throw err
  }
}

/**
 * Record that a task was created from this chat session.
 * Adds the task name to the createdTasks array and persists the generated
 * slug in taskSlugs so the bubble can navigate after history reload (slugs
 * include a timestamp and can't be regenerated).
 */
export async function markTaskCreated(
  sessionId: string,
  taskName: string,
  taskSlug: string,
): Promise<void> {
  assertSafeSessionId(sessionId)
  // taskName flows from agent-supplied tool input into an object key below;
  // validate up-front to block prototype-pollution (__proto__/constructor) and
  // any non-segment-shaped values.
  assertSafePathSegment(taskName, 'task name')
  assertSafePathSegment(taskSlug, 'task slug')
  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)
  const chatJsonPath = safePath(path.join(chatDir, 'chat.json'))

  let existing: Record<string, unknown> = {}
  const raw = await readTextFile(chatJsonPath)
  if (raw) {
    try {
      existing = JSON.parse(raw)
    } catch {
      // Malformed — overwrite with fresh data
    }
  }

  const createdTasks: string[] = Array.isArray(existing.createdTasks)
    ? existing.createdTasks
    : []
  if (!createdTasks.includes(taskName)) {
    createdTasks.push(taskName)
  }

  const taskSlugs: Record<string, string> =
    existing.taskSlugs && typeof existing.taskSlugs === 'object'
      ? (existing.taskSlugs as Record<string, string>)
      : {}
  taskSlugs[taskName] = taskSlug

  try {
    await writeFile(
      chatJsonPath,
      JSON.stringify({ ...existing, createdTasks, taskSlugs }),
      'utf-8',
    )
  } catch (err) {
    if (!isEnoent(err)) throw err
  }
}

/**
 * Record that a task was started from this chat session.
 * Adds the task name to the startedTasks array in chat.json.
 * Same read-merge-write pattern as setChatName.
 */
export async function markTaskStarted(
  sessionId: string,
  taskName: string,
): Promise<void> {
  assertSafeSessionId(sessionId)
  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)
  const chatJsonPath = safePath(path.join(chatDir, 'chat.json'))

  let existing: Record<string, unknown> = {}
  const raw = await readTextFile(chatJsonPath)
  if (raw) {
    try {
      existing = JSON.parse(raw)
    } catch {
      // Malformed — overwrite with fresh data
    }
  }

  const startedTasks: string[] = Array.isArray(existing.startedTasks)
    ? existing.startedTasks
    : []
  if (!startedTasks.includes(taskName)) {
    startedTasks.push(taskName)
  }

  try {
    await writeFile(
      chatJsonPath,
      JSON.stringify({ ...existing, startedTasks }),
      'utf-8',
    )
  } catch (err) {
    if (!isEnoent(err)) throw err
  }
}

/**
 * Delete a chat session directory and all its contents.
 * Hard delete, no confirmation, no undo.
 * SDK session data in ~/.claude/ is left intact (SDK's domain).
 */
export async function deleteChat(sessionId: string): Promise<void> {
  assertSafeSessionId(sessionId)
  const chatDir = safePath(path.join(HAPPYHQ_ROOT, '.chats', sessionId))
  await rm(chatDir, { recursive: true, force: true })
  log('chat.deleted', { chat: sessionId })
}
