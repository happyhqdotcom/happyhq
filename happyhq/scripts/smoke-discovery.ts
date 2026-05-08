#!/usr/bin/env npx tsx
/**
 * Discovery smoke — exercises the heads-up Discovery phase end-to-end against
 * a real dev server, real Claude SDK call. Three scenarios:
 *
 *   1. Silent proceed — rich task; discovery transitions to planning without
 *      surfacing any question UI. PhaseRecord with `phase: 'discovery'` lands
 *      in `.run.json`.
 *
 *   2. Asks + integrates — thin task; discovery surfaces `pendingQuestions`,
 *      smoke programmatically POSTs `/api/run/answer`, planning runs against
 *      enriched task.md (a `## Discovery` section is appended).
 *
 *   3. Restart from plan — after Scenario 2 reaches plan_ready, restart with
 *      `mode: 'planning'`. `## Discovery` section is preserved; plan.md is
 *      regenerated.
 *
 * Usage:
 *   pnpm smoke:discovery               # all scenarios
 *   pnpm smoke:discovery --only=1      # one scenario
 *
 * Boots a fresh Next dev server with HAPPYHQ_ROOT pointed at a per-run
 * /tmp/happyhq-smoke-discovery-<uuid>, pre-seeds the email-intros stream
 * fixtures and the two task fixtures, then drives the API directly. Each
 * scenario uses a separate task slug, so they share one HAPPYHQ_ROOT but
 * never collide.
 *
 * NOTE: This makes real Opus calls — each run costs real dollars. CI gates
 * by changed-paths so it only runs on PRs touching the discovery surface
 * (prompts/discovery.md, lib/agents/config.server.ts, lib/run/loop.server.ts).
 *
 * Run from the happyhq/ directory.
 */

import { execFileSync, spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const PORT = process.env.SMOKE_PORT || '3458'
const BASE_URL = `http://localhost:${PORT}`
const PHASE_TIMEOUT_MS = 240_000
const QUESTION_TIMEOUT_MS = 120_000
const FIXTURE_DIR = path.join(
  process.cwd(),
  'scripts',
  'smoke-fixtures',
  'discovery',
)
const STREAM_FIXTURE_DIR = path.join(FIXTURE_DIR, 'email-intros')
const TASKS_FIXTURE_DIR = path.join(FIXTURE_DIR, 'tasks')
const SMOKE_ROOT = path.join(
  os.tmpdir(),
  `happyhq-smoke-discovery-${crypto.randomUUID()}`,
)
const STREAM_SLUG = 'email-intros'
const ONLY = (() => {
  const arg = process.argv.find((a) => a.startsWith('--only='))
  return arg ? arg.slice('--only='.length) : null
})()

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const START = Date.now()

function log(stage: string, detail?: string): void {
  const elapsed = ((Date.now() - START) / 1000).toFixed(1).padStart(5)
  console.log(
    `[smoke-discovery +${elapsed}s] ${stage}${detail ? ` — ${detail}` : ''}`,
  )
}

class SmokeError extends Error {}

function fail(stage: string, message: string): never {
  throw new SmokeError(`${stage}: ${message}`)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function copyDirSync(from: string, to: string): void {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name)
    const dst = path.join(to, entry.name)
    if (entry.isDirectory()) copyDirSync(src, dst)
    else fs.copyFileSync(src, dst)
  }
}

function seedFixtures(): void {
  fs.mkdirSync(SMOKE_ROOT, { recursive: true, mode: 0o700 })

  // Stream fixture (playbook + spec + sample) → ${SMOKE_ROOT}/${STREAM_SLUG}/
  copyDirSync(STREAM_FIXTURE_DIR, path.join(SMOKE_ROOT, STREAM_SLUG))

  // Initial commit — commitGitState() in the run loop assumes a git repo
  // already exists; without one it would warn its way through every phase.
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
    // git absent — fine, smoke still proceeds.
  }

  log('fixtures seeded', SMOKE_ROOT)
}

