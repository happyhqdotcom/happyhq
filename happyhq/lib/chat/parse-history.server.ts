import type { ChatMessage, ToolCall } from '@/lib/chat/types'
import { stripMcpPrefix } from '@/lib/run/filter.server'

/**
 * Shape of each line in the SDK's session JSONL file.
 * The SDK writes one JSON object per line with a `type` discriminator.
 */
interface JournalEntry {
  type: string
  uuid: string
  timestamp: string
  requestId?: string
  message?: {
    role: string
    content: Array<{
      type: string
      text?: string
      thinking?: string
      id?: string
      name?: string
      input?: Record<string, unknown>
      tool_use_id?: string // Present on tool_result blocks
      content?: string | Array<{ type: string; text?: string }> // tool_result content
    }>
  }
}

type ChatMessageWithRequestId = ChatMessage & { _requestId?: string }

/**
 * Parse the SDK's AskUserQuestion tool_result content string into a
 * Record<string, string> mapping question text to the user's answer.
 *
 * Format: 'User has answered your questions: "Q1"="A1", "Q2"="A2". You can now continue...'
 */
function parseAskAnswers(raw: string): Record<string, string> | null {
  const prefix = 'User has answered your questions: '
  if (!raw.startsWith(prefix)) return null
  const body = raw
    .slice(prefix.length)
    .replace(/\. You can now continue.*$/, '')
  const answers: Record<string, string> = {}
  // Match "Q"="A" pairs. Values may contain literal quotes, so we match
  // greedily to the closing "= or end-of-string boundary rather than
  // stopping at the first quote.
  const regex = /"(.+?)"="(.*?)"\s*(?:,\s*(?=")|$)/g
  let match
  while ((match = regex.exec(body)) !== null) {
    answers[match[1]] = match[2]
  }
  return Object.keys(answers).length > 0 ? answers : null
}

/**
 * Extract the text content from a tool_result's content field,
 * which can be a plain string or an array of text blocks.
 */
function extractToolResultText(
  content: string | Array<{ type: string; text?: string }> | undefined,
): string | null {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const texts = content
      .filter((item) => item.type === 'text' && item.text)
      .map((item) => item.text!)
    return texts.length > 0 ? texts.join('\n') : null
  }
  return null
}

/**
 * Strip `<system-reminder>...</system-reminder>` blocks from user message
 * content. The learning layer is prepended to user messages as a system
 * reminder — strip it before rendering in the UI.
 */
function stripSystemReminders(content: string): string {
  return content.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '')
}

/**
 * Extract `[Files uploaded: ...]` from user message content.
 * Returns the cleaned content and an array of filenames (if any).
 *
 * This marker is composed by `sendMessage` in the chat store so the agent
 * knows which files to read from `uploads/` via filesystem tools. On the
 * UI side, files are stored as a structured `files: string[]` field on
 * ChatMessage and rendered as visual pills — never as raw text. This
 * function reverses the annotation for historical JSONL entries so that
 * reloaded conversations display files the same way as live ones.
 */
function extractFilesFromContent(content: string): {
  content: string
  files?: string[]
} {
  const marker = '[Files uploaded: '
  const start = content.indexOf(marker)
  if (start === -1) return { content }

  const end = content.lastIndexOf(']')
  if (end === -1) return { content }

  const fileList = content.slice(start + marker.length, end)
  const files = fileList
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean)
  const cleaned = content.slice(0, start).trim()
  return {
    content: cleaned,
    files: files.length > 0 ? files : [],
  }
}

/**
 * Parse SDK session JSONL content into a ChatMessage array.
 *
 * Filters to user/assistant messages, extracts AskUserQuestion answers from
 * tool_result entries, strips MCP prefixes from tool names, and merges
 * consecutive assistant messages into a single message per query
 * (intermediate text → thinkingBlocks).
 */
export function parseJournalEntries(content: string): ChatMessage[] {
  const lines = content.split('\n').filter((line) => line.trim())
  const rawMessages: ChatMessageWithRequestId[] = []

  for (const line of lines) {
    let entry: JournalEntry
    try {
      entry = JSON.parse(line)
    } catch {
      // Malformed line — skip silently
      continue
    }

    if (entry.type !== 'user' && entry.type !== 'assistant') continue
    if (!entry.message?.content) continue

    // Extract interactive tool state from tool_result entries, then skip them.
    // AskUserQuestion: populate tc.answers from the result text.
    // CreateTask taskStarted is annotated by the history route from chat.json, not here.
    if (entry.type === 'user') {
      const toolResults = entry.message.content.filter(
        (block) => block.type === 'tool_result',
      )
      if (toolResults.length > 0) {
        for (const tr of toolResults) {
          const text = extractToolResultText(tr.content)
          if (!text || !tr.tool_use_id) continue

          // AskUserQuestion: parse answers from result text
          const answers = parseAskAnswers(text)
          if (answers) {
            for (let i = rawMessages.length - 1; i >= 0; i--) {
              const msg = rawMessages[i]
              if (msg.role !== 'assistant' || !msg.toolCalls) continue
              const tc = msg.toolCalls.find(
                (t) => t.id === tr.tool_use_id && t.name === 'AskUserQuestion',
              )
              if (tc) {
                tc.answers = answers
                break
              }
            }
          }
        }
        continue // Still skip adding tool_result as a visible message
      }

      const text = entry.message.content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text!)
        .join('\n')

      if (!text) continue

      const strippedText = stripSystemReminders(text)
      const { content: cleanedContent, files } =
        extractFilesFromContent(strippedText)

      // Hide the SDK trigger prompt — not a real user message
      if (cleanedContent === 'Begin.') continue

      rawMessages.push({
        id: entry.uuid,
        role: 'user',
        content: cleanedContent,
        files,
        isHistorical: true,
        timestamp: new Date(entry.timestamp).getTime(),
      })
    }

    if (entry.type === 'assistant') {
      const text = entry.message.content
        .filter((block) => block.type === 'text' && block.text)
        .map((block) => block.text!)
        .join('\n')

      const toolCalls: ToolCall[] = entry.message.content
        .filter((block) => block.type === 'tool_use' && block.id && block.name)
        .map((block) => ({
          id: block.id!,
          name: stripMcpPrefix(block.name!),
          input: (block.input as Record<string, unknown>) ?? {},
        }))

      const thinkingBlocks = entry.message.content
        .filter((block) => block.type === 'thinking' && block.thinking)
        .map((block) => ({ text: block.thinking! }))

      rawMessages.push({
        id: entry.uuid,
        role: 'assistant',
        content: text,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        thinkingBlocks: thinkingBlocks.length > 0 ? thinkingBlocks : undefined,
        toolProgress:
          toolCalls.length > 0
            ? toolCalls.map((tc) => ({
                toolName: tc.name,
                toolUseId: tc.id,
                elapsedSeconds: 0,
              }))
            : undefined,
        isHistorical: true,
        timestamp: new Date(entry.timestamp).getTime(),
        _requestId: entry.requestId,
      })
    }
  }

  // Each assistant journal entry is its own agentic turn — keep them as
  // separate messages so the history reads like a real conversation.
  return rawMessages.map(({ _requestId, ...msg }) => msg)
}
