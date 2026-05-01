import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { safePath } from './paths'

/**
 * Create a directory and all parent directories within ~/HappyHQ/.
 * Idempotent — succeeds silently if the directory already exists.
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(safePath(dirPath), { recursive: true })
}

/**
 * Remove all contents of a directory and recreate it empty.
 * Idempotent — succeeds silently if the directory doesn't exist.
 * Used for fresh-run cleanup of working/ and outputs/. Path must end in
 * `tasks/{slug}/working` or `tasks/{slug}/outputs` — anything else throws.
 * The inline regex match is also a sanitiser barrier CodeQL recognises.
 */
export async function clearDirectory(dirPath: string): Promise<void> {
  const normalized = dirPath.replace(/\\/g, '/')
  if (
    !/\/tasks\/[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}\/(working|outputs)$/.test(
      normalized,
    )
  ) {
    throw new Error('Invalid clearDirectory path')
  }
  const safe = safePath(dirPath)
  await rm(safe, { recursive: true, force: true })
  await mkdir(safe, { recursive: true })
}

/**
 * Write a UTF-8 text file within ~/HappyHQ/.
 * Creates parent directories if they do not exist.
 */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  const safe = safePath(filePath)
  await ensureDirectory(path.dirname(safe))
  await writeFile(safe, content, 'utf-8')
}
