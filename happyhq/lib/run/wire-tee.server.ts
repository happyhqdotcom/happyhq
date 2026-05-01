import fs from 'node:fs/promises'
import path from 'node:path'

import type { ChatStreamEvent } from '@/lib/chat/types'
import { runWirePath } from '@/lib/fs/paths'

/**
 * Append one ChatStreamEvent to <HAPPYHQ_ROOT>/.runs/<runId>/wire.jsonl.
 *
 * Called from the run loop's broadcast() chokepoint so every event emitted
 * to subscribers is also durably recorded — Ralphie can grep past runs and
 * the exercise harness slices a per-exercise wire.jsonl from these files.
 *
 * `runId` flows through `runWirePath`'s `assertSafePathSegment` regex —
 * keeps the CodeQL `js/path-injection` sanitiser barrier intact.
 */
export async function appendWireEvent(
  runId: string,
  event: ChatStreamEvent,
): Promise<void> {
  const file = runWirePath(runId)
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.appendFile(file, JSON.stringify(event) + '\n', 'utf8')
}
