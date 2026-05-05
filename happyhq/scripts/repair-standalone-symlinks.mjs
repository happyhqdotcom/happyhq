#!/usr/bin/env node
// Repair pnpm symlinks the Next.js standalone tracer drops.
//
// pnpm sets up the SDK wrapper's `node_modules/@anthropic-ai/` with symlinks
// to its dependencies (including the platform-specific `claude-agent-sdk-*`
// package that the SDK loads at runtime). Next's standalone copy follows the
// files but doesn't preserve those symlinks, leaving the wrapper unable to
// resolve its own optional dep — even when `outputFileTracingIncludes` has
// pulled the target package into the standalone's `.pnpm/`.
//
// This script walks the standalone's `.pnpm/` directory and rebuilds the
// missing intra-`.pnpm` symlinks so Node's resolver can follow them again.

import {
  existsSync,
  readdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join, relative } from 'node:path'

const STANDALONE_PNPM = '.next/standalone/node_modules/.pnpm'

if (!existsSync(STANDALONE_PNPM)) {
  console.error(`Standalone .pnpm dir not found at ${STANDALONE_PNPM}`)
  process.exit(1)
}

const pnpmEntries = readdirSync(STANDALONE_PNPM)
let repaired = 0

// For each platform-specific SDK package present in the standalone, ensure the
// SDK wrapper package(s) have a symlink pointing at it.
const platformPkgs = pnpmEntries.filter((d) =>
  /^@anthropic-ai\+claude-agent-sdk-[a-z0-9-]+@/.test(d),
)
const wrapperPkgs = pnpmEntries.filter((d) =>
  /^@anthropic-ai\+claude-agent-sdk@/.test(d),
)

if (platformPkgs.length === 0) {
  console.error(
    'No platform-specific @anthropic-ai/claude-agent-sdk-* in standalone',
  )
  process.exit(1)
}
if (wrapperPkgs.length === 0) {
  console.error('No @anthropic-ai/claude-agent-sdk wrapper in standalone')
  process.exit(1)
}

for (const wrapper of wrapperPkgs) {
  const wrapperAtNs = join(
    STANDALONE_PNPM,
    wrapper,
    'node_modules',
    '@anthropic-ai',
  )
  if (!existsSync(wrapperAtNs)) continue

  for (const platform of platformPkgs) {
    const m = platform.match(/^(@anthropic-ai\+claude-agent-sdk-[a-z0-9-]+)@/)
    if (!m) continue
    const innerName = m[1].replace('+', '/').split('/')[1]
    const linkName = innerName
    const linkAt = join(wrapperAtNs, linkName)
    const target = join(
      STANDALONE_PNPM,
      platform,
      'node_modules',
      '@anthropic-ai',
      innerName,
    )

    if (!existsSync(target)) continue
    const relTarget = relative(dirname(linkAt), target)

    // Remove any stale entry (file/symlink) before re-linking.
    try {
      const existingLink = readlinkSync(linkAt)
      if (existingLink === relTarget) continue // already correct
      unlinkSync(linkAt)
    } catch {
      // not a symlink or doesn't exist — fine
      try {
        unlinkSync(linkAt)
      } catch {
        // doesn't exist
      }
    }

    symlinkSync(relTarget, linkAt)
    repaired += 1
  }
}

console.log(`Repaired ${repaired} pnpm symlink(s) in standalone`)
