import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

export function Sidebar({
  open,
  children,
  className,
}: {
  open: boolean
  children?: ReactNode
  className?: string
}) {
  return (
    <div
      data-state={open ? 'expanded' : 'collapsed'}
      className="shrink-0 overflow-hidden border-l border-zinc-200 bg-zinc-50 transition-[width,border,opacity] duration-200 ease-in-out data-[state=collapsed]:w-0 data-[state=collapsed]:border-l-0 data-[state=collapsed]:opacity-0 data-[state=expanded]:w-52 data-[state=expanded]:opacity-100"
    >
      <div className={cn('flex h-full w-52 flex-col px-2 py-4', className)}>
        {children}
      </div>
    </div>
  )
}
