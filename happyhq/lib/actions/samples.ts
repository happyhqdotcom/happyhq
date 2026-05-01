'use server'

import { access, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  assertSafePathSegment,
  assertSafeStreamName,
  streamPath,
  validatePath,
} from '@/lib/fs/paths'
import { readTextFile } from '@/lib/fs/read.server'
import { ensureDirectory } from '@/lib/fs/write.server'
import { commitGitState } from '@/lib/git/sync.server'

import { deleteFileItem } from './shared'

/**
 * Write a custom display title to .meta.json in the given directory.
 * Creates or updates the file, preserving any future fields.
 */
async function writeMeta(dirPath: string, title: string): Promise<void> {
  validatePath(dirPath)
  const metaPath = path.join(dirPath, '.meta.json')
  let existing: Record<string, unknown> = {}
  const raw = await readTextFile(metaPath)
  if (raw) {
    try {
      existing = JSON.parse(raw)
    } catch {
      // Malformed — overwrite with fresh data
    }
  }
  await writeFile(metaPath, JSON.stringify({ ...existing, title }), 'utf-8')
}

/**
 * Move a sample from one type to another.
 * Atomic directory rename on the filesystem.
 * Does not update INDEX.md — Q handles that during enrichment.
 */
export async function moveSampleCategory(
  streamName: string,
  sampleName: string,
  fromCategory: string,
  toCategory: string,
  token?: string,
): Promise<void> {
  assertSafeStreamName(streamName)
  assertSafePathSegment(sampleName, 'sample name')
  assertSafePathSegment(fromCategory, 'sample category')
  // Slugify the target type
  const targetCategory = toCategory
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!targetCategory) throw new Error('Invalid type name')
  if (targetCategory === fromCategory) return

  const samplesRoot = path.join(streamPath(streamName), 'samples')
  const fromDir = path.join(samplesRoot, fromCategory, sampleName)
  const toDir = path.join(samplesRoot, targetCategory, sampleName)

  validatePath(fromDir)
  validatePath(toDir)

  // Verify source exists
  await access(fromDir)

  // Ensure target type directory exists and move
  await ensureDirectory(path.join(samplesRoot, targetCategory))
  await rename(fromDir, toDir)

  // Clean up empty source type directory
  try {
    const remaining = await readdir(path.join(samplesRoot, fromCategory))
    // Remove if only INDEX.md or nothing remains
    const nonIndex = remaining.filter((f) => f !== 'INDEX.md')
    if (nonIndex.length === 0) {
      await rm(path.join(samplesRoot, fromCategory), {
        recursive: true,
        force: true,
      })
    }
  } catch {
    // Source type already gone — fine
  }

  commitGitState(
    `[${streamName}] Change sample type: ${sampleName} (${fromCategory} → ${targetCategory})`,
  )
}

export async function deleteSample(
  streamName: string,
  sampleName: string,
  category: string,
  token?: string,
): Promise<void> {
  assertSafeStreamName(streamName)
  assertSafePathSegment(sampleName, 'sample name')
  assertSafePathSegment(category, 'sample category')
  const samplesRoot = path.join(streamPath(streamName), 'samples')
  const sampleDir = path.join(samplesRoot, category, sampleName)

  await deleteFileItem(sampleDir, `[${streamName}] Delete sample ${sampleName}`)

  // Clean up empty type directory
  try {
    const remaining = await readdir(path.join(samplesRoot, category))
    const meaningful = remaining.filter(
      (f) => f !== 'INDEX.md' && f !== '.meta.json',
    )
    if (meaningful.length === 0) {
      await rm(path.join(samplesRoot, category), {
        recursive: true,
        force: true,
      })
    }
  } catch {
    // Source type already gone
  }
}

/** Set the display title for a sample. */
export async function writeSampleTitle(
  streamName: string,
  sampleName: string,
  category: string,
  title: string,
  token?: string,
): Promise<void> {
  assertSafeStreamName(streamName)
  assertSafePathSegment(sampleName, 'sample name')
  assertSafePathSegment(category, 'sample category')
  const sampleDir = path.join(
    streamPath(streamName),
    'samples',
    category,
    sampleName,
  )
  await writeMeta(sampleDir, title)
}

/** Delete a sample type. When deleteSamples is false, moves samples to "other". */
export async function deleteSampleType(
  streamName: string,
  categorySlug: string,
  deleteSamples: boolean,
  token?: string,
): Promise<void> {
  assertSafeStreamName(streamName)
  assertSafePathSegment(categorySlug, 'sample category')
  if (categorySlug === 'other')
    throw new Error('Cannot delete the "other" type')

  const samplesRoot = path.join(streamPath(streamName), 'samples')
  const categoryDir = path.join(samplesRoot, categorySlug)
  validatePath(categoryDir)

  if (!deleteSamples) {
    // Move any remaining samples to "other" — must succeed before we delete
    const entries = await readdir(categoryDir).catch(() => [] as string[])
    const samples = entries.filter(
      (f) => f !== 'INDEX.md' && f !== '.meta.json',
    )
    if (samples.length > 0) {
      const otherDir = path.join(samplesRoot, 'other')
      await ensureDirectory(otherDir)
      for (const sample of samples) {
        await rename(
          path.join(categoryDir, sample),
          path.join(otherDir, sample),
        )
      }
    }
  }

  // Safe to delete — either deleteSamples is true or all samples were moved
  await rm(categoryDir, { recursive: true, force: true })
  commitGitState(`[${streamName}] Delete sample type: ${categorySlug}`)
}

/** Set the display title for a sample type. */
export async function renameSampleCategory(
  streamName: string,
  categorySlug: string,
  title: string,
  token?: string,
): Promise<void> {
  assertSafeStreamName(streamName)
  assertSafePathSegment(categorySlug, 'sample category')
  const categoryDir = path.join(streamPath(streamName), 'samples', categorySlug)
  await writeMeta(categoryDir, title)
}

/** Create an empty sample type directory. Returns the slugified type name. */
export async function createSampleType(
  streamName: string,
  typeName: string,
  token?: string,
): Promise<string> {
  assertSafeStreamName(streamName)
  const slug = typeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) throw new Error('Invalid type name')

  const typeDir = path.join(streamPath(streamName), 'samples', slug)
  await ensureDirectory(typeDir)

  // Set display title if it differs from the slug
  if (typeName.trim() !== slug) {
    await writeMeta(typeDir, typeName.trim())
  }

  return slug
}
