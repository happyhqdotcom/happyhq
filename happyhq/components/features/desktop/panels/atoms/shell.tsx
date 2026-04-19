import { cn } from '@/lib/utils'
import type { ComponentProps } from 'react'

export function Shell({
  children,
  className,
  ...props
}: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex h-full flex-col overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-950/10',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}
