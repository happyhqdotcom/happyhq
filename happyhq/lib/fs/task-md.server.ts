import matter from 'gray-matter'
import path from 'node:path'

import type { PendingType, TaskFrontmatter } from '@/lib/fs/types'

import { readTextFile } from './read.server'
import { writeTextFile } from './write.server'

/** Map legacy attention values to the new pending field. */
function migratePending(value: string): PendingType | undefined {
  if (value === 'approve_plan') return 'approval'
  if (['clarification', 'approval', 'checkpoint', 'review'].includes(value))
    return value as PendingType
  return undefined
}

/**
 * Parse raw task.md content into frontmatter + body.
 * Returns null if the content is malformed or missing required fields.
 * Handles backward compat: old `status`/`attention` fields are migrated.
 */
export function parseTaskMd(
  raw: string,
): { frontmatter: TaskFrontmatter; body: string } | null {
  try {
    const { data, content } = matter(raw)

    if (!data.title || typeof data.title !== 'string') return null
    if (!data.createdAt) return null

    const frontmatter: TaskFrontmatter = {
      title: data.title,
      createdAt:
        typeof data.createdAt === 'string'
          ? data.createdAt
          : new Date(data.createdAt).toISOString(),
    }

    // New field: completedAt
    if (data.completedAt) {
      frontmatter.completedAt =
        typeof data.completedAt === 'string'
          ? data.completedAt
          : new Date(data.completedAt).toISOString()
    } else if (data.status === 'done') {
      // Backward compat: synthesize completedAt from updatedAt or createdAt
      const ts = data.updatedAt ?? data.createdAt
      frontmatter.completedAt =
        typeof ts === 'string' ? ts : new Date(ts).toISOString()
    }

    if (data.stream && typeof data.stream === 'string') {
      frontmatter.stream = data.stream
    }

    // New field: pending (migrated from attention)
    if (data.pending && typeof data.pending === 'string') {
      const p = migratePending(data.pending)
      if (p) frontmatter.pending = p
    } else if (data.attention && typeof data.attention === 'string') {
      // Backward compat: map old attention to pending
      const p = migratePending(data.attention)
      if (p) frontmatter.pending = p
    }

    if (data.updatedAt) {
      frontmatter.updatedAt =
        typeof data.updatedAt === 'string'
          ? data.updatedAt
          : new Date(data.updatedAt).toISOString()
    }

    return { frontmatter, body: content.trim() }
  } catch {
    return null
  }
}

/**
 * Read task.md from a task directory.
 * Returns null if the file is missing or unparseable.
 */
export async function readTaskMd(
  taskDir: string,
): Promise<{ frontmatter: TaskFrontmatter; body: string } | null> {
  const filePath = path.join(taskDir, 'task.md')
  const raw = await readTextFile(filePath)
  if (!raw) return null
  return parseTaskMd(raw)
}

/**
 * Write task.md to a task directory.
 * Serializes frontmatter as YAML and body as markdown content.
 */
export async function writeTaskMd(
  taskDir: string,
  frontmatter: TaskFrontmatter,
  body: string = '',
): Promise<void> {
  const filePath = path.join(taskDir, 'task.md')
  const content = matter.stringify(body ? `\n${body}\n` : '\n', frontmatter)
  await writeTextFile(filePath, content)
}

/**
 * Update only the pending field in an existing task.md.
 * Sets updatedAt to the current time. No-ops if the file doesn't exist.
 */
export async function updateTaskMdPending(
  taskDir: string,
  pending?: PendingType,
): Promise<void> {
  const existing = await readTaskMd(taskDir)
  if (!existing) return

  const { frontmatter, body } = existing
  frontmatter.updatedAt = new Date().toISOString()

  if (pending) {
    frontmatter.pending = pending
  } else {
    delete frontmatter.pending
  }

  await writeTaskMd(taskDir, frontmatter, body)
}

/**
 * Set or clear the completedAt timestamp on a task.
 * When completing: sets completedAt, clears pending, updates updatedAt.
 * When uncompleting: removes completedAt, updates updatedAt.
 * No-ops if the file doesn't exist.
 */
export async function setTaskCompleted(
  taskDir: string,
  completed: boolean,
): Promise<void> {
  const existing = await readTaskMd(taskDir)
  if (!existing) return

  const { frontmatter, body } = existing
  const now = new Date().toISOString()
  frontmatter.updatedAt = now

  if (completed) {
    frontmatter.completedAt = now
    delete frontmatter.pending
  } else {
    delete frontmatter.completedAt
  }

  await writeTaskMd(taskDir, frontmatter, body)
}
