#!/usr/bin/env npx tsx
/**
 * Exercise Harness — drives the running HappyHQ app through Playwright with
 * filesystem state isolated to a sandbox HAPPYHQ_ROOT. Captures artifacts
 * (DOM, console, network, logs, wire events) into <root>/.exercises/<id>/.
 *
 * See specs/playground.md "Exercise Harness".
 *
 * Usage:
 *   pnpm tsx scripts/exercise.ts \
 *     --root /tmp/exercise-XYZ \           # sets HAPPYHQ_ROOT for spawned dev server
 *     --script scripts/exercises/<x>.ts    # what to do once the page is up
 *     [--id <id>]                          # exercise id (default: ex-<8hex>)
 *     [--port <n>]                         # dev-server port (default: free port)
 *     [--keep | --no-keep]                 # keep the sandbox after exit (default: keep)
 *
 * Exit codes:
 *   0  — script.run() returned cleanly
 *   1  — script.run() threw
 *   2  — dev server didn't become ready before timeout
 *   3  — internal harness error (browser launch, etc.)
 */

import { spawn, type ChildProcess } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

import {
  chromium,
  type Browser,
  type ConsoleMessage,
  type Page,
  type Request,
  type Response,
} from 'playwright'

import { createDump, type DumpHelper } from '@/lib/exercise/dump'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExerciseContext {
  page: Page
  dump: DumpHelper
  root: string
  baseUrl: string
}

export interface ExerciseScript {
  run(ctx: ExerciseContext): Promise<void> | void
}

interface Args {
  root?: string
  script: string
  id: string
  port?: number
  keep: boolean
}

interface ConsoleRecord {
  t: string
  level: string
  text: string
  url?: string
  lineNumber?: number
}

interface NetworkRecord {
  t: string
  phase: 'request' | 'response' | 'requestfailed'
  method: string
  url: string
  status?: number
  statusText?: string
  failure?: string
}

interface MetaJson {
  id: string
  script: string
  root: string
  port: number
  baseUrl: string
  started: number
  ended: number
  durationMs: number
  exit: number
  error?: { message: string; stack?: string }
  runIds: string[]
}

const READY_TIMEOUT_MS = 60_000
const READY_POLL_MS = 250
const TEARDOWN_GRACE_MS = 2_000

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { keep: true }
  let i = 0
  while (i < argv.length) {
    const a = argv[i]
    const eq = a.indexOf('=')
    const key = eq === -1 ? a : a.slice(0, eq)
    const inlineValue = eq === -1 ? undefined : a.slice(eq + 1)
    const consume = (): string => {
      if (inlineValue !== undefined) return inlineValue
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        bail(`missing value for ${key}`)
      }
      i++
      return next
    }
    switch (key) {
      case '--root':
        args.root = consume()
        break
      case '--script':
        args.script = consume()
        break
      case '--id':
        args.id = consume()
        break
      case '--port':
        args.port = Number(consume())
        if (!Number.isFinite(args.port) || args.port <= 0) {
          bail('--port must be a positive integer')
        }
        break
      case '--keep':
        args.keep = true
        break
      case '--no-keep':
        args.keep = false
        break
      case '--help':
      case '-h':
        printUsage()
        process.exit(0)
      default:
        bail(`unknown argument: ${a}`)
    }
    i++
  }
  if (!args.script) bail('--script is required')
  if (!args.id) args.id = `ex-${crypto.randomBytes(4).toString('hex')}`
  // --root may be empty here; main() resolves the default via fs.mkdtemp
  // so the sandbox dir is created atomically with mode 0700 instead of
  // string-joining a predictable name into os.tmpdir().
  // Validate id segment shape — gates the path interpolation downstream.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(args.id)) {
    bail(`invalid --id: ${args.id}`)
  }
  return args as Args
}

function printUsage(): void {
  console.log(`Usage: pnpm tsx scripts/exercise.ts [options]

Options:
  --root <dir>      HAPPYHQ_ROOT for the spawned dev server
                    (default: $TMPDIR/happyhq-exercise-<id>)
  --script <path>   Exercise script (TypeScript module exporting run())
  --id <id>         Exercise id (default: ex-<8hex>)
  --port <n>        Dev-server port (default: pick a free port)
  --keep            Keep the sandbox after exit (default)
  --no-keep         Remove the sandbox after exit
  --help            Show this help`)
}

