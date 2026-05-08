import { Check, CircleAlert, LoaderCircle, Pause, Route } from 'lucide-react'

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/common/ui/tooltip'
import type { RunInfo } from '@/lib/fs/types'

export function TaskStatusBadge({ run }: { run: RunInfo | null }) {
  if (!run) return null
  const { status } = run
  if (status === 'plan_ready') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex size-3.5 items-center justify-center rounded bg-blue-500/15">
            <Route className="size-2 text-blue-600" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          Plan ready
        </TooltipContent>
      </Tooltip>
    )
  }
  if (
    status === 'discovering' ||
    status === 'planning' ||
    status === 'working'
  ) {
    const label =
      status === 'discovering'
        ? 'Reviewing'
        : status === 'planning'
          ? 'Planning'
          : 'Working'
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex size-3.5 items-center justify-center">
            <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {label}
        </TooltipContent>
      </Tooltip>
    )
  }
  if (status === 'completed') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex size-3.5 items-center justify-center rounded bg-emerald-500/15">
            <Check className="size-2 text-emerald-600" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          Work completed
        </TooltipContent>
      </Tooltip>
    )
  }
  if (status === 'stopped') {
    const isBudget = run.stopReason === 'budget'
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`flex size-3.5 items-center justify-center rounded ${isBudget ? 'bg-violet-500/15' : 'bg-amber-500/15'}`}
          >
            {isBudget ? (
              <Pause className="size-2 text-violet-600" />
            ) : (
              <CircleAlert className="size-2 text-amber-600" />
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {isBudget ? 'Paused' : 'Agent stopped'}
        </TooltipContent>
      </Tooltip>
    )
  }
  return null
}
