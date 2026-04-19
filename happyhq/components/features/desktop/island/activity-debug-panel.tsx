import { useActivitySteps, useIsRunActive } from '@/stores/desktopStore'
import type { ActivityStep } from '../hooks/use-run-activity'

/** Self-subscribing wrapper — reads from store so HappyDesktop doesn't need to. */
export function ConnectedActivityDebugContent() {
  const activitySteps = useActivitySteps()
  const isRunActive = useIsRunActive()
  return (
    <ActivityDebugContent
      activitySteps={activitySteps}
      isRunActive={isRunActive}
    />
  )
}

interface ActivityDebugContentProps {
  activitySteps: ActivityStep[]
  isRunActive: boolean
}

export function ActivityDebugContent({
  activitySteps,
  isRunActive,
}: ActivityDebugContentProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900">
      {/* Status bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[10px] text-white/40">
          Steps: {activitySteps.length}
        </span>
        <span
          className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
            isRunActive
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
          }`}
        >
          {isRunActive ? 'RUN ACTIVE' : 'INACTIVE'}
        </span>
      </div>

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-white/90">
        {activitySteps.length === 0 ? (
          <div className="py-2 text-center text-white/30">
            No activity steps yet
          </div>
        ) : (
          <div className="space-y-1">
            {activitySteps.map((step) => (
              <div
                key={step.toolUseId}
                className={`flex items-center gap-2 rounded px-1.5 py-1 ${
                  step.isActive ? 'bg-white/10' : 'bg-white/5'
                }`}
              >
                <span
                  className={`text-[10px] font-bold ${
                    step.isActive ? 'text-amber-400' : 'text-white/30'
                  }`}
                >
                  {step.isActive ? '>' : '\u2713'}
                </span>
                <span className="text-white/70">{step.label}</span>
                {step.detail && (
                  <span className="min-w-0 truncate text-white/30">
                    {step.detail}
                  </span>
                )}
                {step.elapsedSeconds > 0 && (
                  <span className="ml-auto shrink-0 text-white/25 tabular-nums">
                    {step.elapsedSeconds.toFixed(1)}s
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
