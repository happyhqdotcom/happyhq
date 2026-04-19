'use client'

import { toastError, toastWarning } from '@/components/common/ui/sonner'
import { UpgradePrompt } from '@/components/features/billing/upgrade-prompt'
import { useFileDrop } from '@/components/features/desktop/windows/shared/use-file-drop'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { ingestTaskInput } from '@/lib/actions'
import type { TaskItem } from '@/lib/fs/types'
import { useTaskStore } from '@/stores/taskStore'
import { useCallback, useState } from 'react'
import { useTaskData } from '../hooks/use-task-data'
import { useTaskContentData, useTaskMutate } from '../hooks/use-task-swr'
import { AttachmentsSection } from './attachments-section'
import { DescriptionSection } from './description-section'
import { OutputsSection } from './outputs-section'
import { PlanSection } from './plan-section'

/**
 * Compact task card for the home page task list (expand/collapse).
 *
 * Sections mirror the desktop TaskPanel behavior:
 * - Planning: context + plan section (activity header → plan.md → working row)
 * - Plan ready: context + plan section ("Planned for Xm" → plan.md → approve)
 * - Running: context + plan section ("Planned for Xm") + outputs section (activity header → files → working row)
 * - Finished: context + plan section ("Planned for Xm") + outputs section ("Worked for Xm" → files)
 *
 * Activity headers and section headers occupy the same slot — the activity
 * transforms into the duration label when each phase completes.
 */
