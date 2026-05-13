import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { platform } from 'node:os'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'

const MARKER_FILE = '.happyhq'
const MARKER_CONTENT = JSON.stringify({ schemaVersion: 1 }, null, 2) + '\n'

/**
 * Write the `.happyhq` marker into an existing directory. Exposed so tools
 * that legitimately construct a happyhq data root from scratch (e.g. the
 * smoke harnesses, which pre-seed content before booting) can declare the
 * root rather than tripping the ensureDataRoot guard.
 */
export function writeDataRootMarker(rootDir: string): void {
  writeFileSync(path.join(rootDir, MARKER_FILE), MARKER_CONTENT, 'utf-8')
}

export class DataRootError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DataRootError'
  }
}

type EnsureResult = { ok: true } | { ok: false; error: DataRootError }
let cached: EnsureResult | null = null

/**
 * Validate that HAPPYHQ_ROOT is a happyhq data folder, not an arbitrary
 * directory. Throws DataRootError if a non-empty path lacks the `.happyhq`
 * marker — preventing the app from registering streams against, for example,
 * a source checkout that happens to share the path (macOS case-insensitive
 * `~/happyhq` ↔ `~/HappyHQ`).
 */
export function ensureDataRoot(): void {
  if (cached) {
    if (!cached.ok) throw cached.error
    return
  }
  try {
    runChecks()
    cached = { ok: true }
  } catch (e) {
    if (e instanceof DataRootError) {
      cached = { ok: false, error: e }
    }
    throw e
  }
}

export function _resetDataRootCacheForTests(): void {
  cached = null
}

function runChecks(): void {
  if (!existsSync(HAPPYHQ_ROOT)) {
    mkdirSync(HAPPYHQ_ROOT, { recursive: true })
    writeMarker()
    return
  }
  const s = statSync(HAPPYHQ_ROOT)
  if (!s.isDirectory()) {
    throw new DataRootError(
      `HAPPYHQ_ROOT exists but is not a directory: ${HAPPYHQ_ROOT}`,
    )
  }
  const entries = readdirSync(HAPPYHQ_ROOT)
  if (entries.includes(MARKER_FILE)) return
  // "Empty" here mirrors readStreams' visibility filter: dot-prefixed entries
  // (.cache from dev-server, .DS_Store, etc.) never register as streams, so
  // their presence alone shouldn't block first-run init.
  const visibleEntries = entries.filter((e) => !e.startsWith('.'))
  if (visibleEntries.length === 0) {
    writeMarker()
    return
  }
  // Pre-marker data roots written by older versions: detect via our own
  // .gitignore (initializeGitRepo writes it deterministically) and migrate
  // in-place by writing the marker.
  if (looksLikeHappyhqRoot(entries)) {
    writeMarker()
    return
  }
  throw new DataRootError(buildError(entries))
}

function writeMarker(): void {
  writeDataRootMarker(HAPPYHQ_ROOT)
}

function looksLikeHappyhqRoot(entries: string[]): boolean {
  if (!entries.includes('.gitignore')) return false
  try {
    const content = readFileSync(path.join(HAPPYHQ_ROOT, '.gitignore'), 'utf-8')
    return content.includes('.chats/') && content.includes('.logs/')
  } catch {
    return false
  }
}

function buildError(entries: string[]): string {
  const indicators = [
    '.git',
    'node_modules',
    'package.json',
    'pnpm-workspace.yaml',
  ]
  const matched = indicators.filter((n) => entries.includes(n))
  const looksLikeSource = matched.length > 0
  const sampleNames = looksLikeSource ? matched : entries.slice(0, 3)
  const sample = sampleNames.map((name) => {
    try {
      return statSync(path.join(HAPPYHQ_ROOT, name)).isDirectory()
        ? `${name}/`
        : name
    } catch {
      return name
    }
  })

  const lines: string[] = []
  lines.push('')
  lines.push('✗ happyhq data folder is not initialized')
  lines.push('')
  lines.push(`  Path: ${HAPPYHQ_ROOT}`)
  lines.push(`  Found: ${sample.join(', ')}`)
  if (looksLikeSource) {
    lines.push('         (looks like a source checkout, not happyhq data)')
  }
  lines.push('')
  if (platform() === 'darwin') {
    lines.push('  Note: on macOS, ~/happyhq and ~/HappyHQ are the same path')
    lines.push(
      '  (case-insensitive filesystem) — likely you cloned this repo into ~/.',
    )
    lines.push('')
  }
  lines.push(
    '  Fix: point happyhq at a different folder. Add this to happyhq/.env.local:',
  )
  lines.push('')
  lines.push('      HAPPYHQ_ROOT="$HOME/Documents/HappyHQ"')
  lines.push('')
  lines.push('  Then restart: pnpm dev')
  lines.push('')
  lines.push('  More: README → "Local data folder"')
  return lines.join('\n')
}
