'use server'

import { existsSync } from 'node:fs'
import { readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { extractContentFromDocx } from '@/lib/docx/extract-text.server'
import { extractContentFromEml } from '@/lib/eml/extract-text.server'
import {
  ALLOWED_INPUT_EXTENSIONS,
  isAllowedInputExtension,
} from '@/lib/file-types'
import type { InputQuality } from '@/lib/fs/assess-quality.server'
import { assessTextQuality } from '@/lib/fs/assess-quality.server'
import {
  assertSafeSessionId,
  streamPath,
  taskPath,
  validatePath,
} from '@/lib/fs/paths'
import { readTextFile } from '@/lib/fs/read.server'
import { ensureDirectory, writeTextFile } from '@/lib/fs/write.server'
import { commitGitState } from '@/lib/git/sync.server'
import { extractTextFromPdf } from '@/lib/pdf/extract-text.server'

import { log } from '@/lib/log.server'

import { deferredCommit, deleteFileItem } from './shared'

function unsupportedTypeMessage(filename: string): string {
  const allowed = ALLOWED_INPUT_EXTENSIONS.join(', ')
  return `Unsupported file type "${filename}". Allowed: ${allowed}.`
}

/**
 * Stage an uploaded file to the chat's uploads/ directory.
 * Creates a directory per upload: .chats/{sessionId}/uploads/{slug}/original.{ext}
 * Returns the slug (directory name), not the original filename.
 *
 * When billing is enabled, checks free tier sample limits before upload.
 */
export async function uploadFile(
  sessionId: string,
  formData: FormData,
  token?: string,
  streamSlug?: string | null,
): Promise<string> {
  assertSafeSessionId(sessionId)

  const file = formData.get('file') as File
  if (!file) {
    throw new Error('No file provided in FormData')
  }

  if (!isAllowedInputExtension(path.extname(file.name))) {
    throw new Error(unsupportedTypeMessage(file.name))
  }

  // Billing limit check — dynamic import to keep core/EE separation.
  // Token is passed from the client (db.useAuth().user.refresh_token)
  // and verified server-side, following InstantDB's recommended pattern.
  const { isBillingEnabled } = await import('@/ee/lib/billing/config')
  if (isBillingEnabled()) {
    if (!token) throw new Error('Sign in required to upload files.')
    const { verifyToken } = await import('@/lib/accounts/auth.server')
    const verified = await verifyToken(token)
    if (!verified) throw new Error('Sign in required to upload files.')
    const { isEmailAllowed } = await import('@/lib/accounts/config')
    if (!isEmailAllowed(verified.email))
      throw new Error('This instance is restricted.')
    const userId = verified.id
    if (streamSlug) {
      const { canUploadSample } = await import('@/ee/lib/billing/limits.server')
      const result = await canUploadSample(userId, streamSlug)
      if (!result.allowed) {
        throw new Error(result.reason)
      }
    }
  }

  // Derive slug: kebab-case from filename minus extension
  const ext = path.extname(file.name) // e.g. ".pdf"
  const baseName = file.name.slice(0, -ext.length || undefined)
  let slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) slug = 'upload'

  // Handle slug collisions within this chat session
  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)
  const uploadsDir = path.join(chatDir, 'uploads')
  let finalSlug = slug
  let counter = 2
  const maxAttempts = 100
  while (existsSync(path.join(uploadsDir, finalSlug))) {
    if (counter > maxAttempts) {
      throw new Error(`Too many uploads with slug "${slug}" in this chat`)
    }
    finalSlug = `${slug}-${counter}`
    counter++
  }

  // Create upload directory and write file as original.{ext}
  const uploadDir = path.join(uploadsDir, finalSlug)
  const destPath = path.join(uploadDir, `original${ext}`)
  validatePath(destPath)
  await ensureDirectory(uploadDir)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(destPath, buffer)

  // Eager text extraction — run pdfium for PDFs so ProcessSample
  // and preamble peek can read pre-extracted text instead of re-running extraction.
  if (ext.toLowerCase() === '.pdf') {
    try {
      const pdfBuffer = await readFile(destPath)
      const rawText = await extractTextFromPdf(pdfBuffer)
      await writeFile(path.join(uploadDir, 'raw.txt'), rawText, 'utf-8')
    } catch (err) {
      console.warn(
        '[uploadFile] Eager pdfium extraction failed:',
        err instanceof Error ? err.message : err,
      )
    }
  } else if (ext.toLowerCase() === '.eml') {
    try {
      const { metadata, attachments } = await extractContentFromEml(buffer)
      await writeFile(
        path.join(uploadDir, 'email.json'),
        JSON.stringify(metadata),
        'utf-8',
      )
      for (const att of attachments) {
        await writeFile(path.join(uploadDir, att.filename), att.content)
      }
    } catch (err) {
      console.warn(
        '[uploadFile] Eager eml extraction failed:',
        err instanceof Error ? err.message : err,
      )
    }
  } else if (ext.toLowerCase() === '.docx') {
    try {
      const { markdown, images } = await extractContentFromDocx(buffer)
      await writeFile(path.join(uploadDir, 'content.md'), markdown, 'utf-8')
      for (const img of images) {
        await writeFile(path.join(uploadDir, img.filename), img.content)
      }
    } catch (err) {
      console.warn(
        '[uploadFile] Eager docx extraction failed:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Persist slug -> original filename so chat history can render the
  // type-specific pill (PDF / Word / Excel) after a reload — the JSONL
  // marker only carries slugs, which lack extensions and would otherwise
  // collapse to a generic "File" pill on history round-trip.
  await recordUploadDisplayName(chatDir, finalSlug, file.name)

  log('file.uploaded', { chat: sessionId, file: finalSlug, ext })
  return finalSlug
}

/** Merge `uploads[slug] = displayName` into the session's chat.json. */
async function recordUploadDisplayName(
  chatDir: string,
  slug: string,
  displayName: string,
): Promise<void> {
  const chatJsonPath = path.join(chatDir, 'chat.json')
  validatePath(chatJsonPath)

  let existing: Record<string, unknown> = {}
  const raw = await readTextFile(chatJsonPath)
  if (raw) {
    try {
      existing = JSON.parse(raw)
    } catch {
      // Malformed — overwrite with fresh data
    }
  }

  const uploads =
    existing.uploads && typeof existing.uploads === 'object'
      ? { ...(existing.uploads as Record<string, string>) }
      : {}
  uploads[slug] = displayName

  try {
    await writeFile(
      chatJsonPath,
      JSON.stringify({ ...existing, uploads }),
      'utf-8',
    )
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
  }
}

/**
 * Set up a root task created from the chat flow — creates working
 * subdirectories, moves upload directories from .chats/{sessionId}/uploads/
 * to inputs/, and writes context.md. Call after createTask().
 */
export async function setupTaskFromChat(
  taskSlug: string,
  sessionId: string,
  textContext: string,
  files: string[],
): Promise<void> {
  assertSafeSessionId(sessionId)
  const taskDir = taskPath(taskSlug)

  await Promise.all([
    ensureDirectory(path.join(taskDir, 'inputs')),
    ensureDirectory(path.join(taskDir, 'working')),
    ensureDirectory(path.join(taskDir, 'outputs')),
  ])

  // Move upload directories from root .chats/{sessionId}/uploads/ to inputs/
  const uploadsDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId, 'uploads')
  const validFiles: { from: string; to: string }[] = []
  const seen = new Set<string>()
  for (const fileRef of files) {
    const slug = fileRef
      .replace(/^\.?\/?\.chats\/[^/]+\/uploads\//, '')
      .replace(/^\.?\/?uploads\//, '')
      .replace(/\/$/, '')
      .split('/')[0]
    if (seen.has(slug)) continue
    seen.add(slug)
    const from = path.join(uploadsDir, slug)
    const to = path.join(taskDir, 'inputs', slug)
    validatePath(from)
    validatePath(to)
    if (existsSync(from)) {
      validFiles.push({ from, to })
    } else {
      console.warn(`[setupTaskFromChat] Upload "${slug}" not found, skipping`)
    }
  }
  for (const { from, to } of validFiles) {
    await rename(from, to)
  }

  await writeTextFile(path.join(taskDir, 'inputs', 'context.md'), textContext)
  commitGitState(`[tasks/${taskSlug}] Chat inputs`)
}

/**
 * Delete any file or directory inside the workspace by relative path.
 * Validates the resolved path stays inside HAPPYHQ_ROOT.
 */
export async function deleteFile(
  relativePath: string,
  commitMessage?: string,
): Promise<void> {
  const abs = path.join(HAPPYHQ_ROOT, relativePath)
  await deleteFileItem(abs, commitMessage ?? `Remove ${relativePath}`)
  log('file.deleted', { path: relativePath })
}

/**
 * Shared helper: ingest a file into a destination directory.
 * Creates {destDir}/{slug}/original.{ext} + raw.txt (for PDFs).
 * Handles slug derivation, collision avoidance, billing checks, and git commit.
 */
async function ingestFile(
  destDir: string,
  formData: FormData,
  opts: {
    commitMessage: (slug: string) => string
    fallbackSlug?: string
    token?: string
    streamName?: string // for billing check
  },
): Promise<{ slug: string; quality?: InputQuality }> {
  const file = formData.get('file') as File
  if (!file) {
    throw new Error('No file provided in FormData')
  }

  const ext = path.extname(file.name)
  if (!isAllowedInputExtension(ext)) {
    throw new Error(unsupportedTypeMessage(file.name))
  }

  // Billing limit check
  if (opts.streamName) {
    const { isBillingEnabled } = await import('@/ee/lib/billing/config')
    if (isBillingEnabled()) {
      if (!opts.token) throw new Error('Sign in required to upload files.')
      const { verifyToken } = await import('@/lib/accounts/auth.server')
      const verified = await verifyToken(opts.token)
      if (!verified) throw new Error('Sign in required to upload files.')
      const { isEmailAllowed } = await import('@/lib/accounts/config')
      if (!isEmailAllowed(verified.email))
        throw new Error('This instance is restricted.')
      const userId = verified.id
      const { canUploadSample } = await import('@/ee/lib/billing/limits.server')
      const result = await canUploadSample(userId, opts.streamName)
      if (!result.allowed) {
        throw new Error(result.reason)
      }
    }
  }

  // Derive slug from filename
  const baseName = file.name.slice(0, -ext.length || undefined)
  let slug = baseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) slug = opts.fallbackSlug ?? 'file'

  // Handle slug collisions
  let finalSlug = slug
  let counter = 2
  const maxAttempts = 100
  while (existsSync(path.join(destDir, finalSlug))) {
    if (counter > maxAttempts) {
      throw new Error(`Too many files with slug "${slug}"`)
    }
    finalSlug = `${slug}-${counter}`
    counter++
  }

  // Create directory and write file
  const itemDir = path.join(destDir, finalSlug)
  const destPath = path.join(itemDir, `original${ext}`)
  validatePath(destPath)
  await ensureDirectory(itemDir)
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(destPath, buffer)

  // Eager text extraction for PDFs, emails, and DOCX
  let quality: InputQuality | undefined
  if (ext.toLowerCase() === '.pdf') {
    try {
      const rawText = await extractTextFromPdf(buffer)
      await writeFile(path.join(itemDir, 'raw.txt'), rawText, 'utf-8')
      quality = assessTextQuality(rawText).quality
    } catch (err) {
      console.warn(
        '[ingestFile] pdfium extraction failed:',
        err instanceof Error ? err.message : err,
      )
    }
  } else if (ext.toLowerCase() === '.eml') {
    try {
      const { metadata, attachments } = await extractContentFromEml(buffer)
      await writeFile(
        path.join(itemDir, 'email.json'),
        JSON.stringify(metadata),
        'utf-8',
      )
      for (const att of attachments) {
        await writeFile(path.join(itemDir, att.filename), att.content)
      }
    } catch (err) {
      console.warn(
        '[ingestFile] eml extraction failed:',
        err instanceof Error ? err.message : err,
      )
    }
  } else if (ext.toLowerCase() === '.docx') {
    try {
      const { markdown, images } = await extractContentFromDocx(buffer)
      await writeFile(path.join(itemDir, 'content.md'), markdown, 'utf-8')
      for (const img of images) {
        await writeFile(path.join(itemDir, img.filename), img.content)
      }
      quality = assessTextQuality(markdown).quality
    } catch (err) {
      console.warn(
        '[ingestFile] docx extraction failed:',
        err instanceof Error ? err.message : err,
      )
    }
  }

  // Defer the git commit so the server action returns immediately.
  // The file is on disk and visible to SWR; the commit is bookkeeping.
  deferredCommit(opts.commitMessage(finalSlug))
  return { slug: finalSlug, quality }
}

/**
 * Ingest a file directly into the samples directory (bypasses chat intake).
 * The file lands in samples/other/{slug}/ with original.{ext} + raw.txt (for PDFs).
 * Returns the final slug.
 */
export async function ingestSample(
  streamName: string,
  formData: FormData,
  token?: string,
): Promise<{ slug: string }> {
  const destDir = path.join(streamPath(streamName), 'samples', 'other')
  await ensureDirectory(destDir)
  const result = await ingestFile(destDir, formData, {
    commitMessage: (slug) => `[${streamName}] Add sample ${slug}`,
    fallbackSlug: 'sample',
    token,
    streamName,
  })
  log('sample.added', { stream: streamName, file: result.slug })
  return result
}

/**
 * Ingest a file into a root task's inputs/ directory.
 * The file lands in tasks/{taskSlug}/inputs/{slug}/ with original.{ext} + raw.txt (for PDFs).
 */
export async function ingestTaskInput(
  taskSlug: string,
  formData: FormData,
  token?: string,
): Promise<{ slug: string; quality?: InputQuality }> {
  const destDir = path.join(taskPath(taskSlug), 'inputs')
  await ensureDirectory(destDir)
  const result = await ingestFile(destDir, formData, {
    commitMessage: (slug) => `[tasks/${taskSlug}] Add input ${slug}`,
    fallbackSlug: 'input',
    token,
  })
  log('task.input_added', { task: taskSlug, file: result.slug })
  return result
}
