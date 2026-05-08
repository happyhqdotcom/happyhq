'use client'

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
import type { DesktopData } from '@/lib/fs/types'
import { invalidateStream } from '@/lib/swr-helpers'
import { desktopDataKey } from '@/lib/swr-keys'
import { useDesktopStore, useStreamSlug } from '@/stores/desktopStore'
import { useParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { mutate } from 'swr'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFrame } from '../window-frame'

export function MockRunWindow({ id, canvasRef }: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  if (!result) return null

  const { frameProps, window: w } = result

  return (
    <WindowFrame title={w.title} {...frameProps}>
      <MockRunContent />
    </WindowFrame>
  )
}

function MockRunContent() {
  const streamSlug = useStreamSlug()
  const taskSlug = useParams<{ task?: string }>().task
  const mockMode = useDesktopStore((s) => s.mockMode)
  const [activePhase, setActivePhase] = useState<MockPhase | null>(null)
  const [budgetStoppedDuring, setBudgetStoppedDuring] =
    useState<MockStoppedDuring>('working')

  const injectPhase = useCallback(
    (phase: MockPhase, budgetStoppedDuringOverride?: MockStoppedDuring) => {
      if (!streamSlug || !taskSlug) return

      // Enable mock mode to suppress SSE connection
      useDesktopStore.getState().setMockMode(true)

      // Inject mock TaskContent into SWR cache
      const content =
        phase === 'budget_stopped'
          ? MOCK_BUDGET_STOPPED_CONTENT[
              budgetStoppedDuringOverride ?? budgetStoppedDuring
            ]
          : MOCK_PHASES[phase]
      const key = desktopDataKey(streamSlug, taskSlug)
      mutate(
        key,
        (prev: DesktopData | undefined) => {
          if (!prev) return prev
          return { ...prev, taskContent: content }
        },
        { revalidate: false },
      )

      // Inject activity state into Zustand store
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
      useDesktopStore.getState().setRunState({
        isRunActive: isActive,
        activitySteps: steps,
        statusLine: phase === 'working' ? 'Writing... (3s)' : null,
      })

      setActivePhase(phase)
    },
    [streamSlug, taskSlug, budgetStoppedDuring],
  )

  const [activeBilling, setActiveBilling] = useState<string | null>(null)
  const noop = async () => {}

  const injectBilling = useCallback(
    (mode: 'low_balance' | 'upgrade_needed' | null) => {
      const s = useDesktopStore.getState()
      useDesktopStore.getState().setRunActionsState({
        isLoading: s.runActionsLoading,
        isStopping: s.runActionsStopping,
        error: s.runActionsError,
        approve: s.runApprove ?? noop,
        continue_: s.runContinue ?? noop,
        start: s.runStart ?? noop,
        stop: s.runStop ?? noop,
        answerQuestion: s.runAnswerQuestion ?? noop,
        upgradeNeeded: mode === 'upgrade_needed',
        billingWarning: mode === 'low_balance' ? 'low_balance' : null,
        remainingMinutes: mode === 'low_balance' ? 3 : null,
      })
      setActiveBilling(mode)
    },
    [],
  )

  const reset = useCallback(() => {
    if (!streamSlug) return
    useDesktopStore.getState().setMockMode(false)
    useDesktopStore.getState().setRunState({
      isRunActive: false,
      activitySteps: [],
      statusLine: null,
    })
    injectBilling(null)
    setActivePhase(null)
    setActiveBilling(null)
    // Revalidate from real server data
    invalidateStream(streamSlug)
  }, [streamSlug, injectBilling])

  const simulateFileWrite = useCallback(() => {
    if (!streamSlug) return
    // Triggers the same code path that a real file write would
    invalidateStream(streamSlug)
  }, [streamSlug])

  const noTask = !taskSlug

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900">
      {/* Status bar */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="font-mono text-[10px] text-white/40">
          Mock Run Simulator
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
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {noTask ? (
          <div className="py-4 text-center font-mono text-xs text-white/30">
            Navigate to a task to use the simulator
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
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={simulateFileWrite}
                  className="rounded bg-white/5 px-2 py-1 font-mono text-[11px] text-white/50 transition-colors hover:bg-white/10 hover:text-white/70"
                >
                  Simulate file write
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="rounded bg-white/5 px-2 py-1 font-mono text-[11px] text-red-400/70 transition-colors hover:bg-red-500/10 hover:text-red-400"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Info */}
            {activePhase && (
              <div className="rounded border border-white/5 bg-white/5 p-2 font-mono text-[10px] leading-relaxed text-white/40">
                <div>
                  Stream: <span className="text-white/60">{streamSlug}</span>
                </div>
                <div>
                  Task: <span className="text-white/60">{taskSlug}</span>
                </div>
                <div>
                  Phase: <span className="text-white/60">{activePhase}</span>
                </div>
                <div>
                  SWR key:{' '}
                  <span className="text-white/60">
                    {desktopDataKey(streamSlug, taskSlug)}
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
