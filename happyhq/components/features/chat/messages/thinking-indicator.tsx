'use client'

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/common/ui/collapsible'
import type { ThinkingBlock } from '@/lib/chat/types'
import { ChevronRight, CircleCheck, CircleSmall } from 'lucide-react'
import { useState } from 'react'

interface ThinkingIndicatorProps {
  blocks: ThinkingBlock[]
  isStreaming?: boolean
}

export function ThinkingIndicator({
  blocks,
  isStreaming,
}: ThinkingIndicatorProps) {
  const [open, setOpen] = useState(false)

  const hasContent = blocks.some((b) => b.text.trim())
  if (!hasContent) return null

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mb-3">
      <CollapsibleTrigger className="group/think text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1 text-sm transition-colors">
        <span>Thinking</span>
        <ChevronRight className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]/think:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 ml-1">
        <div className="flex flex-col">
          {blocks.map((block, i) => {
            if (!block.text.trim()) return null
            return (
              <div key={i} className="flex gap-2.5">
                <div className="flex flex-col items-center self-stretch">
                  <CircleSmall className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                  <div className="bg-border mt-1 w-px flex-1" />
                </div>
                <p className="text-muted-foreground pb-4 text-sm leading-relaxed">
                  {block.text}
                </p>
              </div>
            )
          })}
          <div className="flex items-center gap-2.5">
            {isStreaming ? (
              <>
                <CircleSmall className="text-muted-foreground h-4 w-4 shrink-0 animate-pulse" />
                <span className="text-muted-foreground text-sm">
                  Thinking...
                </span>
              </>
            ) : (
              <>
                <CircleCheck className="text-muted-foreground h-4 w-4 shrink-0" />
                <span className="text-muted-foreground text-sm">Done</span>
              </>
            )}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
