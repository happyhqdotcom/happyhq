'use client'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/common/ui/tooltip'
import type { ChatMessage } from '@/lib/chat/types'
import { Check, Copy } from 'lucide-react'
import { useCallback, useState } from 'react'

interface MessageActionsProps {
  message: ChatMessage
}

export function MessageActions({ message }: MessageActionsProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  if (message.isStreaming || !message.content) return null

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={handleCopy}
          className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full bg-white text-black/40 opacity-0 ring-1 ring-zinc-950/10 transition-all duration-150 group-hover:opacity-100 hover:bg-zinc-50 hover:text-black/60"
          aria-label="Copy message"
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="z-1010">
        {copied ? 'Copied' : 'Copy'}
      </TooltipContent>
    </Tooltip>
  )
}
