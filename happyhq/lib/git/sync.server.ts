import { execSync } from 'node:child_process'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

/**
 * Commit any pending filesystem changes before an agent session starts.
 *
 * Catches user-initiated changes made outside the app (e.g. deleting a
 * directory in Finder). Ensures Q always starts with git state matching
 * the actual filesystem.
 *
 * Best-effort — failures are logged, not thrown. A missed sync is harmless;
 * the next commit picks up the changes.
 */
/**
 * Commit current filesystem changes with a descriptive message.
 *
 * Called after user-initiated create, rename, and delete operations so each
 * mutation gets its own commit with a meaningful [stream/task] message.
 *
 * Best-effort — failures are logged, not thrown.
 */
export function commitGitState(message: string): void {
  try {
    const status = execSync('git status --porcelain', {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    if (!status) return

    execSync(`git add -A && git commit -m "${message}"`, {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
  } catch (err) {
    console.warn(
      '[commitGitState] Failed to commit:',
      err instanceof Error ? err.message : err,
    )
  }
}

/**
 * Check whether the most recent commit touching a task's directory has `[done]`
 * in its subject line. This is the git-powered completion signal: Q appends
 * `[done]` to the commit message of its final working iteration.
 *
 * Best-effort — returns `false` on any failure (no commits, git error, etc.).
 */
export function isTaskCompleted(taskName: string): boolean {
  try {
    const taskDir = `tasks/${taskName}`
    const subject = execSync(`git log --format='%s' -1 -- ${taskDir}`, {
      cwd: HAPPYHQ_ROOT,
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe',
    }).trim()
    return subject.includes('[done]')
  } catch {
    return false
  }
}

export function syncGitState(): void {
  try {
    const status = execSync('git status --porcelain', {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    if (!status) return

    execSync('git add -A && git commit -m "[sync] Filesystem changes"', {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
  } catch (err) {
    console.warn(
      '[syncGitState] Failed to sync:',
      err instanceof Error ? err.message : err,
    )
  }
}
