import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { streamPath } from '@/lib/fs/paths'
import { listDirectory, readTextFile } from '@/lib/fs/read.server'

import type { DebugBundle, DebugBundleSpec } from './debug-bundle'
import { resolveSessionJournal } from './journal-path.server'

// Read version from package.json at module load time.
// This is a server module -- the import resolves to the app's package.json.
import packageJson from '../../package.json'

export async function assembleDebugBundle(
  streamName: string | null,
  sessionId: string,
): Promise<DebugBundle> {
  const streamDir = streamName ? streamPath(streamName) : null

  // Parallel reads -- all null-safe
  const [chatMeta, rawJournal, playbook, specEntries] = await Promise.all([
    readChatMeta(sessionId),
    readRawJournal(sessionId),
    streamDir
      ? readTextFile(path.join(streamDir, 'playbook.md'))
      : Promise.resolve(null),
    streamDir ? readSpecs(streamDir) : Promise.resolve([]),
  ])

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: packageJson.version,
    streamName,
    chat: {
      sessionId,
      name: chatMeta.name,
      createdAt: chatMeta.createdAt,
    },
    rawJournal,
    playbook,
    specs: specEntries,
    environment: {
      platform: process.platform,
      nodeVersion: process.version,
      arch: process.arch,
    },
  }
}

// --- Internal helpers ---

async function readChatMeta(
  sessionId: string,
): Promise<{ name: string | null; createdAt: string | null }> {
  // All chats live at root
  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)

  // Read name from chat.json
  let name: string | null = null
  const chatJsonRaw = await readTextFile(path.join(chatDir, 'chat.json'))
  if (chatJsonRaw !== null) {
    try {
      const parsed = JSON.parse(chatJsonRaw)
      name = parsed.name ?? null
    } catch {
      // Malformed chat.json -- use null name
    }
  }

  // Read createdAt from directory birthtime
  let createdAt: string | null = null
  try {
    const dirStat = await stat(chatDir)
    createdAt = dirStat.birthtime.toISOString()
  } catch {
    // Directory doesn't exist -- null createdAt
  }

  return { name, createdAt }
}

async function readRawJournal(sessionId: string): Promise<string | null> {
  const jsonlPath = await resolveSessionJournal(sessionId)
  if (!jsonlPath) return null

  try {
    return await readFile(jsonlPath, 'utf-8')
  } catch {
    return null
  }
}

async function readSpecs(streamDir: string): Promise<DebugBundleSpec[]> {
  const specsDir = path.join(streamDir, 'specs')
  const entries = await listDirectory(specsDir) // returns [] for ENOENT
  const specs: DebugBundleSpec[] = []

  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name.endsWith('.md')) continue
    const content = await readTextFile(path.join(specsDir, entry.name))
    if (content !== null) {
      specs.push({ name: entry.name, content })
    }
  }

  return specs
}
