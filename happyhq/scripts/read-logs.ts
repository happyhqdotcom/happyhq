#!/usr/bin/env npx tsx
/**
 * CLI tool to query Q's structured logs.
 *
 * Usage:
 *   npx tsx scripts/read-logs.ts                          # last 20 events
 *   npx tsx scripts/read-logs.ts --event=run.error        # recent errors
 *   npx tsx scripts/read-logs.ts --task=quarterly-report   # events for a task
 *   npx tsx scripts/read-logs.ts --stream=reports          # events for a stream
 *   npx tsx scripts/read-logs.ts --last=50                 # more entries
 *   npx tsx scripts/read-logs.ts --since=2025-04-07T10:00  # after a timestamp
 *
 * Run from the app/ directory.
 */

import fs from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const LOGS_DIR = path.join(
  process.env.HAPPYHQ_ROOT || path.join(homedir(), 'HappyHQ'),
  '.logs',
)
const MAX_DAYS_BACK = 7

// ---------------------------------------------------------------------------
// Parse args
// ---------------------------------------------------------------------------

interface Args {
  task?: string
  stream?: string
  event?: string
  last: number
  since?: string
}

function parseArgs(): Args {
  const args: Args = { last: 20 }

  for (const arg of process.argv.slice(2)) {
    const [key, ...rest] = arg.split('=')
    const value = rest.join('=')

    switch (key) {
      case '--task':
        args.task = value
        break
      case '--stream':
        args.stream = value
        break
      case '--event':
        args.event = value
        break
      case '--last':
        args.last = Math.min(Math.max(parseInt(value, 10) || 20, 1), 100)
        break
      case '--since':
        args.since = value
        break
      case '--help':
      case '-h':
        console.log(`Usage: npx tsx scripts/read-logs.ts [options]

Options:
  --task=<slug>       Filter by task slug
  --stream=<slug>     Filter by stream slug
  --event=<prefix>    Filter by event prefix (e.g. "run." or "run.error")
  --last=<n>          Number of entries (default 20, max 100)
  --since=<iso>       Only events after this timestamp
  --help              Show this help`)
        process.exit(0)
    }
  }

  return args
}

// ---------------------------------------------------------------------------
// Reader (self-contained — no module imports needed)
// ---------------------------------------------------------------------------

interface LogEntry {
  t: string
  event: string
  [key: string]: unknown
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function readLogs(args: Args): LogEntry[] {
  const results: LogEntry[] = []
  const sinceMs = args.since ? new Date(args.since).getTime() : null

  for (let daysBack = 0; daysBack <= MAX_DAYS_BACK; daysBack++) {
    if (results.length >= args.last) break

    const date = new Date()
    date.setDate(date.getDate() - daysBack)
    const filepath = path.join(LOGS_DIR, `${formatDate(date)}.jsonl`)

    let content: string
    try {
      content = fs.readFileSync(filepath, 'utf-8')
    } catch {
      continue
    }

    const lines = content.trim().split('\n').filter(Boolean)

    for (let i = lines.length - 1; i >= 0; i--) {
      if (results.length >= args.last) break

      let entry: LogEntry
      try {
        entry = JSON.parse(lines[i])
      } catch {
        continue
      }

      if (!entry.t || !entry.event) continue
      if (sinceMs && new Date(entry.t).getTime() <= sinceMs) continue
      if (args.task && entry.task !== args.task) continue
      if (args.stream && entry.stream !== args.stream) continue
      if (args.event && !entry.event.startsWith(args.event)) continue

      results.push(entry)
    }
  }

  return results
}

// ---------------------------------------------------------------------------
// Format & print
// ---------------------------------------------------------------------------

const OMIT_FIELDS = new Set(['t', 'event'])

function formatEntry(entry: LogEntry): string {
  const time = entry.t.slice(11, 19)
  const event = entry.event.padEnd(20)

  const fields = Object.entries(entry)
    .filter(([key]) => !OMIT_FIELDS.has(key))
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}="${value}"`
      return `${key}=${value}`
    })
    .join('  ')

  return `${time}  ${event}  ${fields}`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = parseArgs()
const entries = readLogs(args)

if (entries.length === 0) {
  console.log('No matching log entries.')
  console.log(`(searched ${LOGS_DIR} for the last ${MAX_DAYS_BACK} days)`)
} else {
  // Header showing active filters
  const filters: string[] = []
  if (args.task) filters.push(`task=${args.task}`)
  if (args.stream) filters.push(`stream=${args.stream}`)
  if (args.event) filters.push(`event=${args.event}*`)
  if (args.since) filters.push(`since=${args.since}`)

  const header = filters.length
    ? `${entries.length} entries (${filters.join(', ')})`
    : `${entries.length} entries (most recent)`

  console.log(header)
  console.log('─'.repeat(Math.min(header.length + 20, 80)))
  for (const entry of entries) {
    console.log(formatEntry(entry))
  }
}
