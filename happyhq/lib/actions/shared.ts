import { access, rm } from 'node:fs/promises'

import { validatePath } from '@/lib/fs/paths'
import { commitGitState } from '@/lib/git/sync.server'

/**
 * Debounced git commit — batches rapid commits (e.g. parallel uploads)
 * into a single commit after 500ms of quiet.
 */
let commitTimer: ReturnType<typeof setTimeout> | null = null
let pendingMessages: string[] = []

export function deferredCommit(message: string): void {
  pendingMessages.push(message)
  if (commitTimer) clearTimeout(commitTimer)
  commitTimer = setTimeout(() => {
    const messages = pendingMessages
    pendingMessages = []
    commitTimer = null
    // Use the first message if only one, otherwise combine
    const msg = messages.length === 1 ? messages[0] : messages.join('\n')
    commitGitState(msg)
  }, 500)
}

/**
 * Shared helper: delete a file item directory and commit.
 */
export async function deleteFileItem(
  dir: string,
  commitMessage: string,
): Promise<void> {
  validatePath(dir)
  await access(dir)
  await rm(dir, { recursive: true, force: true })
  commitGitState(commitMessage)
}
