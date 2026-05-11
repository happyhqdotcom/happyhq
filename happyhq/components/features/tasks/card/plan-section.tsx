'use client'

import { useBillingData } from '@/components/features/billing/use-billing-data'
import { openChatSessionWindow } from '@/components/features/desktop/windows/chat/open-chat-window'
import { ActivityHeader } from '@/components/features/tasks/atoms/activity-header'
import { ConfirmRestartAlert } from '@/components/features/tasks/atoms/confirm-restart-alert'
import { PlanFileRow } from '@/components/features/tasks/atoms/plan-file-row'
import {
  SectionHeader,
  formatDuration,
} from '@/components/features/tasks/atoms/section-header'
import { WorkingRow } from '@/components/features/tasks/atoms/working-row'
import { deleteFile } from '@/lib/actions'
import { getPlanningPhase } from '@/lib/fs/run-info'
import { useTaskStore } from '@/stores/taskStore'
import { useWindowStore } from '@/stores/windowStore'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  useActiveTaskSlug,
  useTaskContentData,
  useTaskMutate,
} from '../hooks/use-task-swr'

/**
 * Plan section — mirrors the panel's plan section behavior.
 *
 * During planning: ActivityHeader (live step) + plan.md (if exists) + WorkingRow
 * After planning: "Planned for Xm" header + plan.md + approve/restart buttons
 *
 * The activity header and section header occupy the same slot — the activity
 * transforms into the duration label when the phase completes.
 */
export function PlanSection({
  isPlanning,
  streamSlug,
}: {
  isPlanning?: boolean
  streamSlug: string | null
}) {
  const content = useTaskContentData()
  const runStatus = content?.run?.status ?? null
  const runStart = useTaskStore((s) => s.runStart)
  const runStop = useTaskStore((s) => s.runStop)
  const runApprove = useTaskStore((s) => s.runApprove)
  const runActionsLoading = useTaskStore((s) => s.runActionsLoading)
  const isRunActive = useTaskStore((s) => s.isRunActive)
  const activitySteps = useTaskStore((s) => s.activitySteps)
  const taskSlug = useActiveTaskSlug()
  const isStopping = useTaskStore((s) => s.runActionsStopping)
  const refresh = useTaskMutate()
  const router = useRouter()

  const [restartOpen, setRestartOpen] = useState(false)

  const runContinue = useTaskStore((s) => s.runContinue)
  const upgradeNeeded = useTaskStore((s) => s.runActionsUpgradeNeeded)
  const billing = useBillingData()

  const isPlanReady = runStatus === 'plan_ready'
  const isFinished = runStatus === 'completed' || runStatus === 'stopped'
  const isStopped = runStatus === 'stopped'
  const stoppedDuringPlanning =
    isStopped && content?.run?.stoppedDuring === 'planning'
  const isBudgetStop = content?.run?.stopReason === 'budget'

  const planningPhase = getPlanningPhase(content?.run)
  const planDurationMs = planningPhase?.durationMs ?? 0

  const lastStep = activitySteps.findLast((s) => s.label)

  return (
    <>
      <ConfirmRestartAlert
        open={restartOpen}
        onClose={() => setRestartOpen(false)}
        title="Start Over?"
        description="Q will restart this task from the planning phase. Your plan and current results will be replaced."
        onConfirm={() => runStart?.()}
      />

      <div className="flex flex-col gap-0.5 px-2 py-3">
        {isPlanning ? (
          <ActivityHeader
            label={lastStep?.label ?? 'Planning...'}
            detail={lastStep?.detail}
            onStop={runStop ? () => runStop() : undefined}
            isStopping={isStopping}
          />
        ) : stoppedDuringPlanning ? (
          <SectionHeader
            label={`Planning ${isBudgetStop ? 'paused' : 'stopped'} after ${formatDuration(planDurationMs)}`}
            rightSlot={
              isBudgetStop ? (
                <button
                  type="button"
                  onClick={() => runContinue?.('planning')}
                  disabled={
                    runActionsLoading ||
                    upgradeNeeded ||
                    (billing != null && billing.remainingMinutes <= 0)
                  }
                  className="flex h-5 shrink-0 items-center justify-center rounded-full bg-violet-700 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-violet-600 disabled:opacity-30"
                >
                  Continue
                </button>
              ) : (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setRestartOpen(true)}
                    disabled={runActionsLoading || isRunActive}
                    className="flex h-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-zinc-600 uppercase transition-colors hover:bg-zinc-300 disabled:opacity-30"
                  >
                    Restart
                  </button>
                  <button
                    type="button"
                    onClick={() => runContinue?.('planning')}
                    disabled={runActionsLoading}
                    className="flex h-5 shrink-0 items-center justify-center rounded-full bg-zinc-700 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-zinc-600 disabled:opacity-30"
                  >
                    Continue
                  </button>
                </div>
              )
            }
          />
        ) : (
          <SectionHeader
            label="Planned"
            durationMs={planDurationMs}
            onRestart={isFinished ? () => setRestartOpen(true) : undefined}
            restartTooltip={
              <>
                Start over
                <br />
                from a new plan
              </>
            }
            disabled={runActionsLoading || isRunActive}
            onLabelClick={
              planningPhase?.sessionId && streamSlug && taskSlug
                ? () =>
                    openChatSessionWindow(
                      streamSlug,
                      [planningPhase.sessionId],
                      'Planning Session',
                      `chat-${taskSlug}-planning`,
                    )
                : undefined
            }
          />
        )}

        {content?.plan && (
          <PlanFileRow
            isPlanReady={isPlanReady}
            onTryAgain={() => runStop?.().then(() => runStart?.())}
            onApprove={() => runApprove?.()}
            onOpenFile={
              streamSlug && taskSlug
                ? () => {
                    const path = `tasks/${taskSlug}/plan.md`
                    sessionStorage.setItem(
                      'happyhq:pending-open',
                      JSON.stringify({ taskSlug, name: 'plan.md', path }),
                    )
                    router.push(
                      `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(taskSlug)}`,
                    )
                  }
                : undefined
            }
            onDelete={
              isFinished && taskSlug
                ? async () => {
                    await deleteFile(`tasks/${taskSlug}/plan.md`)
                    useWindowStore
                      .getState()
                      .closeWindowForFile(`tasks/${taskSlug}/plan.md`)
                    refresh?.()
                  }
                : undefined
            }
            filePath={taskSlug ? `tasks/${taskSlug}/plan.md` : undefined}
            disabled={runActionsLoading}
          />
        )}

        {isPlanning && <WorkingRow />}
      </div>
    </>
  )
}
