import { displayTitle } from '@/lib/format'
import { Check } from 'lucide-react'
import type { ActivityStep } from '../../hooks/use-run-activity'
import type { RunStatus } from '../../types'
import { taskSentence } from '../types'

/* ── Activity log with header + steps ───────────────────────────── */

export function TaskActivityContent({
  taskName,
  status,
  steps,
  onStop,
  isStopping,
}: {
  taskName: string
  status: 'planning' | 'working'
  steps: ActivityStep[]
  onStop: () => void
  isStopping?: boolean
}) {
  return (
    <>
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          <span className="text-sm font-medium text-black/80">
            {status === 'planning'
              ? `Planning ${taskName}...`
              : `Working on ${taskName}...`}
          </span>
        </div>
        <button
          type="button"
          onClick={onStop}
          disabled={isStopping}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/5 font-mono text-[9px] font-semibold tracking-wider text-black/50 uppercase transition-colors hover:bg-black/10 hover:text-black/80 disabled:opacity-50"
        >
          {isStopping ? (
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/10 border-t-black/40" />
          ) : (
            'Stop'
          )}
        </button>
      </div>

      {/* Activity steps */}
      <div className="mt-3 max-h-[200px] space-y-1.5 overflow-y-auto">
        {steps.map((step) => (
          <div
            key={step.toolUseId}
            className="flex items-center gap-2.5 py-0.5"
          >
            {step.isActive ? (
              <div className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-black/10 border-t-black/40" />
            ) : (
              <Check className="h-3.5 w-3.5 shrink-0 text-black/30" />
            )}
            <span className="text-[13px] font-medium text-black/60">
              {step.label}
            </span>
            {step.detail && (
              <span className="truncate font-mono text-[12px] text-black/30">
                {step.detail}
              </span>
            )}
            {step.linesAdded != null && step.linesAdded > 0 && (
              <span className="font-mono text-[12px] text-emerald-500/50 tabular-nums">
                +{step.linesAdded}
              </span>
            )}
            {step.isActive && step.elapsedSeconds > 0 && (
              <span className="ml-auto text-[12px] text-black/30 tabular-nums">
                {Math.round(step.elapsedSeconds)}s
              </span>
            )}
          </div>
        ))}
      </div>
    </>
  )
}

/* ── Compact active task pill ───────────────────────────────────── */

export function TaskWorkingContent({
  slug,
  title,
  status,
  onStop,
  isStopping,
  activitySteps,
}: {
  slug: string
  title?: string | null
  status: RunStatus
  onStop: () => void
  isStopping?: boolean
  activitySteps?: ActivityStep[]
}) {
  const lastStep = activitySteps?.findLast((s) => s.label)

  return (
    <>
      {/* Center zone */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {lastStep ? (
          <>
            <span className="shrink-0 text-sm font-medium text-black/80">
              {lastStep.label}
            </span>
            {lastStep.detail && (
              <span className="truncate text-sm text-black/40">
                {lastStep.detail}
              </span>
            )}
            {lastStep.linesAdded != null && lastStep.linesAdded > 0 && (
              <span className="shrink-0 text-sm text-emerald-500/60 tabular-nums">
                +{lastStep.linesAdded}
              </span>
            )}
          </>
        ) : (
          <span className="truncate text-sm font-medium text-black/80">
            {taskSentence(displayTitle(title, slug), status)}
          </span>
        )}
      </div>

      {/* Right zone */}
      <div className="flex shrink-0 items-center">
        {(status === 'planning' || status === 'working') && (
          <button
            type="button"
            onClick={onStop}
            disabled={isStopping}
            className="-mr-2 flex aspect-square h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-black/5 font-mono text-[10px] font-semibold tracking-wider text-black/50 uppercase transition-colors hover:bg-black/10 hover:text-black/80 disabled:opacity-50"
          >
            {isStopping ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-black/40" />
            ) : (
              'Stop'
            )}
          </button>
        )}
      </div>
    </>
  )
}
