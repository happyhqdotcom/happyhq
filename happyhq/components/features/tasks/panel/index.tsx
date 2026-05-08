'use client'

import { FileList } from '@/components/common/atoms/file-list'
import {
  Listbox,
  ListboxLabel,
  ListboxOption,
} from '@/components/common/catalyst/listbox'
import {
  SidebarHeading,
  SidebarSection,
} from '@/components/common/catalyst/sidebar'
import { DeleteAlert } from '@/components/common/shared/delete-alert'
import { UpgradePrompt } from '@/components/features/billing/upgrade-prompt'
import { useBillingData } from '@/components/features/billing/use-billing-data'
import {
  useActiveTask,
  useDesktopMutate,
  useTaskContent,
  useTaskStatus,
} from '@/components/features/desktop/hooks/use-desktop-data'
import {
  CloseButton,
  SettingsButton,
  Shell,
  Sidebar,
} from '@/components/features/desktop/panels/atoms'
import { openChatSessionWindow } from '@/components/features/desktop/windows/chat/open-chat-window'
import { useFileDrop } from '@/components/features/desktop/windows/shared/use-file-drop'
import { ActivityHeader } from '@/components/features/tasks/atoms/activity-header'
import { AttachmentList } from '@/components/features/tasks/atoms/attachment-list'
import { ConfirmRestartAlert } from '@/components/features/tasks/atoms/confirm-restart-alert'
import { PlanFileRow } from '@/components/features/tasks/atoms/plan-file-row'
import { ReadOnlyDescription } from '@/components/features/tasks/atoms/readonly-description'
import {
  SectionHeader,
  formatDuration,
} from '@/components/features/tasks/atoms/section-header'
import { WorkingRow } from '@/components/features/tasks/atoms/working-row'
import { useOptimisticUploads } from '@/components/features/tasks/hooks/use-optimistic-uploads'
import { shouldShowWorkSection } from '@/components/features/tasks/panel/work-gate'
import { canStartIdleTask } from '@/components/features/tasks/start-gate'
import {
  deleteFile,
  deleteTaskByLocation,
  deleteTaskInput,
  toggleTaskDone,
  updateTaskStream,
  writeTaskDescription,
  writeTaskTitle,
} from '@/lib/actions'
import { ALLOWED_INPUT_ACCEPT } from '@/lib/file-types'
import { displayTitle } from '@/lib/format'
import {
  getDiscoveryPhase,
  getPlanningPhase,
  getWorkingPhases,
} from '@/lib/fs/run-info'
import type { FileItem } from '@/lib/fs/types'
import { invalidateStream } from '@/lib/swr-helpers'
import { taskItemsKey } from '@/lib/swr-keys'
import {
  useActivitySteps,
  useRunActions,
  useStreamSlug,
  useTaskFocusTarget,
} from '@/stores/desktopStore'
import { useStreams } from '@/stores/streamsStore'
import { useWindowStore } from '@/stores/windowStore'
import { Trash2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useSWRConfig } from 'swr'

interface TaskPanelProps {
  openFileWindow: (entry: {
    name: string
    title?: string
    path: string
    rawPath?: string | null
  }) => void
  sidebarOpen: boolean
  onSidebarOpenChange: (open: boolean) => void
}

