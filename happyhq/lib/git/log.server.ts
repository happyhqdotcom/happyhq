import { execSync } from 'node:child_process'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

export interface GitLogEntry {
  hash: string
  subject: string
  date: string
}

const SEPARATOR = '---GIT-LOG-SEP---'
const FIELD_SEP = '---FIELD---'

/** Wrap a value in single quotes, escaping any embedded single quotes. */
function shellEscape(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Check if a file has uncommitted changes (staged or unstaged).
 */
export function isFileDirty(filePath: string): boolean {
  try {
    const out = execSync(
      `git diff HEAD --name-only -- ${shellEscape(filePath)}`,
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
    const raw = execSync(
      `git log --format='%h${FIELD_SEP}%s${FIELD_SEP}%ar' -${limit} --no-merges -- ${shellEscape(filePath)}`,
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
    return execSync(`git show ${shellEscape(ref)}:${shellEscape(filePath)}`, {
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
    const grepFlag = grep
      ? ` --extended-regexp --grep=${shellEscape(grep)}`
      : ''
    const raw = execSync(
      `git log --format='%h${FIELD_SEP}%s${FIELD_SEP}%ar' -${limit} --no-merges${grepFlag}`,
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
