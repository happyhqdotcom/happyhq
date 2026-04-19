// Command Menu Footer
// Container with keyboard hints

'use client'

import { cn } from '@/lib/utils'
import { ReactNode } from 'react'

interface CommandMenuFooterProps {
  children?: ReactNode
}

export function CommandMenuFooter({ children }: CommandMenuFooterProps) {
  return (
    <div
      className={cn(
        'flex h-10 items-center justify-between gap-4',
        'px-3',
        'text-xs text-zinc-500',
      )}
    >
      {children}
    </div>
  )
}

export function CommandMenuFooterHints() {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-zinc-500/15 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
            ↑↓
          </kbd>
          <span>Navigate</span>
        </span>
        <span className="flex items-center gap-1">
          <kbd className="rounded bg-zinc-500/15 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
            ↵
          </kbd>
          <span>Select</span>
        </span>
      </div>
      <span className="flex items-center gap-1">
        <kbd className="rounded bg-zinc-500/15 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
          esc
        </kbd>
        <span>Close</span>
      </span>
    </>
  )
}
