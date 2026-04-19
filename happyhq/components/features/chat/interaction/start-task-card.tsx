'use client'

import { displayTitle } from '@/lib/format'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

interface StartTaskCardProps {
  name: string
  title?: string | null
  onStart: () => Promise<void> | void
  started?: boolean
}

export function StartTaskCard({
  name,
  title,
  onStart,
  started = false,
}: StartTaskCardProps) {
  const [isStarting, setIsStarting] = useState(false)

  const handleClick = async () => {
    if (started || isStarting) {
      onStart()
      return
    }
    setIsStarting(true)
    await onStart()
  }

  const label = isStarting ? 'Starting…' : started ? 'View Task' : 'Start Task'

  return (
    <div
      data-testid="start-task-card"
      className="mt-4 flex items-center rounded-xl bg-white/60 px-4 py-3 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.10),-2px_0_8px_-2px_rgba(0,0,0,0.06),2px_0_8px_-2px_rgba(0,0,0,0.06),0_1px_2px_0_rgba(0,0,0,0.04)] ring-1 ring-zinc-950/10 backdrop-blur-lg"
    >
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
          Suggested task
        </p>
        <p className="text-foreground mt-0.5 text-sm font-medium">
          {displayTitle(title, name)}
        </p>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={isStarting}
          onClick={handleClick}
          className="bg-primary text-primary-foreground flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-90 disabled:opacity-70"
        >
          {isStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {label}
        </button>
      </div>
    </div>
  )
}
