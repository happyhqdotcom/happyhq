'use client'

import { displayTitle } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'
import { useState } from 'react'

export type TaskBubbleState = 'suggested' | 'created' | 'started'

interface TaskBubbleProps {
  name: string
  title?: string | null
  state?: TaskBubbleState
  streamSlug?: string | null
  textContext?: string | null
  onCreate?: () => void | Promise<void>
  onStart?: () => void | Promise<void>
  onView?: () => void | Promise<void>
}

const SHELL_CLASS =
  'mt-4 rounded-xl bg-white/60 shadow-[0_-4px_12px_-2px_rgba(0,0,0,0.10),-2px_0_8px_-2px_rgba(0,0,0,0.06),2px_0_8px_-2px_rgba(0,0,0,0.06),0_1px_2px_0_rgba(0,0,0,0.04)] ring-1 ring-zinc-950/10 backdrop-blur-lg'

const PILL_CLASS =
  'flex h-6 shrink-0 items-center justify-center gap-1.5 rounded-full bg-zinc-900 px-3 font-mono text-[10px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-zinc-800 disabled:opacity-70 disabled:hover:bg-zinc-900'

/**
 * Chat-rendered task bubble. Two visual modes:
 * - suggested: lightweight inline row with a Create action.
 * - captured (created | started): TaskCard-shaped. Title navigates to the task.
 *   Start Task footer appears only when not yet started.
 */
export function TaskBubble(props: TaskBubbleProps) {
  const { state = 'suggested' } = props
  if (state === 'suggested') return <SuggestedBubble {...props} />
  return <CapturedBubble {...props} />
}

function SuggestedBubble({ name, title, onCreate }: TaskBubbleProps) {
  const [busy, setBusy] = useState(false)
  const handle = async () => {
    if (!onCreate || busy) return
    setBusy(true)
    try {
      await onCreate()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      data-testid="task-bubble"
      data-state="suggested"
      className={cn(SHELL_CLASS, 'flex items-center px-4 py-3')}
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
          disabled={busy}
          onClick={handle}
          className={PILL_CLASS}
        >
          {busy && <Loader2 className="h-3 w-3 animate-spin" />}
          {busy ? 'Creating…' : 'Create'}
        </button>
      </div>
    </div>
  )
}

function CapturedBubble({
  name,
  title,
  state,
  streamSlug,
  textContext,
  onStart,
  onView,
}: TaskBubbleProps) {
  const [busy, setBusy] = useState(false)
  const isStarted = state === 'started'
  const handleStart = async () => {
    if (!onStart || busy) return
    setBusy(true)
    try {
      await onStart()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      data-testid="task-bubble"
      data-state={state}
      className={cn(SHELL_CLASS, 'overflow-hidden')}
    >
      <button
        type="button"
        onClick={() => onView?.()}
        className="block w-full px-4 pt-3 pb-2 text-left transition-colors hover:bg-white/40"
      >
        <p className="text-muted-foreground text-[11px] font-medium tracking-widest uppercase">
          {streamSlug ? `Task · ${streamSlug}` : 'Task'}
        </p>
        <p className="text-foreground mt-0.5 text-sm font-medium">
          {displayTitle(title, name)}
        </p>
        {textContext && (
          <p className="text-muted-foreground mt-1.5 line-clamp-2 text-xs">
            {textContext}
          </p>
        )}
      </button>
      {!isStarted && (
        <div className="border-t border-zinc-100 bg-zinc-50">
          <div className="flex items-center justify-center px-4 py-2.5">
            <button
              type="button"
              disabled={busy}
              onClick={handleStart}
              className={PILL_CLASS}
            >
              {busy && <Loader2 className="h-3 w-3 animate-spin" />}
              {busy ? 'Starting…' : 'Start Task'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
