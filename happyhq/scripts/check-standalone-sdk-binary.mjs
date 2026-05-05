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
    console.error(
      `Platform package ${pkg} is present but binary missing at ${binary}`,
    )
    process.exit(1)
  }
}

// Verify the SDK wrapper can actually resolve the platform package via Node's
// resolver — i.e., the pnpm symlinks survived the standalone copy. The package
// files being present on disk isn't enough; the SDK does
// `require('@anthropic-ai/claude-agent-sdk-${platform}-${arch}')` and that
// fails silently if the symlinks were dropped.
const wrapperPkgs = entries.filter((d) =>
  /^@anthropic-ai\+claude-agent-sdk@/.test(d),
)
for (const wrapper of wrapperPkgs) {
  const wrapperAtNs = join(PNPM_DIR, wrapper, 'node_modules', '@anthropic-ai')
  let entriesUnder
  try {
    entriesUnder = readdirSync(wrapperAtNs)
  } catch {
    console.error(`SDK wrapper missing @anthropic-ai dir: ${wrapperAtNs}`)
    process.exit(1)
  }
  const platformLinks = entriesUnder.filter((e) =>
    e.startsWith('claude-agent-sdk-'),
  )
  if (platformLinks.length === 0) {
    console.error(
      `SDK wrapper ${wrapper} has no platform-binary symlinks under @anthropic-ai/.`,
    )
    console.error(
      `Found: ${entriesUnder.join(', ')}. Run scripts/repair-standalone-symlinks.mjs.`,
    )
    process.exit(1)
  }
}

console.log(`SDK platform binary present in standalone: ${platformPkgs.join(', ')}`)
