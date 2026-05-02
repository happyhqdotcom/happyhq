import { execFileSync, execSync } from 'node:child_process'

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
    const status = execFileSync('git', ['status', '--porcelain'], {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
      .toString()
      .trim()

    if (!status) return

    execFileSync('git', ['add', '-A'], { cwd: HAPPYHQ_ROOT, stdio: 'pipe' })
    execFileSync('git', ['commit', '-m', message], {
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
    const subject = execFileSync(
      'git',
      ['log', '--format=%s', '-1', '--', taskDir],
      {
        cwd: HAPPYHQ_ROOT,
        encoding: 'utf8',
        timeout: 5000,
        stdio: 'pipe',
      },
    ).trim()
    return subject.includes('[done]')
  } catch {
    return false
  }
}

/**
 * Get the SHA of the most recent commit touching a task's directory, or null
 * if no commits exist (or git errors). Used by the working loop to detect
 * iterations where the agent didn't commit any work — a "no progress" signal
 * that catches stuck runs before they burn through the iteration cap.
 */
export function getLatestTaskCommit(taskName: string): string | null {
  try {
    const taskDir = `tasks/${taskName}`
    const sha = execFileSync(
      'git',
      ['log', '--format=%H', '-1', '--', taskDir],
      {
        cwd: HAPPYHQ_ROOT,
        encoding: 'utf8',
        timeout: 5000,
        stdio: 'pipe',
      },
    ).trim()
    return sha || null
  } catch {
    return null
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

/**
 * Restore plan.md to the version from the "Plan accepted" git commit.
 * Best-effort — if no commit is found or git fails, the current plan
 * is left as-is (graceful no-op on first run or edge cases).
 *
 * Lives here (not in loop.server.ts) so tests that mock `@/lib/git/sync.server`
 * intercept the shell-out instead of hitting real git.
 */
export function restorePlanFromGit(taskName: string): void {
  try {
    const taskRelPath = `tasks/${taskName}/plan.md`
    const hash = execFileSync(
      'git',
      ['log', '--format=%H', '--grep=Plan accepted', '-1', '--', taskRelPath],
      { cwd: HAPPYHQ_ROOT, encoding: 'utf8', stdio: 'pipe' },
    ).trim()
    if (!hash) return
    execFileSync('git', ['restore', `--source=${hash}`, '--', taskRelPath], {
      cwd: HAPPYHQ_ROOT,
      stdio: 'pipe',
    })
  } catch (err) {
    console.warn(
      '[Q:run] Failed to restore plan.md:',
      err instanceof Error ? err.message : err,
    )
  }
}