function bail(msg: string): never {
  console.error(`exercise: ${msg}`)
  console.error('Run with --help for usage.')
  process.exit(3)
}

// ---------------------------------------------------------------------------
// Free-port discovery
// ---------------------------------------------------------------------------

async function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.unref()
    srv.on('error', reject)
    srv.listen(0, () => {
      const addr = srv.address()
      if (typeof addr !== 'object' || addr === null) {
        srv.close()
        reject(new Error('failed to acquire free port'))
        return
      }
      const port = addr.port
      srv.close(() => resolve(port))
    })
  })
}

// ---------------------------------------------------------------------------
// Dev server lifecycle
// ---------------------------------------------------------------------------

interface DevServer {
  child: ChildProcess
  baseUrl: string
  port: number
  serverLog: string // path to the log file
  shuttingDown: { value: boolean }
}

async function startDevServer(
  root: string,
  port: number,
  exDir: string,
): Promise<DevServer> {
  const baseUrl = `http://localhost:${port}`
  const serverLog = path.join(exDir, 'server.log')
  // Run from the happyhq/ workspace dir, matching the other scripts'
  // convention (smoke-test.ts, read-logs.ts).
  const cwd = process.cwd()
  const logFh = await fs.open(serverLog, 'w')
  const child = spawn('pnpm', ['next', 'dev', '--port', String(port)], {
    cwd,
    env: {
      ...process.env,
      HAPPYHQ_ROOT: root,
      PORT: String(port),
      // Force the dev server out of any pre-existing run-loop state.
      NODE_ENV: 'development',
    },
    stdio: ['ignore', logFh.fd, logFh.fd],
  })
  // Closing our handle to the file is fine — the child process keeps it open.
  await logFh.close()

  // Diagnostic only — silenced once the harness has begun teardown so the
  // expected SIGTERM during stopDevServer() doesn't show up as a warning.
  const shuttingDown = { value: false }
  child.on('exit', (code, signal) => {
    if (shuttingDown.value) return
    if (code !== null && code !== 0) {
      console.error(`dev server exited early with code ${code}`)
    } else if (signal) {
      console.error(`dev server killed by signal ${signal}`)
    }
  })

  return { child, baseUrl, port, serverLog, shuttingDown }
}

