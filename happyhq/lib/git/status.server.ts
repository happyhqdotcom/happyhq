import { execSync } from 'node:child_process'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

export interface GitStatusEntry {
  status: string
  path: string
}

/**
 * Return dirty files from `git status --porcelain` in the HappyHQ repo.
 * Best-effort — returns empty array on failure.
 */
export function getGitStatus(): GitStatusEntry[] {
  try {
    const raw = execSync('git status --porcelain', {
      cwd: HAPPYHQ_ROOT,
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe',
    }).trim()

    if (!raw) return []

    return raw.split('\n').map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3),
    }))
  } catch {
    return []
  }
}
