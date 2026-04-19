'use client'

import { X } from 'lucide-react'

interface AskUserConfirmationProps {
  toolName: string
  input: Record<string, unknown>
  onAllow: () => void
  onDeny: () => void
}

/**
 * Try to extract a user-friendly description for a curl command.
 * Returns null if the command isn't curl or can't be summarized.
 */
function friendlyCurlSummary(command: string): string | null {
  // Only match commands that start with curl (possibly after cd/env prefixes)
  if (!/(?:^|&&\s*|;\s*)curl\s/.test(command)) return null

  // WeTransfer links
  if (/we\.tl\/|wetransfer\.com/i.test(command)) {
    return 'Download files from WeTransfer'
  }

  // Generic: extract domain from URL in the command
  const urlMatch = command.match(/https?:\/\/([^/'"\s]+)/)
  if (urlMatch) {
    return `Download from ${urlMatch[1]}`
  }

  return null
}

/**
 * Format a tool-aware action summary for the confirmation card.
 * Bash → "Run command: ls -la", Read/Write/Edit → "Access file: /path",
 * fallback → "Use tool: ToolName".
 */
function formatActionSummary(
  toolName: string,
  input: Record<string, unknown>,
): string {
  if (toolName === 'Bash' && typeof input.command === 'string') {
    return friendlyCurlSummary(input.command) ?? `Run command: ${input.command}`
  }
  if (
    (toolName === 'Read' || toolName === 'Write' || toolName === 'Edit') &&
    typeof input.file_path === 'string'
  ) {
    return `Access file: ${input.file_path}`
  }
  if (toolName === 'Grep' && typeof input.pattern === 'string') {
    return `Find: ${input.pattern}`
  }
  if (toolName === 'WebSearch' && typeof input.query === 'string') {
    return `Search the web: ${input.query}`
  }
  if (toolName === 'WebFetch' && typeof input.url === 'string') {
    return `Fetch page: ${input.url}`
  }
  if (toolName === 'TodoWrite') {
    return 'Update task list'
  }
  return `Use tool: ${toolName}`
}

/**
 * Get the raw command detail for Bash tools when there's a friendly summary.
 * Returns null when the summary IS the raw command (no detail needed).
 */
function getRawDetail(
  toolName: string,
  input: Record<string, unknown>,
): string | null {
  if (toolName !== 'Bash' || typeof input.command !== 'string') return null
  // Only show detail when we used a friendly summary (i.e. friendlyCurlSummary returned non-null)
  if (!friendlyCurlSummary(input.command)) return null
  return input.command
}

export function AskUserConfirmation({
  toolName,
  input,
  onAllow,
  onDeny,
}: AskUserConfirmationProps) {
  const rawDetail = getRawDetail(toolName, input)

  return (
    <div className="flex flex-col rounded-[28px] bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.035)] ring-4 ring-[oklch(0.9_0.058_28/.5)] outline-1 outline-[oklch(0.795_0.115_28)]">
      <div className="mb-1.5 flex items-start justify-between">
        <span className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
          Q wants to
        </span>
        <button
          type="button"
          onClick={onDeny}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-700"
          aria-label="Deny action"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="text-foreground mb-3 text-sm font-medium">
        {formatActionSummary(toolName, input)}
      </p>

      {rawDetail && (
        <div className="-mt-1 mb-3 overflow-x-auto rounded-xl bg-zinc-50 px-3 py-2">
          <p className="truncate font-mono text-[11px] text-zinc-400">
            {rawDetail}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAllow}
          className="rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white"
        >
          Allow
        </button>
        <button
          type="button"
          onClick={onDeny}
          className="rounded-full bg-transparent px-4 py-1.5 text-sm text-zinc-400 hover:text-zinc-600"
        >
          Deny
        </button>
      </div>
    </div>
  )
}
