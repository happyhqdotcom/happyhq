import fs from 'node:fs'
import path from 'node:path'

import { logsDir } from '@/lib/fs/paths'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LogQuery {
  /** Filter by task slug. */
  task?: string
  /** Filter by stream slug. */
  stream?: string
  /** Filter by event name prefix (e.g. "run." matches run.started, run.error). */
  event?: string
  /** Max entries to return (default 20, max 100). */
  last?: number
  /** Only return events after this ISO timestamp. */
  since?: string
}

export interface LogEntry {
  t: string
  event: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------

/** Max number of daily files to search backward through. */
const MAX_DAYS_BACK = 7

/**
 * Read and filter recent log entries.
 *
 * Starts from today's file and works backward up to 7 days.
 * Returns entries in reverse-chronological order (newest first).
 */
export function readLogs(query: LogQuery = {}): LogEntry[] {
  const limit = Math.min(Math.max(query.last ?? 20, 1), 100)
  const dir = logsDir()
  const results: LogEntry[] = []

  const sinceMs = query.since ? new Date(query.since).getTime() : null

  for (let daysBack = 0; daysBack <= MAX_DAYS_BACK; daysBack++) {
    if (results.length >= limit) break

    const date = new Date()
    date.setDate(date.getDate() - daysBack)
    const filename = `${formatDate(date)}.jsonl`
    const filepath = path.join(dir, filename)

    let content: string
    try {
      content = fs.readFileSync(filepath, 'utf-8')
    } catch {
      continue // File doesn't exist for this day
    }

    const lines = content.trim().split('\n').filter(Boolean)

    // Process in reverse order (newest first within each file)
    for (let i = lines.length - 1; i >= 0; i--) {
      if (results.length >= limit) break

      let entry: LogEntry
      try {
        entry = JSON.parse(lines[i])
      } catch {
        continue // Skip malformed lines
      }

      if (!entry.t || !entry.event) continue

      // Apply filters
      if (sinceMs && new Date(entry.t).getTime() <= sinceMs) continue
      if (query.task && entry.task !== query.task) continue
      if (query.stream && entry.stream !== query.stream) continue
      if (query.event && !entry.event.startsWith(query.event)) continue

      results.push(entry)
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/** Fields that are already represented in the formatted prefix. */
const OMIT_FIELDS = new Set(['t', 'event'])

/**
 * Format log entries as scannable, human/agent-readable text.
 *
 * Example output:
 *   10:04:00  run.error      task=quarterly-report  error="EACCES: permission denied"
 *   10:03:00  run.iteration  task=quarterly-report  iteration=1  cost=$0.32
 */
export function formatLogEntries(entries: LogEntry[]): string {
  if (entries.length === 0) return 'No matching log entries.'

  return entries
    .map((entry) => {
      const time = entry.t.slice(11, 19) // HH:MM:SS from ISO string
      const event = entry.event.padEnd(20)

      const fields = Object.entries(entry)
        .filter(([key]) => !OMIT_FIELDS.has(key))
        .map(([key, value]) => {
          if (typeof value === 'string') return `${key}="${value}"`
          return `${key}=${value}`
        })
        .join('  ')

      return `${time}  ${event}  ${fields}`
    })
    .join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