async function waitForReady(baseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  let lastErr: unknown = null
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/api/auth/status`)
      if (res.ok) return
      lastErr = new Error(`status ${res.status}`)
    } catch (err) {
      lastErr = err
    }
    await sleep(READY_POLL_MS)
  }
  throw new Error(
    `dev server not ready within ${READY_TIMEOUT_MS}ms (last error: ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    })`,
  )
}

async function stopDevServer(server: DevServer): Promise<void> {
  const child = server.child
  server.shuttingDown.value = true
  if (child.exitCode !== null || child.killed) return
  child.kill('SIGTERM')
  // Give the child a moment to exit cleanly; if not, SIGKILL.
  const exited = await Promise.race([
    new Promise<true>((resolve) => child.once('exit', () => resolve(true))),
    sleep(TEARDOWN_GRACE_MS).then(() => false as const),
  ])
  if (!exited) {
    child.kill('SIGKILL')
    await new Promise<void>((resolve) => child.once('exit', () => resolve()))
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Slice helpers
// ---------------------------------------------------------------------------

async function listRunIds(runsDir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(runsDir, { withFileTypes: true })
    return entries.filter((e) => e.isDirectory()).map((e) => e.name)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw err
  }
}

/**
 * Concatenate wire.jsonl from runIds in `after \ before` into `<exDir>/wire.jsonl`,
 * separating runs with a `{"_runId": "..."}` delimiter so consumers can demux.
 * Returns the list of new runIds for meta.json.
 */
async function writeWireSlice(
  runsDir: string,
  before: Set<string>,
  after: string[],
  exDir: string,
): Promise<string[]> {
  const newRunIds = after.filter((id) => !before.has(id)).sort()
  const fh = await fs.open(path.join(exDir, 'wire.jsonl'), 'w')
  try {
    for (const runId of newRunIds) {
      await fh.appendFile(JSON.stringify({ _runId: runId }) + '\n', 'utf8')
      const wirePath = path.join(runsDir, runId, 'wire.jsonl')
      try {
        const content = await fs.readFile(wirePath, 'utf8')
        if (content.length > 0) await fh.appendFile(content, 'utf8')
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
    }
  } finally {
    await fh.close()
  }
  return newRunIds
}

function formatLogDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * Slice <root>/.logs/<date>.jsonl files for [started, ended] and write to
 * <exDir>/logs.jsonl. Reads both the start-day and end-day files when the
 * window crosses midnight.
 */
async function writeLogsSlice(
  logsDir: string,
  started: number,
  ended: number,
  exDir: string,
): Promise<void> {
  const days = new Set<string>()
  days.add(formatLogDate(new Date(started)))
  days.add(formatLogDate(new Date(ended)))
  const collected: string[] = []
  for (const day of days) {
    const file = path.join(logsDir, `${day}.jsonl`)
    let content: string
    try {
      content = await fs.readFile(file, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw err
    }
    for (const line of content.split('\n')) {
      if (!line) continue
      let entry: { t?: string }
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if (typeof entry.t !== 'string') continue
      const ts = Date.parse(entry.t)
      if (Number.isNaN(ts)) continue
      if (ts >= started && ts <= ended) collected.push(line)
    }
  }
  await fs.writeFile(
    path.join(exDir, 'logs.jsonl'),
    collected.length === 0 ? '' : collected.join('\n') + '\n',
    'utf8',
  )
}

// ---------------------------------------------------------------------------
// Browser wiring
// ---------------------------------------------------------------------------

interface BrowserHandles {
  browser: Browser
  page: Page
  consoleEvents: ConsoleRecord[]
  networkEvents: NetworkRecord[]
}

async function launchBrowser(baseUrl: string): Promise<BrowserHandles> {
  let browser: Browser
  try {
    browser = await chromium.launch()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/Executable doesn't exist|browserType\.launch/i.test(msg)) {
      throw new Error(
        `Playwright Chromium binary missing. Run:\n  pnpm exec playwright install chromium\n(installed automatically by package.json's postinstall — try \`pnpm install\`)\n\nOriginal error: ${msg}`,
      )
    }
    throw err
  }
  const context = await browser.newContext({ baseURL: baseUrl })
  const page = await context.newPage()

  const consoleEvents: ConsoleRecord[] = []
  const networkEvents: NetworkRecord[] = []

  page.on('console', (msg: ConsoleMessage) => {
    const loc = msg.location()
    consoleEvents.push({
      t: new Date().toISOString(),
      level: msg.type(),
      text: msg.text(),
      url: loc.url || undefined,
      lineNumber: loc.lineNumber,
    })
  })
  page.on('pageerror', (err: Error) => {
    consoleEvents.push({
      t: new Date().toISOString(),
      level: 'pageerror',
      text: err.stack || err.message,
    })
  })
  page.on('request', (req: Request) => {
    networkEvents.push({
      t: new Date().toISOString(),
      phase: 'request',
      method: req.method(),
      url: req.url(),
    })
  })
  page.on('response', (res: Response) => {
    networkEvents.push({
      t: new Date().toISOString(),
      phase: 'response',
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
      statusText: res.statusText(),
    })
  })
  page.on('requestfailed', (req: Request) => {
    networkEvents.push({
      t: new Date().toISOString(),
      phase: 'requestfailed',
      method: req.method(),
      url: req.url(),
      failure: req.failure()?.errorText,
    })
  })

  return { browser, page, consoleEvents, networkEvents }
}

