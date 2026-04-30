import { execFileSync } from 'node:child_process'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

export interface GitLogEntry {
  hash: string
  subject: string
  date: string
}

const FIELD_SEP = '---FIELD---'

/**
 * Check if a file has uncommitted changes (staged or unstaged).
 */
export function isFileDirty(filePath: string): boolean {
  try {
    const out = execFileSync(
      'git',
      ['diff', 'HEAD', '--name-only', '--', filePath],
      { cwd: HAPPYHQ_ROOT, encoding: 'utf8', timeout: 5000, stdio: 'pipe' },
    ).trim()
    return out.length > 0
  } catch {
    return false
  }
}

/**
 * Return commits that touched a specific file.
 * filePath is relative to HAPPYHQ_ROOT.
 */
export function getFileHistory(filePath: string, limit = 20): GitLogEntry[] {
  try {
    const raw = execFileSync(
      'git',
      [
        'log',
        `--format=%h${FIELD_SEP}%s${FIELD_SEP}%ar`,
        `-${limit}`,
        '--no-merges',
        '--',
        filePath,
      ],
      {
        cwd: HAPPYHQ_ROOT,
        encoding: 'utf8',
        timeout: 5000,
        stdio: 'pipe',
      },
    ).trim()

    if (!raw) return []

    return raw.split('\n').map((line) => {
      const [hash, subject, date] = line.split(FIELD_SEP)
      return { hash: hash ?? '', subject: subject ?? '', date: date ?? '' }
    })
  } catch {
    return []
  }
}

/**
 * Read file contents at a specific git ref.
 * filePath is relative to HAPPYHQ_ROOT.
 */
export function readFileAtRef(ref: string, filePath: string): string | null {
  try {
    return execFileSync('git', ['show', `${ref}:${filePath}`], {
      cwd: HAPPYHQ_ROOT,
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe',
    })
  } catch {
    return null
  }
}

/**
 * Return recent git log entries for the HappyHQ repo.
 * Best-effort — returns empty array on failure.
 *
 * When `grep` is provided, only commits whose subject matches the
 * extended regex are returned (e.g. `^\[my-stream/my-task\]`).
 */
export function getGitLog(limit = 50, grep?: string): GitLogEntry[] {
  try {
    const args = [
      'log',
      `--format=%h${FIELD_SEP}%s${FIELD_SEP}%ar`,
      `-${limit}`,
      '--no-merges',
    ]
    if (grep) {
      args.push('--extended-regexp', `--grep=${grep}`)
    }
    const raw = execFileSync('git', args, {
      cwd: HAPPYHQ_ROOT,
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe',
    }).trim()

    if (!raw) return []

    return raw.split('\n').map((line) => {
      const [hash, subject, date] = line.split(FIELD_SEP)
      return { hash: hash ?? '', subject: subject ?? '', date: date ?? '' }
    })
  } catch {
    return []
  }
}