export function TaskPanel({
  openFileWindow,
  sidebarOpen,
  onSidebarOpenChange,
}: TaskPanelProps) {
  const router = useRouter()
  const taskSlug = useParams<{ task?: string }>().task
  const activeTask = useActiveTask()
  const { mutate } = useSWRConfig()
  const taskContent = useTaskContent()
  const streamSlug = useStreamSlug()
  const runActions = useRunActions()
  const refresh = useDesktopMutate()
  const streams = useStreams()
  const taskStatus = useTaskStatus()
  const activitySteps = useActivitySteps()

  const billing = useBillingData()

  const isFinished = taskStatus === 'completed' || taskStatus === 'stopped'
  const isStopped = taskStatus === 'stopped'
  const stoppedDuringDiscovery =
    isStopped && taskContent?.run?.stoppedDuring === 'discovery'
  const stoppedDuringPlanning =
    isStopped && taskContent?.run?.stoppedDuring === 'planning'
  const stoppedDuringWorking =
    isStopped && taskContent?.run?.stoppedDuring === 'working'
  const isBudgetStop = taskContent?.run?.stopReason === 'budget'
  const hasRun = taskStatus !== null
  const isRunning =
    taskStatus === 'discovering' ||
    taskStatus === 'planning' ||
    taskStatus === 'working'
  const billingExhausted = billing != null && billing.remainingMinutes <= 0
  const pendingQuestions = taskContent?.run?.pendingQuestions

  // ── Local state (source of truth while editing) ─────────────────────
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  // Hide legacy `inputs/context.md` from the visible inputs list — its content
  // is the description (now in `task.md` body) and `readTaskContent` already
  // surfaces it via the description field for tasks that predate the migration.
  // Safe to remove once no live task has a loose `inputs/context.md`.
  const visibleInputs: FileItem[] = (taskContent?.inputs ?? []).filter(
    (i) => i.name !== 'context',
  )
  const { pendingFiles, isUploading, handleFiles, fileInputRef } =
    useOptimisticUploads({
      taskSlug,
      refresh,
      resolvedNames: visibleInputs.map((i) => i.name),
    })
  const [initialized, setInitialized] = useState(false)
  const isDone = !!activeTask?.frontmatter.completedAt
  const [checked, setChecked] = useState(isDone)
  const [lastServerDone, setLastServerDone] = useState(isDone)

  // Sync when server state changes (SWR refetch) — inline setState during render
  if (isDone !== lastServerDone) {
    setLastServerDone(isDone)
    setChecked(isDone)
  }
  const [restartAlert, setRestartAlert] = useState<
    'replan' | 'run-again' | null
  >(null)
  const [deleteAlert, setDeleteAlert] = useState(false)
  const [isEditingDescription, setIsEditingDescription] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  const titleInputRef = useRef<HTMLInputElement>(null)
  const descriptionRef = useRef<HTMLTextAreaElement>(null)
  const titleTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const descTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  )
  const [focusTarget, setFocusTarget] = useTaskFocusTarget()

  // Initialize from server data — inline during render so title/description
  // are visible on the very first paint (no useEffect timing gap).
  // Title is the raw frontmatter value (not displayTitle's slug fallback) so
  // the start-task gate sees what the user actually saved — see issue #255.
  if (taskContent && activeTask && !initialized) {
    setTitle(activeTask.frontmatter.title ?? '')
    setDescription(taskContent.description ?? '')
    setInitialized(true)
  }

  // Reset when navigating to a different task
  const prevSlug = useRef(taskSlug)
  useEffect(() => {
    if (taskSlug !== prevSlug.current) {
      prevSlug.current = taskSlug
      setInitialized(false)
    }
  }, [taskSlug])

  // ── Debounced saves ─────────────────────────────────────────────────
  const handleTitleChange = (value: string) => {
    setTitle(value)
    clearTimeout(titleTimerRef.current)
    titleTimerRef.current = setTimeout(async () => {
      if (!taskSlug) return
      await writeTaskTitle(taskSlug, value)
      invalidateStream(streamSlug)
      mutate(taskItemsKey())
      refresh?.()
    }, 500)
  }

  const handleDescriptionChange = (value: string) => {
    setDescription(value)
    clearTimeout(descTimerRef.current)
    descTimerRef.current = setTimeout(async () => {
      if (!taskSlug) return
      await writeTaskDescription(taskSlug, value)
      refresh?.()
    }, 500)
  }

  // Flush pending saves on unmount
  useEffect(() => {
    return () => {
      clearTimeout(titleTimerRef.current)
      clearTimeout(descTimerRef.current)
    }
  }, [])

  // Focus target from canvas checklist
  useEffect(() => {
    if (!focusTarget) return
    if (focusTarget === 'title') {
      titleInputRef.current?.focus()
    } else if (focusTarget === 'description') {
      descriptionRef.current?.focus()
    } else if (focusTarget === 'sidebar') {
      onSidebarOpenChange(true)
    }
    setFocusTarget(null)
  }, [focusTarget, setFocusTarget, onSidebarOpenChange])

  // ── Auto-resize textarea ────────────────────────────────────────────
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = ''
    if (el.scrollHeight > el.clientHeight) {
      el.style.height = `${el.scrollHeight}px`
    }
  }

  const handleDeleteInput = useCallback(
    async (inputName: string) => {
      if (!taskSlug) return
      await deleteTaskInput(taskSlug, inputName)
      refresh()
    },
    [taskSlug, refresh],
  )

  const { isDragOver, dragHandlers } = useFileDrop(handleFiles, {
    enabled: true,
  })

  const outputs = taskContent?.outputs ?? []
  const workingFiles = taskContent?.working ?? []
  const hasWorkFiles = outputs.length > 0 || workingFiles.length > 0
  let discoveryPhase = getDiscoveryPhase(taskContent?.run)
  let planningPhase = getPlanningPhase(taskContent?.run)
  const workingPhases = getWorkingPhases(taskContent?.run)
  const discoveryDurationMs = discoveryPhase?.durationMs ?? 0
  const planDurationMs = planningPhase?.durationMs ?? 0
  const workDurationMs = workingPhases.reduce((sum, p) => sum + p.durationMs, 0)
  const workingSessionIds = workingPhases
    .map((p) => p.sessionId)
    .filter((id): id is string => !!id)

  return (
    <Shell
      {...dragHandlers}
      className={
        isDragOver
          ? 'bg-zinc-100/70 ring-zinc-400 transition-colors'
          : 'transition-colors'
      }
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ALLOWED_INPUT_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) handleFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {/* ── Restart confirmation alerts ──────────────────────────────── */}
      <ConfirmRestartAlert
        open={restartAlert === 'replan'}
        onClose={() => setRestartAlert(null)}
        title="Start Over?"
        description="Q will restart this task from the planning phase. Your plan and current results will be replaced."
        onConfirm={() => runActions.start?.()}
      />
      <ConfirmRestartAlert
        open={restartAlert === 'run-again'}
        onClose={() => setRestartAlert(null)}
        title="Redo the work?"
        description="Q will redo the work using the same plan. Your current results will be replaced."
        onConfirm={() => runActions.approve?.()}
      />

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* Left — title, context, attachments/outputs */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div
            className="@container/card flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-none"
            onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
          >
            {/* Title row — styled to match stream panel header */}
            <div
              className={`sticky top-0 z-10 flex items-center gap-2 bg-white px-5 pt-4 pb-3 ${scrolled ? 'border-b border-zinc-200' : ''}`}
            >
              <button
                type="button"
                onClick={async () => {
                  if (!taskSlug) return
                  const prev = checked
                  setChecked(!prev)
                  try {
                    await toggleTaskDone(taskSlug)
                    await mutate(taskItemsKey())
                  } catch {
                    setChecked(prev)
                  }
                }}
                className="shrink-0 transition-colors"
              >
                {checked ? (
                  <span className="flex size-5 items-center justify-center rounded-full bg-zinc-400 transition-all">
                    <svg
                      className="size-3 text-white"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2.5 6.5L5 9L9.5 3" />
                    </svg>
                  </span>
                ) : (
                  <span className="block size-5 rounded-full border border-zinc-300 transition-all hover:border-zinc-400" />
                )}
              </button>
              <input
                ref={titleInputRef}
                type="text"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="What needs to be done?"
                className={`min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400 ${checked ? 'line-through' : ''}`}
                style={{
                  fontFamily: "'Avenir Next', system-ui, sans-serif",
                  fontSize: '19.5px',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.5,
                  color: checked ? '#9ca3af' : '#333333',
                }}
              />
              <SettingsButton
                onToggle={() => onSidebarOpenChange(!sidebarOpen)}
              />
              <CloseButton />
            </div>

            {/* Description — click-to-edit rendered markdown, always textarea for drafts */}
            <div className="px-5">
              {hasRun && description && !isEditingDescription ? (
                <div
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('button')) return
                    setIsEditingDescription(true)
                  }}
                  className="cursor-text"
                >
                  <ReadOnlyDescription description={description} />
                </div>
              ) : (
                <textarea
                  ref={(el) => {
                    descriptionRef.current = el
                    if (el) {
                      autoResize(el)
                      if (isEditingDescription) {
                        el.focus()
                        el.selectionStart = el.selectionEnd = el.value.length
                      }
                    }
                  }}
                  value={description}
                  onChange={(e) => {
                    if (!isEditingDescription) setIsEditingDescription(true)
                    handleDescriptionChange(e.target.value)
                    autoResize(e.currentTarget)
                  }}
                  onBlur={() => setIsEditingDescription(false)}
                  placeholder="Add context..."
                  rows={8}
                  className="w-full resize-none border-0 bg-transparent p-0 text-sm outline-none placeholder:text-zinc-400"
                  style={{
                    color: '#424242',
                    fontFamily: "'Avenir Next', system-ui, sans-serif",
                    lineHeight: 1.65,
                  }}
                />
              )}
            </div>

            {/* Attachments */}
            <AttachmentList
              inputs={visibleInputs}
              readOnly={false}
              pendingFiles={pendingFiles}
              onAdd={() => fileInputRef.current?.click()}
              onDelete={(name) => handleDeleteInput(name)}
              onFileClick={(input) =>
                openFileWindow({
                  name: input.originalName,
                  title: displayTitle(input.title, input.name),
                  path: input.originalPath,
                  rawPath: input.rawPath,
                })
              }
              className={hasRun ? 'px-3 py-4' : 'flex-1 px-3 pt-4 pb-5'}
            />

            {/* Discovery section — active, stopped during discovery, or completed.
                Per spec: header text stays "Reviewing the task..." even when
                questions are pending — the question UI lives in the island. */}
            {(taskStatus === 'discovering' ||
              stoppedDuringDiscovery ||
              discoveryPhase) && (
              <div className="animate-fade-in-fast">
                <hr className="border-zinc-200" />
                <div className="flex flex-col gap-0.5 px-3 py-4">
                  {taskStatus === 'discovering' ? (
                    <>
                      <ActivityHeader
                        label="Reviewing the task..."
                        detail={
                          pendingQuestions && pendingQuestions.length > 0
                            ? undefined
                            : activitySteps.findLast((s) => s.label)?.detail
                        }
                        onStop={() => runActions.stop?.()}
                        isStopping={runActions.isStopping}
                      />
                      {pendingQuestions && pendingQuestions.length > 0 && (
                        <div className="group flex h-8 w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-zinc-950/5">
                          <span
                            className="inline-flex shrink-0 items-center justify-center rounded"
                            style={{
                              width: 18,
                              height: 18,
                              backgroundColor: '#FFEFB8',
                              color: '#A05900',
                              fontFamily: 'ui-monospace, monospace',
                              fontSize: '10px',
                              fontWeight: 700,
                              lineHeight: 1,
                            }}
                          >
                            {pendingQuestions.length}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm text-zinc-700">
                            {pendingQuestions.length === 1
                              ? 'Pending Question'
                              : 'Pending Questions'}
                          </span>
                        </div>
                      )}
                    </>
                  ) : stoppedDuringDiscovery ? (
                    <SectionHeader
                      label={`Review ${isBudgetStop ? 'paused' : 'stopped'} after ${formatDuration(discoveryDurationMs)}`}
                      rightSlot={
                        <button
                          type="button"
                          onClick={() => runActions.continue_?.('discovery')}
                          disabled={
                            runActions.isLoading ||
                            billingExhausted ||
                            runActions.upgradeNeeded
                          }
                          className={`flex h-5 shrink-0 items-center justify-center rounded-full ${isBudgetStop ? 'bg-violet-700 hover:bg-violet-600' : 'bg-zinc-700 hover:bg-zinc-600'} px-2.5 font-mono text-[9px] font-semibold tracking-wider text-white uppercase transition-colors disabled:opacity-30`}
                        >
                          Continue
                        </button>
                      }
                    />
                  ) : (
                    <SectionHeader
                      label="Reviewed"
                      durationMs={discoveryDurationMs}
                      compact
                      onLabelClick={
                        discoveryPhase?.sessionId && streamSlug && taskSlug
                          ? () =>
                              openChatSessionWindow(
                                streamSlug,
                                [discoveryPhase.sessionId as string],
                                'Discovery Session',
                                `chat-${taskSlug}-discovery`,
                              )
                          : undefined
                      }
                    />
                  )}
                </div>
              </div>
            )}

            {/* Plan section — active, stopped, awaiting approval, or finished */}
            {(taskStatus === 'planning' ||
              taskStatus === 'plan_ready' ||
              stoppedDuringPlanning ||
              (hasRun && taskContent?.plan)) && (
              <div className="animate-fade-in-fast">
                <hr className="border-zinc-200" />
                <div className="flex flex-col gap-0.5 px-3 py-4">
                  {taskStatus === 'planning' ? (
                    <ActivityHeader
                      label={(() => {
                        const lastStep = activitySteps.findLast((s) => s.label)
                        return lastStep?.label ?? 'Planning...'
                      })()}
                      detail={activitySteps.findLast((s) => s.label)?.detail}
                      onStop={() => runActions.stop?.()}
                      isStopping={runActions.isStopping}
                    />
                  ) : stoppedDuringPlanning ? (
                    <SectionHeader
                      label={`Planning ${isBudgetStop ? 'paused' : 'stopped'} after ${formatDuration(planDurationMs)}`}
                      rightSlot={
                        isBudgetStop ? (
                          <button
                            type="button"
                            onClick={() => runActions.continue_?.('planning')}
                            disabled={
                              runActions.isLoading ||
                              billingExhausted ||
                              runActions.upgradeNeeded
                            }
                            className="flex h-5 shrink-0 items-center justify-center rounded-full bg-violet-700 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-violet-600 disabled:opacity-30"
                          >
                            Continue
                          </button>
                        ) : (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRestartAlert('replan')}
                              disabled={runActions.isLoading || isRunning}
                              className="flex h-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-zinc-600 uppercase transition-colors hover:bg-zinc-300 disabled:opacity-30"
                            >
                              Restart
                            </button>
                            <button
                              type="button"
                              onClick={() => runActions.continue_?.('planning')}
                              disabled={runActions.isLoading}
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
                      onRestart={
                        taskStatus !== 'plan_ready' &&
                        !(isStopped && isBudgetStop)
                          ? () => setRestartAlert('replan')
                          : undefined
                      }
                      restartTooltip={
                        <>
                          Start over
                          <br />
                          from a new plan
                        </>
                      }
                      disabled={runActions.isLoading || isRunning}
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
                  {taskContent?.plan && (
                    <PlanFileRow
                      isPlanReady={taskStatus === 'plan_ready'}
                      onTryAgain={async () => {
                        await runActions.stop?.()
                        runActions.start?.()
                      }}
                      onApprove={() => runActions.approve?.()}
                      onOpenFile={() =>
                        openFileWindow({
                          name: 'plan.md',
                          path: `tasks/${taskSlug}/plan.md`,
                        })
                      }
                      onDelete={
                        isFinished && taskSlug
                          ? async () => {
                              await deleteFile(`tasks/${taskSlug}/plan.md`)
                              useWindowStore
                                .getState()
                                .closeWindowForFile(`tasks/${taskSlug}/plan.md`)
                              refresh()
                            }
                          : undefined
                      }
                      filePath={
                        taskSlug ? `tasks/${taskSlug}/plan.md` : undefined
                      }
                      disabled={runActions.isLoading}
                    />
                  )}
                  {taskStatus === 'planning' && <WorkingRow />}
                </div>
              </div>
            )}

            {/* Work section — active, stopped during working, finished, or
                any time work files exist on disk (see issue #144) */}
            {shouldShowWorkSection({
              taskStatus,
              stoppedDuringWorking,
              hasWorkFiles,
            }) && (
              <div className="animate-fade-in-fast">
                <hr className="border-zinc-200" />
                <div className="flex flex-col gap-0.5 px-3 py-4">
                  {taskStatus === 'working' ? (
                    <ActivityHeader
                      label={(() => {
                        const lastStep = activitySteps.findLast((s) => s.label)
                        return lastStep?.label ?? 'Working...'
                      })()}
                      detail={activitySteps.findLast((s) => s.label)?.detail}
                      onStop={() => runActions.stop?.()}
                      isStopping={runActions.isStopping}
                    />
                  ) : stoppedDuringWorking ? (
                    <SectionHeader
                      label={`Working ${isBudgetStop ? 'paused' : 'stopped'} after ${formatDuration(workDurationMs)}`}
                      rightSlot={
                        isBudgetStop ? (
                          <button
                            type="button"
                            onClick={() => runActions.continue_?.()}
                            disabled={
                              runActions.isLoading ||
                              billingExhausted ||
                              runActions.upgradeNeeded
                            }
                            className="flex h-5 shrink-0 items-center justify-center rounded-full bg-violet-700 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-violet-600 disabled:opacity-30"
                          >
                            Continue
                          </button>
                        ) : (
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRestartAlert('run-again')}
                              disabled={runActions.isLoading || isRunning}
                              className="flex h-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 px-2.5 font-mono text-[9px] font-semibold tracking-wider text-zinc-600 uppercase transition-colors hover:bg-zinc-300 disabled:opacity-30"
                            >
                              Restart
                            </button>
                            <button
                              type="button"
                              onClick={() => runActions.continue_?.()}
                              disabled={runActions.isLoading}
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
                      onRestart={() => setRestartAlert('run-again')}
                      restartTooltip={
                        <>
                          Redo the work
                          <br />
                          from the same plan
                        </>
                      }
                      disabled={runActions.isLoading || isRunning}
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
                    onFileClick={(file) =>
                      openFileWindow({
                        name: file.name,
                        path: file.path ?? file.name,
                      })
                    }
                    onFileDelete={
                      isFinished
                        ? async (file) => {
                            if (file.path) {
                              await deleteFile(file.path)
                              useWindowStore
                                .getState()
                                .closeWindowForFile(file.path)
                              refresh()
                            }
                          }
                        : undefined
                    }
                  />
                  <FileList
                    files={workingFiles}
                    onFileClick={(file) =>
                      openFileWindow({
                        name: file.name,
                        path: file.path ?? file.name,
                      })
                    }
                    onFileDelete={
                      isFinished
                        ? async (file) => {
                            if (file.path) {
                              await deleteFile(file.path)
                              useWindowStore
                                .getState()
                                .closeWindowForFile(file.path)
                              refresh()
                            }
                          }
                        : undefined
                    }
                  />
                  {taskStatus === 'working' && <WorkingRow />}
                </div>
              </div>
            )}
          </div>

          {/* Low balance — sticky footer for any non-idle state */}
          {hasRun &&
            !(isStopped && isBudgetStop) &&
            runActions.billingWarning === 'low_balance' && (
              <div className="animate-fade-in-fast shrink-0 border-t border-zinc-200 bg-zinc-50">
                <div className="flex items-center justify-between gap-3 bg-violet-100/60 px-4 py-3">
                  <span className="text-sm text-violet-800">
                    Less than 5 minutes of usage left
                  </span>
                  <UpgradePrompt variant="inline-small" title="Upgrade" />
                </div>
              </div>
            )}

          {/* Start (idle only) — sticky footer outside scroll area */}
          {!hasRun && (
            <div className="shrink-0 border-t border-zinc-200 bg-zinc-50">
              {runActions.upgradeNeeded && (
                <div className="flex items-center justify-between gap-3 border-b border-violet-300/40 bg-violet-100/60 px-4 py-2">
                  <span className="text-sm text-violet-800">
                    Upgrade for more usage
                  </span>
                  <UpgradePrompt variant="inline-small" title="Upgrade" />
                </div>
              )}
              {!runActions.upgradeNeeded &&
                runActions.billingWarning === 'low_balance' && (
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
                  onClick={() => runActions.start?.()}
                  disabled={
                    !canStartIdleTask({
                      streamSlug,
                      title,
                      isUploading,
                      runActionsLoading: runActions.isLoading,
                      runActionsUpgradeNeeded: runActions.upgradeNeeded,
                    })
                  }
                  className="flex h-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 px-3 font-mono text-[10px] font-semibold tracking-wider text-white uppercase transition-colors hover:bg-zinc-800 disabled:opacity-30"
                >
                  Start Task
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right — metadata sidebar */}
        <Sidebar open={sidebarOpen} className="pt-4 pb-2">
          <SidebarSection>
            <SidebarHeading className="mb-0! px-3">Assigned To</SidebarHeading>
            <Listbox
              value={activeTask?.frontmatter.stream ?? null}
              onChange={async (slug: string | null) => {
                if (!taskSlug) return
                const prevStream = activeTask?.frontmatter.stream ?? null
                await updateTaskStream(taskSlug, slug)
                if (prevStream) invalidateStream(prevStream)
                if (slug) invalidateStream(slug)
                mutate(taskItemsKey())
                // Navigate to the full desktop route so stream context activates
                if (slug) {
                  router.push(
                    `/${encodeURIComponent(slug)}/${encodeURIComponent(taskSlug)}`,
                  )
                } else {
                  router.push(`/task/${encodeURIComponent(taskSlug)}`)
                }
              }}
              disabled={isRunning}
              placeholder="Select a stream"
              ghost
            >
              <ListboxOption value={null} compact>
                <ListboxLabel>None</ListboxLabel>
              </ListboxOption>
              {streams.map((s) => (
                <ListboxOption key={s.name} value={s.name} compact>
                  <ListboxLabel>{displayTitle(s.title, s.name)}</ListboxLabel>
                </ListboxOption>
              ))}
            </Listbox>
          </SidebarSection>

          <div className="flex-1" />

          <button
            type="button"
            onClick={() => setDeleteAlert(true)}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-600"
          >
            <Trash2 className="size-3.5" />
            Delete task
          </button>
          <DeleteAlert
            open={deleteAlert}
            onClose={() => setDeleteAlert(false)}
            title="Delete task?"
            description={
              isRunning
                ? 'This will permanently delete this task and all its contents. This task is currently running.'
                : 'This will permanently delete this task and all its contents.'
            }
            onDelete={async () => {
              if (!taskSlug) return
              setDeleteAlert(false)
              await deleteTaskByLocation(taskSlug)
              mutate(taskItemsKey())
              if (streamSlug) invalidateStream(streamSlug)
              router.push(
                streamSlug ? `/${encodeURIComponent(streamSlug)}` : '/desktop',
              )
            }}
          />
        </Sidebar>
      </div>
    </Shell>
  )
}
