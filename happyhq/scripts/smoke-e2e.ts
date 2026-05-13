#!/usr/bin/env npx tsx
/**
 * Golden-path smoke test — exercises the task plan→work loop end-to-end
 * against a real dev server, real browser, real Claude SDK call.
 *
 *   pnpm smoke:e2e            # headless
 *   pnpm smoke:e2e --headed   # visible chromium (debugging)
 *
 * Boots a fresh Next dev server with HAPPYHQ_ROOT pointed at a per-run
 * /tmp/happyhq-smoke-<uuid>, pre-seeds a synthetic stream (playbook + spec),
 * drives Chromium through the task creation flow, then triggers planning
 * and working iterations via the API and asserts the produced artifacts.
 *
 * Run from the happyhq/ directory.
 *
 * See `.dev/exercising-the-ui.md` for the Playwright pitfalls this respects
 * (networkidle lies in dev mode, first-compile is slow, hidden file inputs).
 */

import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { chromium } from 'playwright'

import { writeDataRootMarker } from '../lib/fs/data-root.server'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.SMOKE_PORT || '3457'
const BASE_URL = `http://localhost:${PORT}`
const HEADED = process.argv.includes('--headed')
const ITERATION_TIMEOUT_MS = 180_000
const FIXTURE_DIR = path.join(process.cwd(), 'scripts', 'smoke-fixtures')
const SMOKE_ROOT = path.join(
  os.tmpdir(),
  `happyhq-smoke-${crypto.randomUUID()}`,
)
const STREAM_SLUG = 'smoke'
// generateTaskSlug appends `-<9-char Crockford Base32>` to the kebab title.
// The browser-driven flow types "smoke task", so the created directory
// matches `smoke-task-<suffix>` — discovered post-create rather than known
// up front.
const TASK_SLUG_PATTERN = /^smoke-task-[0-9a-z]+$/i

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const START = Date.now()

function log(stage: string, detail?: string): void {
  const elapsed = ((Date.now() - START) / 1000).toFixed(1).padStart(5)
  console.log(`[smoke +${elapsed}s] ${stage}${detail ? ` — ${detail}` : ''}`)
}

class SmokeError extends Error {}

function fail(stage: string, message: string): never {
  throw new SmokeError(`${stage}: ${message}`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function seedFixtures(): void {
  fs.mkdirSync(SMOKE_ROOT, { recursive: true, mode: 0o700 })
  writeDataRootMarker(SMOKE_ROOT)

  const streamDir = path.join(SMOKE_ROOT, STREAM_SLUG)
  fs.mkdirSync(path.join(streamDir, 'specs'), { recursive: true })

  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'playbook.md'),
    path.join(streamDir, 'playbook.md'),
  )
  fs.copyFileSync(
    path.join(FIXTURE_DIR, 'spec-haiku.md'),
    path.join(streamDir, 'specs', 'haiku.md'),
  )

  // git init + initial commit so commitGitState() doesn't warn its way
  // through every server action. Errors are silent on purpose — git absence
  // is not a smoke failure.
  try {
    execFileSync('git', ['init', '-q'], { cwd: SMOKE_ROOT, stdio: 'pipe' })
    execFileSync(
      'git',
      ['-c', 'user.name=smoke', '-c', 'user.email=smoke@local', 'add', '-A'],
      { cwd: SMOKE_ROOT, stdio: 'pipe' },
    )
    execFileSync(
      'git',
      [
        '-c',
        'user.name=smoke',
        '-c',
        'user.email=smoke@local',
        'commit',
        '-q',
        '-m',
        'seed',
      ],
      { cwd: SMOKE_ROOT, stdio: 'pipe' },
    )
  } catch {
    // git absent or misconfigured — fine.
  }

  log('fixtures seeded', SMOKE_ROOT)
}

// ---------------------------------------------------------------------------
// Dev server lifecycle (delegated to scripts/dev-server.ts)
// ---------------------------------------------------------------------------

function devServer(action: 'start' | 'wait-ready' | 'stop'): void {
  const result = spawnSync('npx', ['tsx', 'scripts/dev-server.ts', action], {
    cwd: process.cwd(),
    env: { ...process.env, HAPPYHQ_ROOT: SMOKE_ROOT, PORT },
    stdio: 'inherit',
    timeout: action === 'wait-ready' ? 120_000 : 30_000,
  })
  if (result.status !== 0) {
    throw new Error(`dev-server ${action} exited with status ${result.status}`)
  }
}

// ---------------------------------------------------------------------------
// Browser flow — task creation via the real UI
// ---------------------------------------------------------------------------

