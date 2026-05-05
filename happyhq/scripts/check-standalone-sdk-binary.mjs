#!/usr/bin/env node
// Verifies the Agent SDK's platform-specific binary package made it into the
// standalone build output. This catches a regression class where Next's static
// dependency tracer drops `@anthropic-ai/claude-agent-sdk-${platform}-${arch}`
// (the package name is computed at runtime so the tracer can't see it). When
// the package is missing the SDK fails at runtime with "Native CLI binary for
// <platform> not found", or — worse — silently uses a mismatched CLI elsewhere
// on PATH and the model behavior diverges from what the SDK expects.

import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const PNPM_DIR = '.next/standalone/node_modules/.pnpm'

let entries
try {
  entries = readdirSync(PNPM_DIR)
} catch {
  console.error(`Standalone build not found at ${PNPM_DIR}. Did 'next build' run?`)
  process.exit(1)
}

const platformPkgs = entries.filter((d) =>
  /^@anthropic-ai\+claude-agent-sdk-[a-z0-9-]+@/.test(d),
)

if (platformPkgs.length === 0) {
  console.error(
    `No @anthropic-ai/claude-agent-sdk-<platform> package in ${PNPM_DIR}.`,
  )
  console.error(
    `Check outputFileTracingIncludes in next.config.ts — the Agent SDK's `,
  )
  console.error(`platform binary is required and computed at runtime.`)
  process.exit(1)
}

for (const pkg of platformPkgs) {
  const m = pkg.match(/^(@anthropic-ai\+claude-agent-sdk-[a-z0-9-]+)@/)
  if (!m) continue
  const inner = m[1].replace('+', '/')
  const binary = join(PNPM_DIR, pkg, 'node_modules', inner, 'claude')
  try {
    statSync(binary)
  } catch {
    console.error(`Platform package ${pkg} is present but binary missing at ${binary}`)
    process.exit(1)
  }
}

console.log(`SDK platform binary present in standalone: ${platformPkgs.join(', ')}`)