export function TaskCard({ taskItem }: { taskItem: TaskItem }) {
  // Data lifecycle — SSE activity, run actions, debounced refresh, run-end detection.
  // Lives here (inside SWRConfig boundary) so all useTaskSWR() hooks see data on frame 1.
  useTaskData({
    taskSlug: taskItem.slug,
    streamSlug: taskItem.frontmatter.stream ?? null,
    taskTitle: taskItem.frontmatter.title,
  })

  const content = useTaskContentData()
  const refresh = useTaskMutate()
  const runStart = useTaskStore((s) => s.runStart)
  const runActionsLoading = useTaskStore((s) => s.runActionsLoading)
  const runActionsUpgradeNeeded = useTaskStore((s) => s.runActionsUpgradeNeeded)
  const billingWarning = useTaskStore((s) => s.runActionsBillingWarning)
  const taskTitle = useTaskStore((s) => s.taskTitle)
  const taskSlug = useTaskStore((s) => s.taskSlug)
  const streamSlug = useTaskStore((s) => s.streamSlug)

  const { token } = useCurrentUser()

  // Derive status from TaskItem first (instant), SWR content second (may be delayed).
  const runStatus = content?.run?.status ?? taskItem.run?.status ?? null
  const isIdle = !runStatus
  const isPlanning = runStatus === 'planning'
  const isWorking = runStatus === 'working'
  const isFinished = runStatus === 'completed' || runStatus === 'stopped'
  const isStopped = runStatus === 'stopped'
  const stoppedDuringPlanning =
    isStopped && content?.run?.stoppedDuring === 'planning'
  const stoppedDuringWorking =
    isStopped && content?.run?.stoppedDuring === 'working'
  const isBudgetStop = content?.run?.stopReason === 'budget'

  const hasOutputs =
    (content?.outputs?.length ?? 0) > 0 || (content?.working?.length ?? 0) > 0
  const visibleInputs = (content?.inputs ?? []).filter(
    (i) => i.name !== 'context',
  )
  const hasDescription = !!(
    content?.description ?? taskItem.description
  )?.trim()
  const canStart =
    streamSlug != null &&
    !!taskTitle.trim() &&
    (hasDescription || visibleInputs.length > 0)

  // ── Drag-and-drop file upload ─────────────────────────────────────
  const [isUploading, setIsUploading] = useState(false)
  const handleFiles = useCallback(
    async (files: FileList) => {
      const fileList = Array.from(files)
      if (fileList.length === 0) return
      setIsUploading(true)
      try {
        for (const file of fileList) {
          const formData = new FormData()
          formData.append('file', file)
          const result = await ingestTaskInput(
            taskSlug!,
            formData,
            token ?? undefined,
          )
          if (result.quality === 'poor' || result.quality === 'empty') {
            toastWarning(
              `"${file.name.length > 20 ? file.name.slice(0, 20) + '…' : file.name}" not optimized for AI comprehension`,
            )
          }
        }
        refresh?.()
      } catch {
        toastError(
          'Something went wrong adding this file. Files must be under 100MB.',
        )
      } finally {
        setIsUploading(false)
      }
    },
    [taskSlug, token, refresh],
  )
  const { isDragOver, dragHandlers } = useFileDrop(handleFiles, {
    enabled: isIdle,
  })

  // ── Sections ──────────────────────────────────────────────────────
  const sections: React.ReactNode[] = []

  // Context: description + attachments are one logical group
  sections.push(
    <div key="context">
      <DescriptionSection />
      <AttachmentsSection />
    </div>,
  )

  // Plan section — shows during planning (activity header) and after (duration header)
  // Only animate fade-in when a run is active (section appearing mid-run),
  // not when opening a task that already has these sections.
  if (isPlanning || stoppedDuringPlanning || content?.plan) {
    sections.push(
      <div
        key="plan"
        className={isPlanning || isWorking ? 'animate-fade-in-fast' : ''}
      >
        <PlanSection isPlanning={isPlanning} />
      </div>,
    )
  }

  // Outputs section
  if (isWorking || stoppedDuringWorking || hasOutputs) {
    sections.push(
      <div
        key="outputs"
        className={isPlanning || isWorking ? 'animate-fade-in-fast' : ''}
      >
        <OutputsSection isWorking={isWorking} />
      </div>,
    )
  }

  return (
    <div {...dragHandlers} className="relative flex flex-col">
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-md border border-pink-300 bg-pink-50/70 backdrop-blur-sm">
          <p className="text-sm font-medium text-pink-400">
            Drop files to add them to this task
          </p>
        </div>
      )}

      {sections.map((section, i) => (
        <div key={i}>
          {i > 0 && !isIdle && <hr className="my-0 border-zinc-200" />}
          {section}
        </div>
      ))}

      {/* Low balance footer — non-idle states */}
      {!isIdle &&
        !(isStopped && isBudgetStop) &&
        billingWarning === 'low_balance' && (
          <div className="animate-fade-in-fast overflow-hidden rounded-b-md border-t border-zinc-200 bg-zinc-50">
            <div className="flex items-center justify-between gap-3 bg-violet-100/60 px-4 py-3">
              <span className="text-sm text-violet-800">
                Less than 5 minutes of usage left
              </span>
              <UpgradePrompt variant="inline-small" title="Upgrade" />
            </div>
          </div>
        )}

      {/* Start Task footer — always visible when idle, disabled until ready */}
      {isIdle && (
        <div className="rounded-b-md border-t border-zinc-100 bg-zinc-50">
          {runActionsUpgradeNeeded && (
            <div className="flex items-center justify-between gap-3 border-b border-violet-300/40 bg-violet-100/60 px-4 py-2">
              <span className="text-sm text-violet-800">
                Upgrade for more usage
              </span>
              <UpgradePrompt variant="inline-small" title="Upgrade" />
            </div>
          )}
          {!runActionsUpgradeNeeded && billingWarning === 'low_balance' && (
            <div className="flex items-center justify-between gap-3 border-b border-violet-300/40 bg-violet-100/60 px-4 py-2">
              <span className="text-sm text-violet-800">
                Less than 5 minutes of usage left
              </span>
              <UpgradePrompt variant="inline-small" title="Upgrade" />
            </div>
          )}
          <div className="flex items-center justify-center px-4 py-2.5">
            <button
              type="button"
              onClick={() => runStart?.()}
              disabled={
                !canStart || runActionsLoading || runActionsUpgradeNeeded
              }
              title={
                streamSlug == null
                  ? 'Assign a stream to run this task'
                  : undefined
              }
              className="flex h-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-3 font-mono text-[10px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-zinc-800 disabled:opacity-30"
            >
              Start Task
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
