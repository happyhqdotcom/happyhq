import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { resolveSessionJournal } from '@/lib/chat/journal-path.server'
import { parseJournalEntries } from '@/lib/chat/parse-history.server'
import type { ChatMessage } from '@/lib/chat/types'
import { HAPPYHQ_ROOT } from '@/lib/constants.server'
import { readTextFile } from '@/lib/fs/read.server'

export interface ChatHistoryData {
  messages: ChatMessage[]
  chatName: string | null
  mode: string | null
  streamSlug: string | null
  selectedStreamSlug: string | null
}

/**
 * Load chat history from the filesystem. Reads the session journal (JSONL)
 * and chat.json metadata in parallel.
 *
 * Used by both the /chat/[id] server component (pre-loading for instant
 * render) and the /api/chat/history route (desktop window fallback).
 */
export async function loadChatHistory(
  sessionId: string,
): Promise<ChatHistoryData> {
  const empty: ChatHistoryData = {
    messages: [],
    chatName: null,
    mode: null,
    streamSlug: null,
    selectedStreamSlug: null,
  }

  const jsonlPath = await resolveSessionJournal(sessionId)
  if (!jsonlPath) return empty

  const chatDir = path.join(HAPPYHQ_ROOT, '.chats', sessionId)
  const chatJsonPath = path.join(chatDir, 'chat.json')

  const [content, chatJsonRaw] = await Promise.all([
    readFile(jsonlPath, 'utf-8'),
    readTextFile(chatJsonPath).catch(() => null),
  ])

  const messages = parseJournalEntries(content)
  let chatName: string | null = null
  let startedTasks: string[] = []
  let mode: string | null = null
  let chatStreamSlug: string | null = null
  let selectedStreamSlug: string | null = null

  if (chatJsonRaw) {
    try {
      const chatJson = JSON.parse(chatJsonRaw)
      chatName = chatJson.name ?? null
      mode = chatJson.mode ?? null
      chatStreamSlug = chatJson.streamSlug ?? null
      selectedStreamSlug = chatJson.selectedStreamSlug ?? null
      if (Array.isArray(chatJson.startedTasks)) {
        startedTasks = chatJson.startedTasks
      }
    } catch {
      // Malformed chat.json
    }
  }

  // Annotate CreateTask tool calls that the user started
  if (startedTasks.length > 0) {
    const startedSet = new Set(startedTasks)
    for (const msg of messages) {
      for (const tc of msg.toolCalls ?? []) {
        if (
          tc.name === 'CreateTask' &&
          startedSet.has((tc.input as { name: string }).name)
        ) {
          tc.taskStarted = true
        }
      }
    }
  }

  return {
    messages,
    chatName,
    mode,
    streamSlug: chatStreamSlug,
    selectedStreamSlug,
  }
}
