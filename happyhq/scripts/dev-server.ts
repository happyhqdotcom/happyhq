#!/usr/bin/env npx tsx
/**
 * Dev server lifecycle helper for the Exercise step.
 *
 *   npx tsx scripts/dev-server.ts start       # boot pnpm dev in background
 *   npx tsx scripts/dev-server.ts wait-ready  # poll /api/auth/status until 200
 *   npx tsx scripts/dev-server.ts stop        # kill the background dev server
 *   npx tsx scripts/dev-server.ts status      # check if it's running
 *
 * PID + log paths live under /tmp so concurrent worktrees don't collide:
 *   /tmp/happyhq-dev-server.<cwd-hash>.pid
 *   /tmp/happyhq-dev-server.<cwd-hash>.log
 *
 * Run from the happyhq/ directory.
 */

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = process.env.PORT || '3000'
const BASE_URL = `http://localhost:${PORT}`
const READY_TIMEOUT_MS =
  Number(process.env.DEV_SERVER_READY_TIMEOUT_MS) || 90_000
const POLL_INTERVAL_MS = 500

const cwdHash = crypto
  .createHash('sha1')
  .update(process.cwd())
  .digest('hex')
  .slice(0, 8)
const PID_FILE = path.join(os.tmpdir(), `happyhq-dev-server.${cwdHash}.pid`)
const LOG_FILE = path.join(os.tmpdir(), `happyhq-dev-server.${cwdHash}.log`)

function readPid(): number | null {
  if (!fs.existsSync(PID_FILE)) return null
  const raw = fs.readFileSync(PID_FILE, 'utf8').trim()
  const pid = Number(raw)
  return Number.isFinite(pid) && pid > 0 ? pid : null
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function start(): Promise<void> {
  const existing = readPid()
  if (existing && isAlive(existing)) {
    console.log(`already running (pid=${existing}); log=${LOG_FILE}`)
    return
  }

  const out = fs.openSync(LOG_FILE, 'w')
  const child = spawn('pnpm', ['dev'], {
    cwd: process.cwd(),
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, PORT },
  })
  if (!child.pid) throw new Error('failed to spawn pnpm dev')
  fs.writeFileSync(PID_FILE, String(child.pid), 'utf8')
  child.unref()
  console.log(`started (pid=${child.pid}); log=${LOG_FILE}`)
}

async function waitReady(): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/auth/status`)
      if (res.ok) {
        console.log(`ready at ${BASE_URL}`)
        return
      }
    } catch {
      // not yet listening
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(
    `dev server did not become ready within ${READY_TIMEOUT_MS}ms (log: ${LOG_FILE})`,
  )
}

async function stop(): Promise<void> {
  const pid = readPid()
  if (!pid) {
    console.log('not running (no pid file)')
    return
  }
  if (!isAlive(pid)) {
    console.log(`stale pid file (pid=${pid} not alive); cleaning up`)
    fs.rmSync(PID_FILE, { force: true })
    return
  }
  // Kill the process group — pnpm spawns next dev which spawns more children.
  try {
    process.kill(-pid, 'SIGTERM')
  } catch {
    // group may not exist; fall through to direct kill
  }
  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    // already gone
  }
  for (let i = 0; i < 20; i++) {
    if (!isAlive(pid)) break
    await new Promise((r) => setTimeout(r, 100))
  }
  if (isAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // group already gone
    }
    try {
      process.kill(pid, 'SIGKILL')
    } catch {
      // already gone
    }
  }
  fs.rmSync(PID_FILE, { force: true })
  console.log(`stopped (pid=${pid})`)
}

function status(): void {
  const pid = readPid()
  if (!pid) {
    console.log('not running')
    return
  }
  if (!isAlive(pid)) {
    console.log(`stale pid=${pid} (process not alive)`)
    return
  }
  console.log(`running (pid=${pid}); log=${LOG_FILE}`)
}

const cmd = process.argv[2]
const handlers: Record<string, () => Promise<void> | void> = {
  start,
  'wait-ready': waitReady,
  stop,
  status,
}
const handler = handlers[cmd]
if (!handler) {
  console.error('Usage: dev-server.ts <start|wait-ready|stop|status>')
  process.exit(2)
}

Promise.resolve(handler()).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
