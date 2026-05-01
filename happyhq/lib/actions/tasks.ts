'use server'

import { rm } from 'node:fs/promises'
import path from 'node:path'

import {
  assertSafePathSegment,
  assertSafeStreamName,
  assertSafeTaskSlug,
  safePath,
  taskPath,
} from '@/lib/fs/paths'
import {
  readTaskMd,
  setTaskCompleted,
  updateTaskMdPending,
  writeTaskMd,
} from '@/lib/fs/task-md.server'
import type { TaskFrontmatter } from '@/lib/fs/types'
import { ensureDirectory } from '@/lib/fs/write.server'
import { commitGitState } from '@/lib/git/sync.server'
import { log } from '@/lib/log.server'

import { deleteFileItem } from './shared'

/**
 * Create a task in the root tasks/ directory.
 * If stream is provided, the task is agent-typed; otherwise human-typed.
 */
export async function createTask(
  slug: string,
  title: string,
  stream?: string,
  description?: string,
): Promise<void> {
  assertSafeTaskSlug(slug)
  if (stream !== undefined) assertSafeStreamName(stream)
  const taskDir = taskPath(slug)
  await ensureDirectory(taskDir)

  const frontmatter: TaskFrontmatter = {
    title,
    createdAt: new Date().toISOString(),
    ...(stream && { stream }),
  }

  await writeTaskMd(taskDir, frontmatter, description ?? '')
  commitGitState(`[tasks/${slug}] Create task`)
  log('task.created', { task: slug, ...(stream && { stream }) })
}

/** Set or update the title for a root task (task.md frontmatter). */
export async function writeTaskTitle(
  taskSlug: string,
  title: string,
): Promise<void> {
  assertSafeTaskSlug(taskSlug)
  const taskDir = taskPath(taskSlug)
  const existing = await readTaskMd(taskDir)
  if (!existing) throw new Error('Task not found')

  existing.frontmatter.title = title
  existing.frontmatter.updatedAt = new Date().toISOString()
  await writeTaskMd(taskDir, existing.frontmatter, existing.body)
  commitGitState(`[tasks/${taskSlug}] Update title`)
  log('task.updated', { task: taskSlug, field: 'title' })
}

/** Set or update the description for a root task (task.md body). */
export async function writeTaskDescription(
  taskSlug: string,
  description: string,
): Promise<void> {
  assertSafeTaskSlug(taskSlug)
  const taskDir = taskPath(taskSlug)
  const existing = await readTaskMd(taskDir)
  if (!existing) throw new Error('Task not found')

  existing.frontmatter.updatedAt = new Date().toISOString()
  await writeTaskMd(taskDir, existing.frontmatter, description)
  commitGitState(`[tasks/${taskSlug}] Update description`)
  log('task.updated', { task: taskSlug, field: 'description' })
}

/** Delete a file from a root task's inputs directory. */
export async function deleteTaskInput(
  taskSlug: string,
  inputName: string,
): Promise<void> {
  assertSafeTaskSlug(taskSlug)
  assertSafePathSegment(inputName, 'input name')
  const inputDir = path.join(taskPath(taskSlug), 'inputs', inputName)
  await deleteFileItem(
    inputDir,
    `[tasks/${taskSlug}] Remove input ${inputName}`,
  )
  log('task.input_deleted', { task: taskSlug, input: inputName })
}

/** Update the stream assignment for a root task. */
export async function updateTaskStream(
  taskSlug: string,
  streamSlug: string | null,
): Promise<void> {
  assertSafeTaskSlug(taskSlug)
  if (streamSlug !== null) assertSafeStreamName(streamSlug)
  const taskDir = taskPath(taskSlug)
  const existing = await readTaskMd(taskDir)
  if (!existing) throw new Error('Task not found')

  const { frontmatter, body } = existing
  if (streamSlug) {
    frontmatter.stream = streamSlug
  } else {
    delete frontmatter.stream
  }
  frontmatter.updatedAt = new Date().toISOString()

  await writeTaskMd(taskDir, frontmatter, body)
  commitGitState(`[tasks/${taskSlug}] Update stream assignment`)
  log('task.assigned', { task: taskSlug, stream: streamSlug ?? null })
}

/**
 * Toggle a task's completion state.
 * Completing: sets completedAt, clears pending.
 * Uncompleting: clears completedAt; for stream-assigned tasks, sets pending: review.
 */
export async function toggleTaskDone(slug: string): Promise<void> {
  assertSafeTaskSlug(slug)
  const taskDir = taskPath(slug)
  const existing = await readTaskMd(taskDir)
  if (!existing) throw new Error('Task not found')

  const { frontmatter } = existing
  const completing = !frontmatter.completedAt

  await setTaskCompleted(taskDir, completing)

  // When uncompleting a stream-assigned task, restore pending: review
  if (!completing && frontmatter.stream) {
    await updateTaskMdPending(taskDir, 'review')
  }

  commitGitState(`[tasks/${slug}] ${completing ? 'Complete' : 'Reopen'}`)
  log(completing ? 'task.completed' : 'task.reopened', { task: slug })
}

/**
 * Delete a root task directory and all its contents.
 * Hard delete, no confirmation, no undo.
 */
export async function deleteTaskByLocation(slug: string): Promise<void> {
  assertSafeTaskSlug(slug)
  const dir = safePath(taskPath(slug))
  await rm(dir, { recursive: true, force: true })
  commitGitState(`[tasks/${slug}] Delete task`)
  log('task.deleted', { task: slug })
}