async function createTaskViaUI(): Promise<string> {
  const browser = await chromium.launch({ headless: !HEADED })
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const page = await ctx.newPage()
    page.setDefaultTimeout(20_000)
    page.setDefaultNavigationTimeout(90_000)

    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.type() === 'warning') {
        log(`browser ${msg.type()}`, msg.text().slice(0, 300))
      }
    })
    page.on('pageerror', (err) => {
      log('browser pageerror', err.message.slice(0, 300))
    })
    page.on('requestfailed', (req) => {
      log('browser requestfailed', `${req.method()} ${req.url()}`)
    })

    const url = `${BASE_URL}/tasks/${STREAM_SLUG}`
    log('navigating', url)
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    // Title is set from generateMetadata after the route compiles —
    // a reliable post-compile signal in Next dev mode. First compile in
    // dev mode can take 30+s, so we override the default timeout here.
    try {
      await page.waitForFunction(
        () => document.title.toLowerCase().includes('smoke'),
        null,
        { timeout: 90_000 },
      )
    } catch {
      const actualTitle = await page.title().catch(() => '<unknown>')
      const failedUrl = page.url()
      const screenshotPath = path.join(SMOKE_ROOT, 'failure.png')
      await page
        .screenshot({ path: screenshotPath, fullPage: true })
        .catch(() => undefined)
      fail(
        'page load',
        `title check timed out. url=${failedUrl} title="${actualTitle}" screenshot=${screenshotPath} (saved before cleanup)`,
      )
    }

    log('typing task title')
    const titleInput = page.getByPlaceholder('New task').first()
    await titleInput.click()
    await page.keyboard.type('smoke task')

    log('typing task description')
    await page
      .getByPlaceholder('Add context')
      .first()
      .fill('Write a haiku inspired by the attached notes.')

    log('attaching input file')
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles(path.join(FIXTURE_DIR, 'input.txt'))

    // Wait for the file row to render — `displayTitle` capitalises the
    // filename, so "input.txt" shows up as "Input.txt".
    await page
      .getByRole('button', { name: /input\.txt$/i })
      .waitFor({ timeout: 5_000 })

    log('clicking Add task')
    await page.getByRole('button', { name: /add task/i }).click()

    // handleSubmit writes task.md first, then iterates stagedFiles and
    // calls ingestTaskInput per file. Both are sequential awaits, so the
    // inputs directory is the right "task creation done" signal.
    log('waiting for task and inputs to land on disk')
    const tasksRoot = path.join(SMOKE_ROOT, 'tasks')
    const deadline = Date.now() + 30_000
    let taskSlug: string | undefined
    while (taskSlug === undefined) {
      if (fs.existsSync(tasksRoot)) {
        for (const entry of fs.readdirSync(tasksRoot)) {
          if (!TASK_SLUG_PATTERN.test(entry)) continue
          const taskDir = path.join(tasksRoot, entry)
          const inputsDir = path.join(taskDir, 'inputs')
          if (
            fs.existsSync(path.join(taskDir, 'task.md')) &&
            fs.existsSync(inputsDir) &&
            fs.readdirSync(inputsDir).length > 0
          ) {
            taskSlug = entry
            break
          }
        }
      }
      if (taskSlug === undefined) {
        if (Date.now() > deadline) {
          const candidates = fs.existsSync(tasksRoot)
            ? fs.readdirSync(tasksRoot)
            : []
          fail(
            'createTask',
            `no smoke-task-* directory with task.md + populated inputs/ landed; candidates=[${candidates.join(',')}]`,
          )
        }
        await sleep(500)
      }
    }
    const inputsDir = path.join(tasksRoot, taskSlug, 'inputs')
    log(
      'task created with inputs',
      `${taskSlug} → ${fs.readdirSync(inputsDir).join(', ')}`,
    )
    return taskSlug
  } finally {
    await browser.close()
  }
}

// ---------------------------------------------------------------------------
// Run iterations via API
// ---------------------------------------------------------------------------