async function writeJsonl(file: string, rows: unknown[]): Promise<void> {
  const body = rows.map((r) => JSON.stringify(r)).join('\n')
  await fs.writeFile(file, body.length === 0 ? '' : body + '\n', 'utf8')
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2))

  const rawRoot =
    args.root ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'happyhq-exercise-')))
  const root = path.resolve(rawRoot)
  const exDir = path.join(root, '.exercises', args.id)
  const runsDir = path.join(root, '.runs')
  const logsDir = path.join(root, '.logs')

  await fs.mkdir(exDir, { recursive: true })

  const port = args.port ?? (await pickFreePort())
  const scriptPath = path.resolve(args.script)

  // Verify the script exists upfront so we don't pay the dev-server start
  // cost only to fail at module load.
  try {
    await fs.access(scriptPath)
  } catch {
    console.error(`exercise: script not found: ${scriptPath}`)
    return 3
  }

  console.log(`exercise: id=${args.id} root=${root} port=${port}`)
  console.log(`exercise: script=${scriptPath}`)

  let server: DevServer | null = null
  let browser: Browser | null = null
  let exitCode = 0
  let scriptError: { message: string; stack?: string } | undefined
  const started = Date.now()
  let ended = started
  let runIds: string[] = []

  try {
    server = await startDevServer(root, port, exDir)
    try {
      await waitForReady(server.baseUrl)
    } catch (err) {
      console.error(
        `exercise: ${err instanceof Error ? err.message : String(err)}`,
      )
      console.error(`exercise: see ${server.serverLog} for dev-server output`)
      return 2
    }

    const before = new Set(await listRunIds(runsDir))

    // Dynamic import — tsx (the loader the harness runs under) handles TS.
    let scriptModule: ExerciseScript
    try {
      scriptModule = (await import(scriptPath)) as ExerciseScript
    } catch (err) {
      console.error(
        `exercise: failed to import script: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
      return 3
    }
    if (typeof scriptModule.run !== 'function') {
      console.error(
        `exercise: script ${scriptPath} does not export a run() function`,
      )
      return 3
    }

    const handles = await launchBrowser(server.baseUrl)
    browser = handles.browser

    const dump = createDump(handles.page, exDir)

    try {
      await scriptModule.run({
        page: handles.page,
        dump,
        root,
        baseUrl: server.baseUrl,
      })
    } catch (err) {
      exitCode = 1
      scriptError = {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }
      console.error(`exercise: script threw: ${scriptError.message}`)
    }

    // Final DOM dump regardless of pass/fail. The page may already be in a
    // broken state — swallow dump errors so they don't mask the real outcome.
    try {
      await dump()
    } catch (err) {
      console.error(
        `exercise: final dump failed: ${
          err instanceof Error ? err.message : String(err)
        }`,
      )
    }

    ended = Date.now()

    await writeJsonl(path.join(exDir, 'console.jsonl'), handles.consoleEvents)
    await writeJsonl(path.join(exDir, 'network.jsonl'), handles.networkEvents)

    runIds = await writeWireSlice(
      runsDir,
      before,
      await listRunIds(runsDir),
      exDir,
    )
    await writeLogsSlice(logsDir, started, ended, exDir)
  } catch (err) {
    exitCode = exitCode === 0 ? 3 : exitCode
    if (!scriptError) {
      scriptError = {
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      }
    }
    console.error(
      `exercise: harness error: ${scriptError?.message ?? 'unknown'}`,
    )
  } finally {
    ended = ended === started ? Date.now() : ended
    if (browser) {
      try {
        await browser.close()
      } catch {
        // best-effort
      }
    }
    if (server) {
      try {
        await stopDevServer(server)
      } catch {
        // best-effort
      }
    }
  }

  const meta: MetaJson = {
    id: args.id,
    script: scriptPath,
    root,
    port,
    baseUrl: server?.baseUrl ?? `http://localhost:${port}`,
    started,
    ended,
    durationMs: ended - started,
    exit: exitCode,
    error: scriptError,
    runIds,
  }
  await fs.writeFile(
    path.join(exDir, 'meta.json'),
    JSON.stringify(meta, null, 2) + '\n',
    'utf8',
  )

  console.log(
    `exercise: exit=${exitCode} duration=${meta.durationMs}ms artifacts=${exDir}`,
  )

  if (!args.keep) {
    await fs.rm(root, { recursive: true, force: true })
    console.log(`exercise: removed sandbox ${root}`)
  }

  return exitCode
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('exercise: unhandled error:', err)
    process.exit(3)
  })
