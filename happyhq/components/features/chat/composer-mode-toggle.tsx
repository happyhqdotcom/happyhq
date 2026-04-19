'use client'

import { cn } from '@/lib/utils'
import { Glasses } from 'lucide-react'

interface ComposerModeToggleProps {
  mode: 'general' | 'learning'
  onModeChange: (mode: 'general' | 'learning') => void
  disabled?: boolean
}

/**
 * Pure on/off toggle for learning mode in the composer.
 * Stream context is handled separately by the stream selector.
 */
export function ComposerModeToggle({
  mode,
  onModeChange,
  disabled = false,
}: ComposerModeToggleProps) {
  const isLearning = mode === 'learning'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation()
        onModeChange(isLearning ? 'general' : 'learning')
      }}
      className={cn(
        'inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[13px] font-medium select-none focus:outline-none',
        'disabled:pointer-events-none disabled:opacity-50',
        isLearning
          ? 'bg-linear-to-r from-violet-500/10 to-fuchsia-500/10 text-violet-600 ring-1 ring-violet-300/50 hover:from-violet-500/[0.14] hover:to-fuchsia-500/[0.14] hover:text-violet-600'
          : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-500',
      )}
    >
      <Glasses className="h-3.5 w-3.5" />
      {isLearning ? 'Learning' : 'Learn'}
    </button>
  )
}
