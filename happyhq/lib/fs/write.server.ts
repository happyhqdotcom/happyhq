import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { validatePath } from './paths'

/**
 * Create a directory and all parent directories within ~/HappyHQ/.
 * Idempotent — succeeds silently if the directory already exists.
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  validatePath(dirPath)
  await mkdir(dirPath, { recursive: true })
}

/**
 * Remove all contents of a directory and recreate it empty.
 * Idempotent — succeeds silently if the directory doesn't exist.
 * Used for fresh-run cleanup of working/ and outputs/.
 */
export async function clearDirectory(dirPath: string): Promise<void> {
  validatePath(dirPath)
  await rm(dirPath, { recursive: true, force: true })
  await mkdir(dirPath, { recursive: true })
}

/**
 * Write a UTF-8 text file within ~/HappyHQ/.
 * Creates parent directories if they do not exist.
 */
export async function writeTextFile(
  filePath: string,
  content: string,
): Promise<void> {
  validatePath(filePath)
  await ensureDirectory(path.dirname(filePath))
  await writeFile(filePath, content, 'utf-8')
}
