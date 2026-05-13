'use client'

import { FileList } from '@/components/common/atoms/file-list'
import { useBillingData } from '@/components/features/billing/use-billing-data'
import { openChatSessionWindow } from '@/components/features/desktop/windows/chat/open-chat-window'
import { ActivityHeader } from '@/components/features/tasks/atoms/activity-header'
import { ConfirmRestartAlert } from '@/components/features/tasks/atoms/confirm-restart-alert'
import {
  SectionHeader,
  formatDuration,
} from '@/components/features/tasks/atoms/section-header'
import { WorkingRow } from '@/components/features/tasks/atoms/working-row'
import { deleteFile } from '@/lib/actions'
import { getWorkingPhases } from '@/lib/fs/run-info'
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
 * Outputs/work section — mirrors the panel's work section behavior.
 *
 * During working: ActivityHeader (live step) + files + WorkingRow
 * After working: "Worked for Xm" header + files + restart button
 *
 * The activity header and section header occupy the same slot.
 */
export function OutputsSection({
  isWorking,
  streamSlug,
}: {
  isWorking?: boolean
  streamSlug: string | null
}) {
  const content = useTaskContentData()
  const runApprove = useTaskStore((s) => s.runApprove)
  const runContinue = useTaskStore((s) => s.runContinue)
  const runStop = useTaskStore((s) => s.runStop)
  const runActionsLoading = useTaskStore((s) => s.runActionsLoading)
  const upgradeNeeded = useTaskStore((s) => s.runActionsUpgradeNeeded)
  const isRunActive = useTaskStore((s) => s.isRunActive)
  const activitySteps = useTaskStore((s) => s.activitySteps)
  const taskSlug = useActiveTaskSlug()
  const isStopping = useTaskStore((s) => s.runActionsStopping)
  const refresh = useTaskMutate()
  const router = useRouter()

  const [restartOpen, setRestartOpen] = useState(false)

  const outputs = content?.outputs ?? []
  const workingFiles = content?.working ?? []

  const runStatus = content?.run?.status ?? null
  const billing = useBillingData()
  const isFinished = runStatus === 'completed' || runStatus === 'stopped'
  const isStopped = runStatus === 'stopped'
  const stoppedDuringWorking =
    isStopped && content?.run?.stoppedDuring === 'working'
  const isBudgetStop = content?.run?.stopReason === 'budget'

  const workingPhases = getWorkingPhases(content?.run)
  const workDurationMs = workingPhases.reduce((sum, p) => sum + p.durationMs, 0)
  const workingSessionIds = workingPhases
    .map((p) => p.sessionId)
    .filter((id): id is string => !!id)

  const lastStep = activitySteps.findLast((s) => s.label)

  return (
    <>
      <ConfirmRestartAlert
        open={restartOpen}
        onClose={() => setRestartOpen(false)}
        title="Redo the work?"
        description="Q will redo the work using the same plan. Your current results will be replaced."
        onConfirm={() => runApprove?.()}
      />

      <div className="flex flex-col gap-0.5 px-2 py-3">
        {isWorking ? (
          <ActivityHeader
            label={lastStep?.label ?? 'Working...'}
            detail={lastStep?.detail}
            onStop={runStop ? () => runStop() : undefined}
            isStopping={isStopping}
          />
        ) : stoppedDuringWorking ? (
          <SectionHeader
            label={`Working ${isBudgetStop ? 'paused' : 'stopped'} after ${formatDuration(workDurationMs)}`}
            onLabelClick={
              workingSessionIds.length > 0 && streamSlug && taskSlug
                ? () =>
                    openChatSessionWindow(
                      streamSlug,
                      workingSessionIds,
                      'Working Session',
                      `chat-${taskSlug}-working`,
                    )
                : undefined
            }
            rightSlot={
              isBudgetStop ? (
                <button
                  type="button"
                  onClick={() => runContinue?.()}
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
                    onClick={() => runContinue?.()}
                    disabled={runActionsLoading}
                    className="flex h-5 shrink-0 items-center justify-center rounded-full bg-zinc-700 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-zinc-600 disabled:opacity-30"
                  >
                    Continue
                  </button>
                </div>
              )
            }
          />
        ) : isFinished ? (
          <SectionHeader
            label="Worked"
            durationMs={workDurationMs}
            onRestart={() => setRestartOpen(true)}
            restartTooltip={
              <>
                Redo the work
                <br />
                from the same plan
              </>
            }
            disabled={runActionsLoading || isRunActive}
            onLabelClick={
              workingSessionIds.length > 0 && streamSlug && taskSlug
                ? () =>
                    openChatSessionWindow(
                      streamSlug,
                      workingSessionIds,
                      'Working Session',
                      `chat-${taskSlug}-working`,
                    )
                : undefined
            }
          />
        ) : null}
        <FileList
          files={outputs}
          onFileClick={
            streamSlug && taskSlug
              ? (file) => {
                  if (!file.path) return
                  sessionStorage.setItem(
                    'happyhq:pending-open',
                    JSON.stringify({
                      taskSlug,
                      name: file.name,
                      path: file.path,
                    }),
                  )
                  router.push(
                    `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(taskSlug)}`,
                  )
                }
              : undefined
          }
          onFileDelete={
            isFinished
              ? async (file) => {
                  if (file.path) {
                    await deleteFile(file.path)
                    useWindowStore.getState().closeWindowForFile(file.path)
                    refresh?.()
                  }
                }
              : undefined
          }
        />
        <FileList
          files={workingFiles}
          onFileClick={
            streamSlug && taskSlug
              ? (file) => {
                  if (!file.path) return
                  sessionStorage.setItem(
                    'happyhq:pending-open',
                    JSON.stringify({
                      taskSlug,
                      name: file.name,
                      path: file.path,
                    }),
                  )
                  router.push(
                    `/${encodeURIComponent(streamSlug)}/${encodeURIComponent(taskSlug)}`,
                  )
                }
              : undefined
          }
          onFileDelete={
            isFinished
              ? async (file) => {
                  if (file.path) {
                    await deleteFile(file.path)
                    useWindowStore.getState().closeWindowForFile(file.path)
                    refresh?.()
                  }
                }
              : undefined
          }
        />
        {isWorking && <WorkingRow />}
      </div>
    </>
  )
}