// Seeds a task by copying one of the task fixtures into ${SMOKE_ROOT}/tasks/${slug}/task.md.
// Tasks are per-scenario so multiple runs in one smoke don't collide.
function seedTask(fixtureName: string, slug: string): void {
  const src = path.join(TASKS_FIXTURE_DIR, fixtureName)
  const dstDir = path.join(SMOKE_ROOT, 'tasks', slug)
  fs.mkdirSync(dstDir, { recursive: true })
  fs.copyFileSync(src, path.join(dstDir, 'task.md'))
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
// API helpers
// ---------------------------------------------------------------------------

interface RunInfoLike {
  status: string
  stoppedDuring?: string
  stopReason?: string
  pendingQuestions?: Array<{
    question: string
    header: string
    options: Array<{ label: string; description: string }>
    multiSelect: boolean
  }>
  phases?: Array<{ phase: string; sessionId?: string; durationMs?: number }>
}

function readRunInfo(slug: string): RunInfoLike | null {
  const file = path.join(SMOKE_ROOT, 'tasks', slug, '.run.json')
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf8')) as RunInfoLike
}

function readTaskMd(slug: string): string {
  return fs.readFileSync(
    path.join(SMOKE_ROOT, 'tasks', slug, 'task.md'),
    'utf8',
  )
}

async function startRun(
  slug: string,
  mode: 'discovery' | 'planning' | 'working',
): Promise<void> {
  log(`POST /api/run/start ${mode}`, slug)
  const res = await fetch(`${BASE_URL}/api/run/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ task: slug, stream: STREAM_SLUG, mode }),
  })
  if (!res.ok) {
    fail(
      `run.start (${mode}, ${slug})`,
      `${res.status} ${(await res.text()).slice(0, 300)}`,
    )
  }
}

// Polls .run.json until the predicate is true or the deadline expires.
// Returns the matching RunInfo. Reads disk because disk is the authoritative
// source of truth — SSE events would also work but the polling approach is
// simpler for a one-shot smoke.
async function waitForRun(
  slug: string,
  predicate: (info: RunInfoLike) => boolean,
  timeoutMs: number,
  description: string,
): Promise<RunInfoLike> {
  const deadline = Date.now() + timeoutMs
  let last: RunInfoLike | null = null
  while (Date.now() < deadline) {
    const info = readRunInfo(slug)
    if (info) last = info
    if (info && predicate(info)) return info
    await sleep(1_000)
  }
  fail(
    `waitForRun (${slug})`,
    `${description} not satisfied within ${timeoutMs / 1000}s; last status=${last?.status ?? 'no .run.json'}`,
  )
}

async function pollRunIdle(slug: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const r = await fetch(`${BASE_URL}/api/run/active`)
    if (!r.ok) {
      fail(
        `run.active (${slug})`,
        `${r.status} ${(await r.text()).slice(0, 200)}`,
      )
    }
    const body = (await r.json()) as { stream: string; task: string } | null
    if (body === null) return
    await sleep(2_000)
  }
  fail(`run.idle (${slug})`, `did not finish within ${timeoutMs / 1000}s`)
}

async function answerQuestions(
  questions: NonNullable<RunInfoLike['pendingQuestions']>,
): Promise<void> {
  // For each question, pick the first option's label. The smoke verifies
  // plumbing (question UI → answer endpoint → discovery completes → planning
  // runs), not specific answer content. Discovery's prompt synthesizes from
  // whatever answers come back.
  const answers: Record<string, string> = {}
  for (const q of questions) {
    const first = q.options[0]
    if (!first) fail('answerQuestions', `question "${q.header}" has no options`)
    answers[q.header] = first.label
  }
  log('POST /api/run/answer', JSON.stringify(answers))
  const res = await fetch(`${BASE_URL}/api/run/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  if (!res.ok) {
    fail('run.answer', `${res.status} ${(await res.text()).slice(0, 300)}`)
  }
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

async function scenario1Silent(): Promise<void> {
  const slug = 'rich-intro'
  log('=== Scenario 1: silent proceed (rich task)')
  seedTask('rich-intro.md', slug)

  await startRun(slug, 'discovery')

  // Wait until the run is idle (discovery → planning → plan_ready). This is
  // the cleanest "everything done" signal for the silent-proceed case.
  await pollRunIdle(slug, PHASE_TIMEOUT_MS * 2)

  const final = readRunInfo(slug)
  if (!final) fail('scenario1', '.run.json missing after run')
  if (final.status !== 'plan_ready') {
    fail(
      'scenario1',
      `expected status=plan_ready, got ${final.status} (stoppedDuring=${final.stoppedDuring}, stopReason=${final.stopReason})`,
    )
  }

  // PhaseRecord assertions — discovery ran, planning ran, both have sessionIds.
  const phases = final.phases ?? []
  const discoveryPhase = phases.find((p) => p.phase === 'discovery')
  if (!discoveryPhase)
    fail('scenario1', 'no discovery PhaseRecord in .run.json')
  if (!discoveryPhase.sessionId)
    fail('scenario1', 'discovery phase missing sessionId')
  if (!discoveryPhase.durationMs || discoveryPhase.durationMs <= 0) {
    fail(
      'scenario1',
      `discovery phase durationMs=${discoveryPhase.durationMs} (expected > 0)`,
    )
  }
  const planningPhase = phases.find((p) => p.phase === 'planning')
  if (!planningPhase)
    fail('scenario1', 'no planning PhaseRecord (planning never ran)')

  // Question UI was never surfaced — pendingQuestions stayed unset throughout.
  if (final.pendingQuestions) {
    fail('scenario1', `pendingQuestions still set on completed run`)
  }

  // plan.md exists.
  const planMd = path.join(SMOKE_ROOT, 'tasks', slug, 'plan.md')
  if (!fs.existsSync(planMd)) fail('scenario1', 'plan.md missing')
  const planText = fs.readFileSync(planMd, 'utf8').trim()
  if (!planText) fail('scenario1', 'plan.md empty')

  log(
    'scenario 1 PASS',
    `discovery=${discoveryPhase.durationMs}ms, plan.md=${planText.length} chars`,
  )
}

async function scenario2Asks(): Promise<void> {
  const slug = 'thin-intro'
  log('=== Scenario 2: asks + integrates (thin task)')
  seedTask('thin-intro.md', slug)

  await startRun(slug, 'discovery')

  // Wait for pendingQuestions to land on disk OR for the run to finish without
  // questions (in which case the calibration heuristic chose to proceed).
  const blocked = await waitForRun(
    slug,
    (info) =>
      (info.status === 'discovering' &&
        (info.pendingQuestions?.length ?? 0) > 0) ||
      info.status === 'planning' ||
      info.status === 'plan_ready' ||
      info.status === 'stopped',
    QUESTION_TIMEOUT_MS,
    'pendingQuestions or terminal state',
  )

  if (!blocked.pendingQuestions || blocked.pendingQuestions.length === 0) {
    fail(
      'scenario2',
      `discovery proceeded without asking (status=${blocked.status}). The thin-intro fixture should provoke at least one question — if the prompt now considers it sufficient, tighten the fixture or update the spec.`,
    )
  }

  log(
    'pendingQuestions surfaced',
    `${blocked.pendingQuestions.length} question(s): ${blocked.pendingQuestions.map((q) => q.header).join(', ')}`,
  )

  // Submit answers via API. canUseTool clears pendingQuestions on disk after
  // resolving, then continues the SDK session.
  await answerQuestions(blocked.pendingQuestions)

  // Wait for plan_ready.
  await pollRunIdle(slug, PHASE_TIMEOUT_MS * 2)

  const final = readRunInfo(slug)
  if (!final) fail('scenario2', '.run.json missing after run')
  if (final.status !== 'plan_ready') {
    fail(
      'scenario2',
      `expected status=plan_ready, got ${final.status} (stoppedDuring=${final.stoppedDuring})`,
    )
  }

  // pendingQuestions cleared after answer.
  if (final.pendingQuestions) {
    fail('scenario2', 'pendingQuestions still set after answer')
  }

  // task.md should now contain a ## Discovery section.
  const taskMdContent = readTaskMd(slug)
  if (!/^##\s+Discovery\b/m.test(taskMdContent)) {
    fail(
      'scenario2',
      `task.md missing ## Discovery section after enrichment.\n\n--- task.md ---\n${taskMdContent.slice(0, 800)}`,
    )
  }

  // PhaseRecords for both discovery and planning.
  const phases = final.phases ?? []
  if (!phases.find((p) => p.phase === 'discovery')) {
    fail('scenario2', 'no discovery PhaseRecord')
  }
  if (!phases.find((p) => p.phase === 'planning')) {
    fail('scenario2', 'no planning PhaseRecord')
  }

  // plan.md exists.
  const planMd = path.join(SMOKE_ROOT, 'tasks', slug, 'plan.md')
  if (!fs.existsSync(planMd)) fail('scenario2', 'plan.md missing')

  log(
    'scenario 2 PASS',
    `## Discovery section: ${taskMdContent.match(/##\s+Discovery[\s\S]*$/m)?.[0].slice(0, 120) ?? '(empty)'}`,
  )
}

async function scenario3Restart(): Promise<void> {
  const slug = 'thin-intro'
  log('=== Scenario 3: restart from plan preserves ## Discovery')

  // Pre-condition: scenario 2 must have left task.md with ## Discovery and
  // status: plan_ready. If scenario 2 was skipped (--only=3), bail.
  const before = readRunInfo(slug)
  if (!before || before.status !== 'plan_ready') {
    fail(
      'scenario3',
      `expected scenario 2 to leave status=plan_ready, found ${before?.status ?? 'no run'}`,
    )
  }
  const taskMdBefore = readTaskMd(slug)
  if (!/^##\s+Discovery\b/m.test(taskMdBefore)) {
    fail(
      'scenario3',
      'precondition: task.md should already contain ## Discovery',
    )
  }
  const discoverySectionBefore =
    taskMdBefore.match(/##\s+Discovery[\s\S]*$/m)?.[0] ?? ''

  // Re-run planning. Server cleanup deletes plan.md (and clears working/outputs)
  // but leaves task.md alone — so the ## Discovery section persists.
  await startRun(slug, 'planning')
  await pollRunIdle(slug, PHASE_TIMEOUT_MS * 2)

  const taskMdAfter = readTaskMd(slug)
  if (!/^##\s+Discovery\b/m.test(taskMdAfter)) {
    fail(
      'scenario3',
      `## Discovery section was wiped by restart. Was: "${discoverySectionBefore.slice(0, 120)}"`,
    )
  }

  const planMd = path.join(SMOKE_ROOT, 'tasks', slug, 'plan.md')
  if (!fs.existsSync(planMd)) fail('scenario3', 'plan.md missing after restart')
  if (!fs.readFileSync(planMd, 'utf8').trim())
    fail('scenario3', 'plan.md empty after restart')

  const after = readRunInfo(slug)
  if (after?.status !== 'plan_ready') {
    fail('scenario3', `expected plan_ready after restart, got ${after?.status}`)
  }

  log('scenario 3 PASS', '## Discovery preserved; plan.md regenerated')
}

// ---------------------------------------------------------------------------
// Error scan
// ---------------------------------------------------------------------------

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
      // ignore
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
  console.log(
    `\n[smoke-discovery] interrupted; smoke root preserved: ${SMOKE_ROOT}`,
  )
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
  log('start', `port=${PORT} root=${SMOKE_ROOT} only=${ONLY ?? 'all'}`)
  let success = false
  try {
    seedFixtures()
    devServer('start')
    devServer('wait-ready')

    if (ONLY === null || ONLY === '1') await scenario1Silent()
    if (ONLY === null || ONLY === '2' || ONLY === '3') await scenario2Asks()
    if (ONLY === null || ONLY === '3') await scenario3Restart()

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
      console.log(
        `[smoke-discovery] smoke root preserved for debugging: ${SMOKE_ROOT}`,
      )
    }
  }
}

main().catch((err) => {
  if (err instanceof SmokeError) {
    console.error(`\n[smoke-discovery FAIL] ${err.message}`)
  } else {
    console.error(
      '\n[smoke-discovery] crashed:',
      err instanceof Error ? err.stack : String(err),
    )
  }
  process.exit(1)
})
