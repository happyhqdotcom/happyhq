'use client'

import { useActiveTaskSlug } from '@/components/features/tasks/hooks/use-task-swr'
import {
  MOCK_BUDGET_STOPPED_CONTENT,
  MOCK_DISCOVERING_STEPS,
  MOCK_PHASES,
  MOCK_PLANNING_STEPS,
  MOCK_WORKING_STEPS,
  PHASE_ORDER,
  type MockPhase,
  type MockStoppedDuring,
} from '@/lib/dev/mock-data'
import type { TaskContent } from '@/lib/fs/types'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { useTaskStore } from '@/stores/taskStore'
import { X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { mutate } from 'swr'

/**
 * Floating dev panel for stepping through task card phases.
 * Injects mock TaskContent into the SWR cache and mock activity
 * state into taskStore — same pattern as the desktop's MockRunWindow
 * but adapted for the home page task card context.
 *
 * Only rendered in development when a task is expanded.
 */
export function MockTaskPanel() {
  const taskSlug = useActiveTaskSlug()
  const mockMode = useTaskStore((s) => s.mockMode)
  const [activePhase, setActivePhase] = useState<MockPhase | null>(null)
  const [budgetStoppedDuring, setBudgetStoppedDuring] =
    useState<MockStoppedDuring>('working')
  const [activeBilling, setActiveBilling] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const injectPhase = useCallback(
    (phase: MockPhase, budgetStoppedDuringOverride?: MockStoppedDuring) => {
      if (!taskSlug) return

      // Enable mock mode to suppress SSE and SWR revalidation
      useTaskStore.getState().setMockMode(true)

      // Inject mock TaskContent into the individual task SWR cache
      const content =
        phase === 'budget_stopped'
          ? MOCK_BUDGET_STOPPED_CONTENT[
              budgetStoppedDuringOverride ?? budgetStoppedDuring
            ]
          : MOCK_PHASES[phase]
      const key = taskContentKey(taskSlug)
      mutate(key, content as TaskContent, { revalidate: false })

      // Inject activity state into taskStore
      const isActive =
        phase === 'discovering' ||
        phase === 'discovering_q' ||
        phase === 'planning' ||
        phase === 'working'
      const steps =
        phase === 'discovering' || phase === 'discovering_q'
          ? MOCK_DISCOVERING_STEPS
          : phase === 'planning'
            ? MOCK_PLANNING_STEPS
            : phase === 'working'
              ? MOCK_WORKING_STEPS
              : []
      useTaskStore.getState().setRunState({
        isRunActive: isActive,
        activitySteps: steps,
        statusLine: phase === 'working' ? 'Writing... (3s)' : null,
      })

      setActivePhase(phase)
    },
    [taskSlug, budgetStoppedDuring],
  )

  const noop = async () => {}

  const injectBilling = useCallback(
    (mode: 'low_balance' | 'upgrade_needed' | null) => {
      useTaskStore.getState().setMockMode(true)
      const s = useTaskStore.getState()
      useTaskStore.getState().setRunActionsState({
        isLoading: s.runActionsLoading,
        isStopping: s.runActionsStopping,
        start: s.runStart ?? noop,
        stop: s.runStop ?? noop,
        approve: s.runApprove ?? noop,
        continue_: s.runContinue ?? noop,
        answerQuestion: s.runAnswerQuestion ?? noop,
        upgradeNeeded: mode === 'upgrade_needed',
        billingWarning: mode === 'low_balance' ? 'low_balance' : null,
      })
      setActiveBilling(mode)
    },
    [],
  )

  const reset = useCallback(() => {
    useTaskStore.getState().setMockMode(false)
    useTaskStore.getState().setRunState({
      isRunActive: false,
      activitySteps: [],
      statusLine: null,
    })
    useTaskStore.getState().setRunActionsState({
      isLoading: false,
      isStopping: false,
      start: noop,
      stop: noop,
      approve: noop,
      continue_: noop,
      answerQuestion: noop,
      upgradeNeeded: false,
      billingWarning: null,
    })
    setActivePhase(null)
    setActiveBilling(null)
    // Revalidate from real server data — don't clear the cache first,
    // so the card keeps showing something while the fetch resolves.
    if (taskSlug) {
      mutate(taskContentKey(taskSlug))
      mutate(taskItemsKey())
    }
  }, [taskSlug])

  const noTask = !taskSlug

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed right-5 bottom-16 z-50 flex size-9 items-center justify-center rounded-full border border-white/10 bg-zinc-900 shadow-lg transition-colors hover:bg-zinc-800"
      >
        <img
          src="/brand/gophie.png"
          alt="Dev tools"
          className="size-8 rounded-full"
        />
        {mockMode && (
          <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-400 ring-2 ring-zinc-900" />
        )}
      </button>
    )
  }

  return (
    <div className="fixed right-4 bottom-16 z-50 w-64 overflow-hidden rounded-lg bg-zinc-900 shadow-2xl">
      {/* Status bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[10px] text-white/40">
          Mock Task Card
        </span>
        <span
          className={`ml-auto rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold ${
            mockMode
              ? 'bg-amber-500/20 text-amber-400'
              : 'bg-white/10 text-white/30'
          }`}
        >
          {mockMode ? 'MOCK ACTIVE' : 'OFF'}
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-white/30 transition-colors hover:text-white/60"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="p-3">
        {noTask ? (
          <div className="py-4 text-center font-mono text-xs text-white/30">
            Expand a task to use the simulator
          </div>
        ) : (
          <div className="space-y-3">
            {/* Phase buttons */}
            <div className="space-y-1">
              <div className="font-mono text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                Phase
              </div>
              <div className="flex flex-wrap gap-1">
                {PHASE_ORDER.map((phase) => (
                  <button
                    key={phase}
                    type="button"
                    onClick={() => injectPhase(phase)}
                    className={`rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                      activePhase === phase
                        ? 'bg-blue-500/30 text-blue-300'
                        : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    {phase}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget Stopped During toggle — only visible when phase is budget_stopped */}
            {activePhase === 'budget_stopped' && (
              <div className="space-y-1">
                <div className="font-mono text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                  Stopped During
                </div>
                <div className="flex flex-wrap gap-1">
                  {(['planning', 'working'] as const).map((phase) => (
                    <button
                      key={phase}
                      type="button"
                      onClick={() => {
                        setBudgetStoppedDuring(phase)
                        injectPhase('budget_stopped', phase)
                      }}
                      className={`rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                        budgetStoppedDuring === phase
                          ? 'bg-orange-500/30 text-orange-300'
                          : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                      }`}
                    >
                      {phase}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Billing toggles */}
            <div className="space-y-1">
              <div className="font-mono text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                Billing
              </div>
              <div className="flex flex-wrap gap-1">
                {(['low_balance', 'upgrade_needed'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() =>
                      injectBilling(activeBilling === mode ? null : mode)
                    }
                    className={`rounded px-2 py-1 font-mono text-[11px] transition-colors ${
                      activeBilling === mode
                        ? 'bg-violet-500/30 text-violet-300'
                        : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-1">
              <div className="font-mono text-[10px] font-semibold tracking-wider text-white/40 uppercase">
                Actions
              </div>
              <button
                type="button"
                onClick={reset}
                className="rounded bg-white/5 px-2 py-1 font-mono text-[11px] text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                Reset
              </button>
            </div>

            {/* Info */}
            {activePhase && (
              <div className="rounded border border-white/5 bg-white/5 p-2 font-mono text-[10px] leading-relaxed text-white/40">
                <div>
                  Task: <span className="text-white/60">{taskSlug}</span>
                </div>
                <div>
                  Phase: <span className="text-white/60">{activePhase}</span>
                </div>
                <div>
                  SWR key:{' '}
                  <span className="text-white/60">
                    {taskContentKey(taskSlug)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
