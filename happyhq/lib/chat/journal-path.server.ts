import { access, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

/**
 * Encode a CWD path to the format the SDK uses for project directories.
 * The SDK replaces `/` with `-` (e.g., `/Users/philo/HappyHQ`
 * becomes `-Users-philo-HappyHQ`).
 */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, '-')
}

/**
 * Scan all ~/.claude/projects/ subdirectories for a JSONL file with the given session ID.
 * Used as a fallback for sessions created before the cwd was changed to the stream directory.
 */
async function findSessionJsonl(sessionId: string): Promise<string | null> {
  const projectsDir = path.join(homedir(), '.claude', 'projects')
  try {
    const subdirs = await readdir(projectsDir, { withFileTypes: true })
    for (const entry of subdirs) {
      if (!entry.isDirectory()) continue
      const candidate = path.join(projectsDir, entry.name, `${sessionId}.jsonl`)
      try {
        await access(candidate)
        return candidate
      } catch {
        // not in this dir -- keep scanning
      }
    }
  } catch {
    // .claude/projects doesn't exist
  }
  return null
}

/**
 * Resolve the JSONL file path for a session.
 * Tries the primary path first (workspace root encoded as project dir),
 * then falls back to scanning all project dirs for old sessions that
 * used stream-scoped CWDs.
 */
export async function resolveSessionJournal(
  sessionId: string,
): Promise<string | null> {
  const encodedDir = encodeProjectDir(HAPPYHQ_ROOT)
  const primary = path.join(
    homedir(),
    '.claude',
    'projects',
    encodedDir,
    `${sessionId}.jsonl`,
  )

  try {
    await access(primary)
    return primary
  } catch {
    // Primary path not found -- try fallback scan
  }

  return findSessionJsonl(sessionId)
}
