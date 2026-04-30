'use client'

import { useWindowActions } from '@/components/features/desktop/windows/use-window-actions'
import {
  getToolDetail,
  getToolFilePath,
  getToolLabel,
} from '@/lib/chat/tool-labels'
import type { ToolCall, ToolProgressStep } from '@/lib/chat/types'
import { Check, Info, Loader2 } from 'lucide-react'
import type { ComponentType } from 'react'
import { useState } from 'react'
import { TodoWriteDisplay } from './todo-write-display'
import { WriteFileDisplay } from './write-file-display'

// Rich renderers keyed by tool name. ToolStep checks this before
// falling back to the standard one-line layout.
const RICH_RENDERERS: Record<
  string,
  ComponentType<{ toolCall: ToolCall; isActive: boolean }>
> = {
  TodoWrite: TodoWriteDisplay,
  Write: WriteFileDisplay,
}

interface ToolProgressIndicatorProps {
  steps: ToolProgressStep[]
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

export function ToolProgressIndicator({
  steps,
  toolCalls,
  isStreaming,
}: ToolProgressIndicatorProps) {
  // Filter out hidden tools (AskUserQuestion, CreateTask — they have their own UI)
  const visible = steps.filter((s) => getToolLabel(s.toolName) !== null)
  if (visible.length === 0) return null

  return (
    <div>
      {visible.map((step, i) => (
        <ToolStep
          key={step.toolUseId}
          step={step}
          isActive={i === visible.length - 1 && !!isStreaming}
          toolCall={toolCalls?.find((c) => c.id === step.toolUseId)}
        />
      ))}
    </div>
  )
}

function ToolStep({
  step,
  isActive,
  toolCall,
}: {
  step: ToolProgressStep
  isActive: boolean
  toolCall?: ToolCall
}) {
  const [showDetail, setShowDetail] = useState(false)
  const { openFileWindow } = useWindowActions()
  const label = getToolLabel(step.toolName) ?? step.toolName
  const elapsed = Math.round(step.elapsedSeconds)
  const detail = toolCall ? getToolDetail(toolCall) : null
  const filePath = toolCall ? getToolFilePath(toolCall) : null

  // Check for a rich renderer
  const RichRenderer = RICH_RENDERERS[step.toolName]

  return (
    <div
      className={'space-y-1.5 py-0.5' + (isActive ? ' animate-fade-in' : '')}
    >
      {/* Header row — same for all tools */}
      <div className="flex items-baseline gap-2">
        {isActive ? (
          <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 translate-y-[2px] animate-spin" />
        ) : (
          <Check className="text-muted-foreground h-4 w-4 shrink-0 translate-y-[2px]" />
        )}
        <span className="text-foreground text-sm font-medium">{label}</span>
        {detail && filePath ? (
          <button
            type="button"
            onClick={() => openFileWindow({ name: detail, path: filePath })}
            className="text-muted-foreground hover:text-foreground cursor-pointer font-mono text-xs underline decoration-transparent transition-colors hover:decoration-current"
          >
            {detail}
          </button>
        ) : detail ? (
          <span className="text-muted-foreground font-mono text-xs">
            {detail}
          </span>
        ) : null}
        {isActive && elapsed > 0 && (
          <span className="text-muted-foreground text-xs tabular-nums">
            {elapsed}s
          </span>
        )}
        {/* Info button only for non-rich tools */}
        {toolCall && !RichRenderer && (
          <button
            type="button"
            onClick={() => setShowDetail((prev) => !prev)}
            className="text-muted-foreground/40 hover:text-muted-foreground ml-auto cursor-pointer transition-colors"
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Rich renderer (auto-expanded) or fallback JSON detail */}
      {RichRenderer && toolCall ? (
        <RichRenderer toolCall={toolCall} isActive={isActive} />
      ) : (
        showDetail &&
        toolCall && (
          <pre className="text-muted-foreground/60 border-border/50 overflow-x-auto rounded-lg border px-3 py-2 text-[11px] leading-snug">
            {JSON.stringify(toolCall.input, null, 2)}
          </pre>
        )
      )}
    </div>
  )
}
