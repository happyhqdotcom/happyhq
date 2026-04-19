import fs from 'node:fs'
import path from 'node:path'

import { logsDir } from '@/lib/fs/paths'

/**
 * Append a structured event to the daily JSONL log file.
 *
 * See specs/logging.md for event naming conventions and field conventions.
 */
export function log(event: string, data?: Record<string, unknown>): void {
  try {
    const now = new Date()
    const dir = logsDir()
    const file = path.join(dir, `${formatDate(now)}.jsonl`)

    let line: string
    try {
      line = JSON.stringify({ t: now.toISOString(), event, ...data })
    } catch {
      // Circular reference or other serialization failure
      line = JSON.stringify({
        t: now.toISOString(),
        event,
        _serializationError: true,
      })
    }

    fs.mkdirSync(dir, { recursive: true })
    fs.appendFileSync(file, line + '\n')
  } catch {
    // Logging must never crash the app
  }
}

/** Format a Date as YYYY-MM-DD for the daily filename. */
function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
