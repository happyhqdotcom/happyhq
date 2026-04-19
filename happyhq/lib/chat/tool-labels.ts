/**
 * Map raw SDK tool names to human-friendly labels.
 * Applied at render time — presentation only, no data transformation.
 */

import type { ToolCall } from './types'

const TOOL_LABELS: Record<string, string> = {
  Read: 'Reading',
  Glob: 'Searching files',
  Grep: 'Finding',
  Write: 'Writing',
  Edit: 'Updating',
  Task: 'Working',
  TodoWrite: 'To Dos',
  TaskOutput: 'Checking results',
  WebSearch: 'Searching web',
  WebFetch: 'Fetching page',
  ProcessSample: 'Updating Samples',
  EnterLearningMode: 'Ready to learn',
  ExitLearningMode: 'Done learning',
}

/** Tools that have their own UI treatment and should not appear as progress rows. */
const HIDDEN_TOOLS = new Set(['AskUserQuestion', 'CreateTask'])

/**
 * Derive a human-friendly label from a raw SDK tool name.
 * Returns null for tools that should be hidden (they have dedicated UI cards).
 */
export function getToolLabel(toolName: string): string | null {
  if (HIDDEN_TOOLS.has(toolName)) return null

  // Bash tool names include the command pattern: "Bash(pdftotext:*)" or "Bash"
  if (toolName.startsWith('Bash')) {
    const match = toolName.match(/^Bash\(([^:)]+)/)
    if (match) {
      const cmd = match[1]
      if (cmd === 'pdftotext') return 'Extracting PDF text'
      if (cmd === 'git add') return 'Preparing changes'
      if (cmd === 'git commit') return 'Saving changes'
      if (cmd === 'git log') return 'Checking history'
      if (cmd === 'git diff') return 'Checking changes'
      return `Running ${cmd}`
    }
    return 'Working'
  }

  return TOOL_LABELS[toolName] ?? toolName
}

/** Extract the last path segment (filename) from a file path. */
function fileName(filePath: string): string {
  const parts = filePath.split('/')
  return parts[parts.length - 1] || filePath
}

/**
 * Extract a short detail string from a tool call's input.
 * Returns null if no meaningful detail can be derived.
 *
 * Examples:
 *   Read { file_path: "/path/to/config.ts" } → "config.ts"
 *   Glob { pattern: "**\/*.tsx" } → "**\/*.tsx"
 *   Grep { pattern: "useState" } → "useState"
 */
export function getToolDetail(toolCall: ToolCall): string | null {
  const { name, input } = toolCall
  if (!input) return null

  switch (name) {
    case 'Read':
    case 'Write':
    case 'Edit': {
      const fp = input.file_path as string | undefined
      return fp ? fileName(fp) : null
    }

    case 'Glob': {
      const pattern = input.pattern as string | undefined
      return pattern || null
    }

    case 'Grep': {
      const pattern = input.pattern as string | undefined
      return pattern ? `"${pattern}"` : null
    }

    case 'ProcessSample': {
      const slug = input.slug as string | undefined
      return slug || null
    }

    case 'Task': {
      const desc = input.description as string | undefined
      return desc || null
    }

    case 'TodoWrite': {
      const todos = input.todos as Array<{ status?: string }> | undefined
      if (!Array.isArray(todos) || todos.length === 0) return null
      const completed = todos.filter((t) => t.status === 'completed').length
      return `${completed}/${todos.length} done`
    }

    case 'WebSearch': {
      const q = input.query as string | undefined
      return q ? `"${q}"` : null
    }

    case 'WebFetch': {
      const url = input.url as string | undefined
      if (!url) return null
      try {
        return new URL(url).hostname
      } catch {
        return null
      }
    }

    default: {
      if (name.startsWith('Bash')) {
        const desc = input.description as string | undefined
        if (desc) return desc
        const command = input.command as string | undefined
        if (command) {
          return command.length > 50 ? command.slice(0, 50) + '...' : command
        }
      }
      return null
    }
  }
}

/**
 * Extract the raw file_path from a file-based tool call (Read, Write, Edit).
 * Returns null for non-file tools or if no path is present.
 */
export function getToolFilePath(toolCall: ToolCall): string | null {
  if (
    toolCall.name !== 'Read' &&
    toolCall.name !== 'Write' &&
    toolCall.name !== 'Edit'
  )
    return null
  const fp = toolCall.input?.file_path as string | undefined
  return fp || null
}
