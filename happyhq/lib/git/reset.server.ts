import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { initializeGitRepo } from '@/lib/git/init.server'

/**
 * Reset workspace history by removing the .git directory and reinitializing.
 *
 * All files remain intact — only the accumulated commit history is cleared.
 * After reinitializing, commits all current files as a fresh baseline.
 *
 * Throws on failure (unlike best-effort git helpers) so the API can return
 * an error to the client.
 */
export function resetGitHistory(): void {
  rmSync(path.join(HAPPYHQ_ROOT, '.git'), { recursive: true, force: true })
  initializeGitRepo()

  // Stage and commit all current files as a fresh baseline
  try {
    const status = execSync('git status --porcelain', {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    if (status) {
      execSync('git add -A && git commit -m "Reset workspace history"', {
        cwd: HAPPYHQ_ROOT,
        stdio: 'pipe',
      })
    }
  } catch (err) {
    console.warn(
      '[resetGitHistory] Failed to commit baseline:',
      err instanceof Error ? err.message : err,
    )
  }
}