async function runIteration(
  mode: 'planning' | 'working',
  taskSlug: string,
): Promise<void> {
  log(`POST /api/run/start ${mode}`)
  const startRes = await fetch(`${BASE_URL}/api/run/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: taskSlug, stream: STREAM_SLUG, mode }),
  })
  if (!startRes.ok) {
    fail(
      `run.start (${mode})`,
      `${startRes.status} ${(await startRes.text()).slice(0, 300)}`,
    )
  }

  // /api/run/active returns 200 with `null` body when no run is active —
  // never 404. Poll until the body is null.
  const deadline = Date.now() + ITERATION_TIMEOUT_MS
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE_URL}/api/run/active`)
    if (!r.ok) {
      fail(
        `run.active (${mode})`,
        `${r.status} ${(await r.text()).slice(0, 200)}`,
      )
    }
    const info = (await r.json()) as { stream: string; task: string } | null
    if (info === null) {
      log(`${mode} done`, `${((Date.now() - START) / 1000).toFixed(1)}s total`)
      return
    }
    await sleep(2_000)
  }
  fail(`run.${mode}`, `did not finish within ${ITERATION_TIMEOUT_MS / 1000}s`)
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

function assertOutputs(taskSlug: string): void {
  const taskDir = path.join(SMOKE_ROOT, 'tasks', taskSlug)

  const planMd = path.join(taskDir, 'plan.md')
  if (!fs.existsSync(planMd)) fail('assertions', 'plan.md missing')
  const planText = fs.readFileSync(planMd, 'utf8').trim()
  if (!planText) fail('assertions', 'plan.md empty')
  log('plan.md OK', `${planText.length} chars`)

  const outputsDir = path.join(taskDir, 'outputs')
  if (!fs.existsSync(outputsDir)) fail('assertions', 'outputs/ missing')
  const outputs = fs.readdirSync(outputsDir).filter((f) => f.endsWith('.md'))
  if (outputs.length === 0) fail('assertions', 'no .md files in outputs/')

  for (const f of outputs) {
    const content = fs.readFileSync(path.join(outputsDir, f), 'utf8').trim()
    if (!content) fail('assertions', `outputs/${f} empty`)
    const lines = content.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length < 3) {
      fail(
        'assertions',
        `outputs/${f} has fewer than 3 non-empty lines (got ${lines.length})`,
      )
    }
  }
  log('outputs OK', outputs.join(', '))
}

function assertNoErrors(): void {
  const today = new Date()
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  const logFile = path.join(SMOKE_ROOT, '.logs', `${y}-${m}-${d}.jsonl`)

  if (!fs.existsSync(logFile)) {
    log('logs', 'no log file produced (skipping error scan)')
    return
  }

  const ERROR_EVENTS = new Set([
    'run.error',
    'api.error',
    'client.error',
    'client.unhandled_rejection',
    'client.react.error',
    'client.react.render_error',
  ])

  const errors: { event: string; line: number }[] = []
  const lines = fs.readFileSync(logFile, 'utf8').split('\n')
  lines.forEach((line, i) => {
    if (!line.trim()) return
    try {
      const entry = JSON.parse(line)
      if (typeof entry.event === 'string' && ERROR_EVENTS.has(entry.event)) {
        errors.push({ event: entry.event, line: i + 1 })
      }
    } catch {
      // ignore malformed lines
    }
  })

  if (errors.length > 0) {
    const summary = errors
      .slice(0, 5)
      .map((e) => `${e.event}@${e.line}`)
      .join(', ')
    fail('logs', `${errors.length} error event(s): ${summary}`)
  }
  log('logs clean', `${lines.length} entries scanned`)
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

let stopped = false
function stopServer(): void {
  if (stopped) return
  stopped = true
  try {
    devServer('stop')
  } catch {
    // best-effort
  }
}

process.on('SIGINT', () => {
  stopServer()
  console.log(`\n[smoke] interrupted; smoke root preserved: ${SMOKE_ROOT}`)
  process.exit(130)
})
process.on('SIGTERM', () => {
  stopServer()
  process.exit(143)
})

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log('start', `port=${PORT} root=${SMOKE_ROOT} headed=${HEADED}`)
  let success = false
  try {
    seedFixtures()
    devServer('start')
    devServer('wait-ready')
    const taskSlug = await createTaskViaUI()
    await runIteration('planning', taskSlug)
    await runIteration('working', taskSlug)
    assertOutputs(taskSlug)
    assertNoErrors()
    log('PASS')
    success = true
  } finally {
    stopServer()
    if (success) {
      try {
        fs.rmSync(SMOKE_ROOT, { recursive: true, force: true })
      } catch {
        // best-effort
      }
    } else {
      console.log(`[smoke] smoke root preserved for debugging: ${SMOKE_ROOT}`)
    }
  }
}

main().catch((err) => {
  if (err instanceof SmokeError) {
    console.error(`\n[smoke FAIL] ${err.message}`)
  } else {
    console.error(
      '\n[smoke] crashed:',
      err instanceof Error ? err.stack : String(err),
    )
  }
  process.exit(1)
})
