#!/usr/bin/env npx tsx
/**
 * Smoke test for the running Q dev server.
 *
 * Usage:
 *   npx tsx scripts/smoke-test.ts                # test against localhost:3000
 *   PORT=3001 npx tsx scripts/smoke-test.ts      # custom port
 *
 * Run from the app/ directory.
 */

import fs from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || '3000'
const BASE_URL = `http://localhost:${PORT}`
const LOGS_DIR = path.join(
  process.env.HAPPYHQ_ROOT || path.join(homedir(), 'HappyHQ'),
  '.logs',
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string
  passed: boolean
  ms: number
  detail?: string
}

async function check(
  name: string,
  fn: () => Promise<string | undefined>,
): Promise<CheckResult> {
  const start = Date.now()
  try {
    const detail = await fn()
    return { name, passed: true, ms: Date.now() - start, detail }
  } catch (err) {
    return {
      name,
      passed: false,
      ms: Date.now() - start,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

async function expectJson(url: string): Promise<unknown> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

async function runChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = []

  // 1. Auth status (health check)
  results.push(
    await check('GET /api/auth/status', async () => {
      const data = (await expectJson(`${BASE_URL}/api/auth/status`)) as Record<
        string,
        unknown
      >
      if (typeof data.deployed !== 'boolean')
        throw new Error('missing "deployed" field')
      return `deployed=${data.deployed}`
    }),
  )

  // 2. Config
  results.push(
    await check('GET /api/config', async () => {
      const data = (await expectJson(`${BASE_URL}/api/config`)) as Record<
        string,
        unknown
      >
      if (typeof data !== 'object' || data === null)
        throw new Error('not an object')
      return undefined
    }),
  )

  // 3. Streams list
  results.push(
    await check('GET /api/fs/streams', async () => {
      const data = await expectJson(`${BASE_URL}/api/fs/streams`)
      if (!Array.isArray(data)) throw new Error('not an array')
      return `${data.length} streams`
    }),
  )

  // 4. Task items list
  results.push(
    await check('GET /api/fs/task-items', async () => {
      const data = await expectJson(`${BASE_URL}/api/fs/task-items`)
      if (!Array.isArray(data)) throw new Error('not an array')
      return `${data.length} tasks`
    }),
  )

  // 5. Active run (null when idle)
  results.push(
    await check('GET /api/run/active', async () => {
      const res = await fetch(`${BASE_URL}/api/run/active`)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return undefined
    }),
  )

  // 6. Check today's logs for errors
  results.push(
    await check('Log: no recent errors', async () => {
      const today = new Date()
      const y = today.getFullYear()
      const m = String(today.getMonth() + 1).padStart(2, '0')
      const d = String(today.getDate()).padStart(2, '0')
      const filepath = path.join(LOGS_DIR, `${y}-${m}-${d}.jsonl`)

      let content: string
      try {
        content = fs.readFileSync(filepath, 'utf-8')
      } catch {
        return 'no log file today (ok)'
      }

      const errorEvents = content
        .trim()
        .split('\n')
        .filter(Boolean)
        .filter((line) => {
          try {
            const entry = JSON.parse(line)
            return (
              entry.event === 'client.error' ||
              entry.event === 'client.unhandled_rejection' ||
              entry.event === 'client.react.error' ||
              entry.event === 'client.react.render_error' ||
              entry.event === 'api.error' ||
              entry.event === 'run.error'
            )
          } catch {
            return false
          }
        })

      if (errorEvents.length > 0) {
        throw new Error(`${errorEvents.length} error event(s) in today's log`)
      }

      return '0 error events today'
    }),
  )

  return results
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Smoke testing ${BASE_URL}...\n`)

  const results = await runChecks()

  let allPassed = true
  for (const r of results) {
    const icon = r.passed ? '\u2713' : '\u2717'
    const time = `${r.ms}ms`
    const detail = r.detail ? ` (${r.detail})` : ''
    console.log(`  ${icon} ${r.name} ${time}${detail}`)
    if (!r.passed) allPassed = false
  }

  console.log()
  if (allPassed) {
    console.log('All checks passed.')
  } else {
    console.log('Some checks failed.')
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Smoke test crashed:', err)
  process.exit(1)
})
