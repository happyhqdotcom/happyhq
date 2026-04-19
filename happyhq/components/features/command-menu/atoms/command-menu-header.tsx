// Command Menu Header
// Container with search input or title content

'use client'

import { cn } from '@/lib/utils'
import { ArrowLeft, Loader2, Search } from 'lucide-react'
import { ReactNode } from 'react'
import type { UrlInputAction } from '../pages/url-input-page'

interface CommandMenuHeaderProps {
  children: ReactNode
}

export function CommandMenuHeader({ children }: CommandMenuHeaderProps) {
  return (
    <div className={cn('flex h-11 items-center gap-2 px-4')}>{children}</div>
  )
}

interface CommandMenuHeaderIconProps {
  showBack: boolean
  onBack?: () => void
}

export function CommandMenuHeaderIcon({
  showBack,
  onBack,
}: CommandMenuHeaderIconProps) {
  return (
    <div className="flex size-5 shrink-0 items-center justify-center">
      {showBack ? (
        <button
          onClick={onBack}
          className="flex size-5 items-center justify-center rounded bg-zinc-500/15 text-zinc-600 hover:bg-zinc-500/25"
        >
          <ArrowLeft className="size-3" />
        </button>
      ) : (
        <Search className="size-4 text-zinc-500" />
      )}
    </div>
  )
}

interface CommandMenuHeaderActionProps {
  action: UrlInputAction
}

export function CommandMenuHeaderAction({
  action,
}: CommandMenuHeaderActionProps) {
  const isDisabled = action.type === 'disabled'
  const isLoading = action.type === 'loading'
  const isClickable = action.type === 'preview' || action.type === 'submit'

  const label = action.type === 'submit' ? 'Add' : 'Search'

  return (
    <button
      onClick={isClickable ? action.onAction : undefined}
      disabled={isDisabled || isLoading}
      className={cn(
        'flex h-5 w-12 shrink-0 items-center justify-center rounded bg-zinc-500/15 text-xs font-medium transition-colors',
        isDisabled && 'cursor-not-allowed text-zinc-500 opacity-50',
        isLoading && 'cursor-wait text-zinc-500',
        isClickable && 'text-zinc-600 hover:bg-zinc-500/25',
      )}
    >
      {isLoading ? <Loader2 className="size-3 animate-spin" /> : label}
    </button>
  )
}
