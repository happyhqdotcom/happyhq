'use client'

import { Check, Loader2 } from 'lucide-react'
import { useEffect, useRef } from 'react'

import { getToolLabel } from '@/lib/chat/tool-labels'
import type { ToolProgressStep, WritingPreview } from '@/lib/chat/types'

import { FilePreviewCard } from './write-file-display'

interface WritingPreviewProps {
  preview: WritingPreview
}

export function WritingPreviewCard({ preview }: WritingPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hasToolProgress =
    preview.subagentToolProgress && preview.subagentToolProgress.length > 0

  // Auto-scroll to bottom as text streams in
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [preview.text])

  if (!preview.text && !preview.filePreview && !hasToolProgress) return null

  // File preview from subagent Write — render standalone (it has its own border/styling)
  if (preview.filePreview) {
    return <FilePreviewCard content={preview.filePreview.content} />
  }

  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200/60 bg-zinc-50/50">
      {hasToolProgress && (
        <div className="space-y-1 px-3 py-2">
          {preview.subagentToolProgress!.map((step, i) => (
            <SubagentToolStep
              key={step.toolUseId}
              step={step}
              isActive={
                i === preview.subagentToolProgress!.length - 1 &&
                preview.isActive
              }
            />
          ))}
        </div>
      )}
      {preview.text && (
        <div
          ref={containerRef}
          className="max-h-26 overflow-hidden px-3 py-2 text-[13px] leading-relaxed text-zinc-500"
        >
          <pre className="font-sans whitespace-pre-wrap">{preview.text}</pre>
        </div>
      )}
    </div>
  )
}

function SubagentToolStep({
  step,
  isActive,
}: {
  step: ToolProgressStep
  isActive: boolean
}) {
  const label = getToolLabel(step.toolName) ?? step.toolName
  return (
    <div className="flex items-center gap-2">
      {isActive ? (
        <Loader2 className="text-muted-foreground h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <Check className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      )}
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}
