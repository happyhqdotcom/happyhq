'use server'

import { access, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { formatSlug } from '@/lib/format'
import {
  assertSafePathSegment,
  assertSafeStreamName,
  safePath,
  streamPath,
} from '@/lib/fs/paths'
import { readPlaybookMd, writePlaybookMd } from '@/lib/fs/playbook-md.server'
import { RESERVED_ROOT_DIRS, streamExists } from '@/lib/fs/read.server'
import { ensureDirectory } from '@/lib/fs/write.server'
import { commitGitState } from '@/lib/git/sync.server'
import { log } from '@/lib/log.server'

/**
 * Create a new stream directory with a user-provided slug.
 * Creates the standard subdirectories (specs/, samples/).
 * Uploads are chat-scoped — created inside .chats/{sessionId}/ by createChatSession().
 *
 * When billing is enabled, checks free tier stream limits before creation.
 */
export async function createStream(
  slug: string,
  token?: string,
): Promise<void> {
  assertSafeStreamName(slug)
  if (RESERVED_ROOT_DIRS.has(slug))
    throw new Error(
      `"${slug}" is a reserved name and cannot be used as a stream.`,
    )
  const root = safePath(streamPath(slug))

  const { assertAuthorizedRequest } = await import('@/lib/accounts/auth.server')
  const verified = await assertAuthorizedRequest(token)
  if (verified) {
    const { canCreateStream } = await import('@/ee/lib/billing/limits.server')
    const result = await canCreateStream(verified.id)
    if (!result.allowed) {
      throw new Error(result.reason)
    }
  }

  await Promise.all([
    ensureDirectory(root),
    ensureDirectory(path.join(root, 'specs')),
    ensureDirectory(path.join(root, 'samples')),
  ])
  commitGitState(`[${slug}] Create stream`)
  log('stream.created', { stream: slug })
}

/**
 * Delete a stream directory and all its contents.
 * Hard delete, no confirmation, no undo.
 */
export async function deleteStream(slug: string): Promise<void> {
  assertSafeStreamName(slug)
  const dir = safePath(streamPath(slug))
  await rm(dir, { recursive: true, force: true })
  commitGitState(`[${slug}] Delete stream`)
  log('stream.deleted', { stream: slug })
}

/**
 * Rename a stream directory (e.g., from temporary UUID slug to human-readable name).
 * Uses fs.rename for atomic rename on same filesystem.
 */
export async function renameStream(
  fromSlug: string,
  toSlug: string,
): Promise<void> {
  assertSafeStreamName(fromSlug)
  assertSafeStreamName(toSlug)
  if (RESERVED_ROOT_DIRS.has(toSlug))
    throw new Error(
      `"${toSlug}" is a reserved name and cannot be used as a stream.`,
    )
  const from = safePath(streamPath(fromSlug))
  const to = safePath(streamPath(toSlug))
  await rename(from, to)
  commitGitState(`[${toSlug}] Rename stream from ${fromSlug}`)
  log('stream.renamed', { stream: toSlug, from: fromSlug })
}

/**
 * Check if a stream directory exists under ~/HappyHQ/.
 * Thin server-action wrapper around streamExists() from read.server.
 */
export async function checkStreamExists(slug: string): Promise<boolean> {
  assertSafeStreamName(slug)
  return streamExists(slug)
}

/** Set the display title for a stream. Writes to playbook frontmatter, creating the playbook if needed. */
export async function writeStreamTitle(
  slug: string,
  title: string,
): Promise<void> {
  assertSafeStreamName(slug)
  const dir = streamPath(slug)
  const existing = await readPlaybookMd(dir)
  if (existing) {
    existing.frontmatter.title = title
    existing.frontmatter.updatedAt = new Date().toISOString()
    await writePlaybookMd(dir, existing.frontmatter, existing.body)
  } else {
    await writePlaybookMd(dir, {
      title,
      createdAt: new Date().toISOString(),
    })
  }
  log('stream.updated', { stream: slug, field: 'title' })
}

/** Update the body of a stream's playbook, preserving frontmatter. */
export async function writePlaybookBody(
  slug: string,
  body: string,
): Promise<void> {
  assertSafeStreamName(slug)
  const dir = streamPath(slug)
  const existing = await readPlaybookMd(dir)
  if (existing) {
    existing.frontmatter.updatedAt = new Date().toISOString()
    await writePlaybookMd(dir, existing.frontmatter, body)
  } else {
    await writePlaybookMd(
      dir,
      {
        title: formatSlug(slug),
        createdAt: new Date().toISOString(),
      },
      body,
    )
  }
  commitGitState(`[${slug}] Update playbook`)
  log('stream.updated', { stream: slug, field: 'playbook' })
}

/**
 * Delete a spec file from a stream's specs directory.
 */
export async function deleteSpec(
  streamName: string,
  specName: string,
): Promise<void> {
  assertSafeStreamName(streamName)
  assertSafePathSegment(specName, 'spec name')
  const specFile = safePath(
    path.join(streamPath(streamName), 'specs', specName),
  )
  await access(specFile)
  await rm(specFile)
  commitGitState(`[${streamName}] Delete spec ${specName}`)
  log('stream.spec_deleted', { stream: streamName, spec: specName })
}
