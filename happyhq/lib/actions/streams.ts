'use server'

import { access, rename, rm } from 'node:fs/promises'
import path from 'node:path'

import { formatSlug } from '@/lib/format'
import {
  assertSafePathSegment,
  assertSafeStreamName,
  streamPath,
  validatePath,
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
  const root = streamPath(slug)
  validatePath(root)

  // Billing limit check — dynamic import to keep core/EE separation.
  // Token is passed from the client (db.useAuth().user.refresh_token)
  // and verified server-side, following InstantDB's recommended pattern.
  const { isBillingEnabled } = await import('@/ee/lib/billing/config')
  if (isBillingEnabled()) {
    if (!token) throw new Error('Sign in required to create a stream.')
    const { verifyToken } = await import('@/lib/accounts/auth.server')
    const verified = await verifyToken(token)
    if (!verified) throw new Error('Sign in required to create a stream.')
    const { isEmailAllowed } = await import('@/lib/accounts/config')
    if (!isEmailAllowed(verified.email))
      throw new Error('This instance is restricted.')
    const userId = verified.id
    const { canCreateStream } = await import('@/ee/lib/billing/limits.server')
    const result = await canCreateStream(userId)
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
  const dir = streamPath(slug)
  validatePath(dir)
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
  const from = streamPath(fromSlug)
  const to = streamPath(toSlug)
  validatePath(from)
  validatePath(to)
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
  const specFile = path.join(streamPath(streamName), 'specs', specName)
  validatePath(specFile)
  await access(specFile)
  await rm(specFile)
  commitGitState(`[${streamName}] Delete spec ${specName}`)
  log('stream.spec_deleted', { stream: streamName, spec: specName })
}
