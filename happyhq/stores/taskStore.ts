'use client'

import type { ActivityStep } from '@/components/features/desktop/hooks/use-run-activity'
import { create } from 'zustand'

// Stable empty arrays — avoids new references on every render (React 19 + useSyncExternalStore)
const EMPTY_STEPS: ActivityStep[] = []

// ── State shape ─────────────────────────────────────────────────────────
// Client-only state — server data (TaskContent, TaskItem) lives in SWR
// (see use-task-swr.ts → useActiveTaskItem / useTaskContentData).
// Per CLAUDE.md, the store holds no server-derived fields.

export interface TaskState {
  // Run state (hydrated by useTaskData from useRunActivity — SSE, not server data)
  isRunActive: boolean
  activitySteps: ActivityStep[]
  statusLine: string | null

  // Mock mode — suppresses SSE and SWR revalidation so the dev panel
  // can inject mock phase data without it being overwritten.
  mockMode: boolean

  // Run actions (hydrated by useTaskData from useRunActions)
  runStart: (() => Promise<void>) | null
  runStop: (() => Promise<void>) | null
  runApprove: (() => Promise<void>) | null
  runContinue:
    | ((mode?: 'discovery' | 'planning' | 'working') => Promise<void>)
    | null
  runAnswerQuestion: ((answers: Record<string, string>) => Promise<void>) | null
  runActionsLoading: boolean
  runActionsStopping: boolean
  runActionsUpgradeNeeded: boolean
  runActionsBillingWarning: string | null

  // Provider hydration setters
  setRunState: (data: {
    isRunActive: boolean
    activitySteps: ActivityStep[]
    statusLine: string | null
  }) => void
  setRunActionsState: (data: {
    isLoading: boolean
    isStopping: boolean
    start: () => Promise<void>
    stop: () => Promise<void>
    approve: () => Promise<void>
    continue_: (mode?: 'discovery' | 'planning' | 'working') => Promise<void>
    answerQuestion: (answers: Record<string, string>) => Promise<void>
    upgradeNeeded: boolean
    billingWarning: string | null
  }) => void
  setMockMode: (enabled: boolean) => void

  // Reset client-only state on task transitions (called by useTaskData when
  // the active task slug changes). Identity is no longer in the store, so
  // this clears only SSE-derived run state and action handles.
  resetForTaskSwitch: () => void
}

// ── Global singleton store ──────────────────────────────────────────────

export const useTaskStore = create<TaskState>()((set) => ({
  // Run state
  isRunActive: false,
  activitySteps: EMPTY_STEPS,
  statusLine: null,

  // Mock mode
  mockMode: false,

  // Run actions
  runStart: null,
  runStop: null,
  runApprove: null,
  runContinue: null,
  runAnswerQuestion: null,
  runActionsLoading: false,
  runActionsStopping: false,
  runActionsUpgradeNeeded: false,
  runActionsBillingWarning: null,

  // Provider hydration setters
  setRunState: ({ isRunActive, activitySteps, statusLine }) =>
    set({ isRunActive, activitySteps, statusLine }),

  setRunActionsState: ({
    isLoading,
    isStopping,
    start,
    stop,
    approve,
    continue_,
    answerQuestion,
    upgradeNeeded,
    billingWarning,
  }) =>
    set({
      runActionsLoading: isLoading,
      runActionsStopping: isStopping,
      runStart: start,
      runStop: stop,
      runApprove: approve,
      runContinue: continue_,
      runAnswerQuestion: answerQuestion,
      runActionsUpgradeNeeded: upgradeNeeded,
      runActionsBillingWarning: billingWarning,
    }),

  setMockMode: (enabled) => set({ mockMode: enabled }),

  resetForTaskSwitch: () =>
    set({
      isRunActive: false,
      activitySteps: EMPTY_STEPS,
      statusLine: null,
      mockMode: false,
      runStart: null,
      runStop: null,
      runApprove: null,
      runContinue: null,
      runAnswerQuestion: null,
      runActionsLoading: false,
      runActionsStopping: false,
      runActionsUpgradeNeeded: false,
      runActionsBillingWarning: null,
    }),
}))
