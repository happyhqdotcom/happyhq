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
  let createdTasks: string[] = []
  let startedTasks: string[] = []
  let taskSlugs: Record<string, string> = {}
  let mode: string | null = null
  let chatStreamSlug: string | null = null
  let selectedStreamSlug: string | null = null
  let uploads: Record<string, string> = {}

  if (chatJsonRaw) {
    try {
      const chatJson = JSON.parse(chatJsonRaw)
      chatName = chatJson.name ?? null
      mode = chatJson.mode ?? null
      chatStreamSlug = chatJson.streamSlug ?? null
      selectedStreamSlug = chatJson.selectedStreamSlug ?? null
      if (Array.isArray(chatJson.createdTasks)) {
        createdTasks = chatJson.createdTasks
      }
      if (Array.isArray(chatJson.startedTasks)) {
        startedTasks = chatJson.startedTasks
      }
      if (chatJson.taskSlugs && typeof chatJson.taskSlugs === 'object') {
        taskSlugs = chatJson.taskSlugs as Record<string, string>
      }
      if (chatJson.uploads && typeof chatJson.uploads === 'object') {
        uploads = chatJson.uploads as Record<string, string>
      }
    } catch {
      // Malformed chat.json
    }
  }

  // Annotate CreateTask tool calls that the user created (and started).
  // Started implies Created — clicking Start without Create can't happen.
  if (createdTasks.length > 0 || startedTasks.length > 0) {
    const createdSet = new Set([...createdTasks, ...startedTasks])
    const startedSet = new Set(startedTasks)
    for (const msg of messages) {
      for (const tc of msg.toolCalls ?? []) {
        if (tc.name !== 'CreateTask') continue
        const taskName = (tc.input as { name: string }).name
        if (createdSet.has(taskName)) tc.taskCreated = true
        if (startedSet.has(taskName)) tc.taskStarted = true
        const slug = taskSlugs[taskName]
        if (slug) tc.taskSlug = slug
      }
    }
  }

  // Restore original filenames on file pills. The JSONL marker carries
  // extensionless upload slugs; without this, pills fall through to the
  // generic "File" icon after reload because the slug has no extension.
  for (const msg of messages) {
    if (msg.files?.length) {
      msg.files = msg.files.map((slug) => uploads[slug] ?? slug)
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
