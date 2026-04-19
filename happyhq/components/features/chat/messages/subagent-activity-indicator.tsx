'use client'

import type { SubagentActivity } from '@/lib/chat/types'
import { Check, Loader2 } from 'lucide-react'

interface SubagentActivityIndicatorProps {
  activities: SubagentActivity[]
}

export function SubagentActivityIndicator({
  activities,
}: SubagentActivityIndicatorProps) {
  if (activities.length === 0) return null

  return (
    <div className="space-y-1.5">
      {activities.map((activity) => (
        <SubagentStep key={activity.taskId} activity={activity} />
      ))}
    </div>
  )
}

function SubagentStep({ activity }: { activity: SubagentActivity }) {
  const elapsed =
    activity.durationMs != null ? (activity.durationMs / 1000).toFixed(1) : null

  return (
    <div className={activity.isComplete ? '' : 'animate-fade-in'}>
      <div className="flex items-baseline gap-2">
        {activity.isComplete ? (
          <Check className="text-muted-foreground h-4 w-4 shrink-0 translate-y-[2px]" />
        ) : (
          <Loader2 className="text-muted-foreground h-4 w-4 shrink-0 translate-y-[2px] animate-spin" />
        )}
        <span className="text-foreground text-sm font-medium">
          {activity.description}
        </span>
        {!activity.isComplete && activity.progress && (
          <span className="text-muted-foreground text-xs">
            {activity.progress}
          </span>
        )}
        {activity.isComplete && (
          <span className="text-muted-foreground text-xs">
            {activity.summary ?? 'done'}
            {activity.toolUses != null && (
              <> &middot; {activity.toolUses} tools</>
            )}
            {elapsed != null && <> &middot; {elapsed}s</>}
          </span>
        )}
      </div>
    </div>
  )
}
