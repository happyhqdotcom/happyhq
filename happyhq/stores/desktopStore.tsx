'use client'

import type { ActivityStep } from '@/components/features/desktop/hooks/use-run-activity'
import { useParams } from 'next/navigation'
import { useCallback } from 'react'
import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'

// ── State shape ─────────────────────────────────────────────────────────
// Client-only state — server data lives in SWR (see use-desktop-data.ts).

export interface DesktopState {
  // The user-selected stream — set by chat contexts outside the (desktop) route
  // group where useParams() doesn't have a stream param. Components read via
  // useStreamSlug(), which prefers this over the URL param.
  selectedStream: string | null

  // Run state (hydrated by DesktopDataProvider from useRunActivity — SSE, not server data)
  isRunActive: boolean
  activitySteps: ActivityStep[]
  statusLine: string | null

  // Shell layout state — persists across navigations (not in reset())
  desktopExpanded: boolean
  sidebarPanelType: string // which panel type last toggled the sidebar
  sidebarOpen: boolean
  islandHidden: boolean

  // UI state
  filesPanelOpen: boolean

  // Task setup — live title/description from task card for canvas checklist
  taskSetupTitle: string
  taskSetupDescription: string
  taskFocusTarget: 'title' | 'description' | 'sidebar' | null

  // Run actions state (hydrated by DesktopDataProvider from useRunActions)
  runActionsLoading: boolean
  runActionsStopping: boolean
  runActionsError: string | null
  runActionsUpgradeNeeded: boolean
  runActionsBillingWarning: string | null
  runActionsRemainingMinutes: number | null

  // Run action functions (set by provider from useRunActions)
  runApprove: (() => Promise<void>) | null
  runContinue: ((mode?: 'planning' | 'working') => Promise<void>) | null
  runStart: (() => Promise<void>) | null
  runStop: (() => Promise<void>) | null

  // Dev: mock run mode — suppresses SSE connection to /api/run/stream
  mockMode: boolean
  setMockMode: (enabled: boolean) => void

  // Set the selected stream (used by chat contexts outside the route group)
  setSelectedStream: (slug: string | null) => void

  // Shell layout actions
  setDesktopExpanded: (expanded: boolean) => void
  setSidebarOpen: (panelType: string, open: boolean) => void
  setIslandHidden: (hidden: boolean) => void

  // UI actions
  setFilesPanelOpen: (open: boolean) => void
  setTaskSetupTitle: (title: string) => void
  setTaskSetupDescription: (description: string) => void
  setTaskFocusTarget: (
    target: 'title' | 'description' | 'sidebar' | null,
  ) => void

  // Provider hydration actions (client-only state from hooks)
  setRunState: (data: {
    isRunActive: boolean
    activitySteps: ActivityStep[]
    statusLine: string | null
  }) => void
  setRunActionsState: (data: {
    isLoading: boolean
    isStopping: boolean
    error: string | null
    approve: () => Promise<void>
    continue_: (mode?: 'planning' | 'working') => Promise<void>
    start: () => Promise<void>
    stop: () => Promise<void>
    upgradeNeeded: boolean
    billingWarning: string | null
    remainingMinutes: number | null
  }) => void

  // Reset for stream/task transitions
  reset: () => void
}

// ── Global singleton store ──────────────────────────────────────────────

function buildInitialState(): Partial<DesktopState> {
  return {
    desktopExpanded: false,
    selectedStream: null,
    isRunActive: false,
    activitySteps: [],
    statusLine: null,
    filesPanelOpen: false,
    taskSetupTitle: '',
    taskSetupDescription: '',
    taskFocusTarget: null,
    runActionsLoading: false,
    runActionsStopping: false,
    runActionsError: null,
    runActionsUpgradeNeeded: false,
    runActionsBillingWarning: null,
    runActionsRemainingMinutes: null,
    runApprove: null,
    runContinue: null,
    runStart: null,
    runStop: null,
    mockMode: false,
  }
}

export const useDesktopStore = create<DesktopState>()((set) => ({
  // Stream slug override
  selectedStream: null,

  // Run state
  isRunActive: false,
  activitySteps: [],
  statusLine: null,

  // Shell layout state
  desktopExpanded: false,
  sidebarPanelType: 'empty',
  sidebarOpen: false,
  islandHidden: false,

  // UI state
  filesPanelOpen: false,
  taskSetupTitle: '',
  taskSetupDescription: '',
  taskFocusTarget: null,

  // Run actions state
  runActionsLoading: false,
  runActionsStopping: false,
  runActionsError: null,
  runActionsUpgradeNeeded: false,
  runActionsBillingWarning: null,
  runActionsRemainingMinutes: null,

  // Run action refs
  runApprove: null,
  runContinue: null,
  runStart: null,
  runStop: null,

  // Dev: mock run mode
  mockMode: false,
  setMockMode: (enabled: boolean) => set({ mockMode: enabled }),

  // Selected stream mutation
  setSelectedStream: (slug: string | null) => set({ selectedStream: slug }),

  // Shell layout actions — persist to sessionStorage so state survives refresh.
  // Restored by restoreShellState() called from the shell on mount.
  setDesktopExpanded: (expanded: boolean) => {
    set({ desktopExpanded: expanded })
    _saveShellState()
  },
  setSidebarOpen: (panelType: string, open: boolean) => {
    set({ sidebarPanelType: panelType, sidebarOpen: open })
    _saveShellState()
  },
  setIslandHidden: (hidden: boolean) => {
    set({ islandHidden: hidden })
    _saveShellState()
  },

  // UI actions
  setFilesPanelOpen: (open: boolean) => set({ filesPanelOpen: open }),
  setTaskSetupTitle: (title: string) => set({ taskSetupTitle: title }),
  setTaskSetupDescription: (description: string) =>
    set({ taskSetupDescription: description }),
  setTaskFocusTarget: (target: 'title' | 'description' | 'sidebar' | null) =>
    set({ taskFocusTarget: target }),

  // Provider hydration actions (client-only state)
  setRunState: ({ isRunActive, activitySteps, statusLine }) =>
    set({ isRunActive, activitySteps, statusLine }),

  setRunActionsState: ({
    isLoading,
    isStopping,
    error,
    approve,
    continue_,
    start,
    stop,
    upgradeNeeded,
    billingWarning,
    remainingMinutes,
  }) =>
    set({
      runActionsLoading: isLoading,
      runActionsStopping: isStopping,
      runActionsError: error,
      runApprove: approve,
      runContinue: continue_,
      runStart: start,
      runStop: stop,
      runActionsUpgradeNeeded: upgradeNeeded,
      runActionsBillingWarning: billingWarning,
      runActionsRemainingMinutes: remainingMinutes,
    }),

  // Reset for stream transitions — sets every field to avoid stale data
  reset: () => set(buildInitialState()),
}))

// ── Shell state persistence ─────────────────────────────────────────────

const SHELL_STORAGE_KEY = 'happyhq:shell-layout'

function _saveShellState() {
  try {
    const { desktopExpanded, sidebarOpen, sidebarPanelType, islandHidden } =
      useDesktopStore.getState()
    sessionStorage.setItem(
      SHELL_STORAGE_KEY,
      JSON.stringify({
        desktopExpanded,
        sidebarOpen,
        sidebarPanelType,
        islandHidden,
      }),
    )
  } catch {
    // sessionStorage may be unavailable (SSR, private browsing)
  }
}

// Module-level flag — survives client-side navigations but resets on hard
// refresh (module reloads). Ensures we only restore shell layout once per
// page session so client-side route changes start with the panel visible.
let _shellRestored = false

/** Call once from the shell on mount to restore layout state from sessionStorage. */
export function restoreShellState() {
  if (_shellRestored) return
  _shellRestored = true
  try {
    const raw = sessionStorage.getItem(SHELL_STORAGE_KEY)
    if (!raw) return
    const { desktopExpanded, sidebarOpen, sidebarPanelType, islandHidden } =
      JSON.parse(raw)
    useDesktopStore.setState({
      desktopExpanded: desktopExpanded ?? false,
      sidebarOpen: sidebarOpen ?? false,
      sidebarPanelType: sidebarPanelType ?? 'empty',
      islandHidden: islandHidden ?? false,
    })
  } catch {
    // Ignore malformed data
  }
}

// ── Selector hooks ──────────────────────────────────────────────────────

// Stream identity — URL param, or the user-selected stream (for chat contexts
// outside the (desktop) route group where useParams() has no stream param).
export function useStreamSlug(): string {
  const params = useParams<{ stream?: string }>()
  const selected = useDesktopStore((s) => s.selectedStream)
  return selected ?? params.stream ?? ''
}

// Shell layout state
export const useDesktopExpanded = (): [boolean, (v: boolean) => void] =>
  useDesktopStore(useShallow((s) => [s.desktopExpanded, s.setDesktopExpanded]))
export const useIslandHidden = (): [boolean, (v: boolean) => void] =>
  useDesktopStore(useShallow((s) => [s.islandHidden, s.setIslandHidden]))

/**
 * Sidebar state scoped to the current panel type.
 * Returns the effective open state and a setter that tags the panel type.
 */
export function useSidebarOpen(
  panelType: string,
): [boolean, (open: boolean) => void] {
  const sidebarPanelType = useDesktopStore((s) => s.sidebarPanelType)
  const sidebarOpenRaw = useDesktopStore((s) => s.sidebarOpen)
  const setSidebarOpenStore = useDesktopStore((s) => s.setSidebarOpen)
  const open = sidebarPanelType === panelType && sidebarOpenRaw
  const setOpen = useCallback(
    (v: boolean) => setSidebarOpenStore(panelType, v),
    [setSidebarOpenStore, panelType],
  )
  return [open, setOpen]
}

// Run state
export const useIsRunActive = () => useDesktopStore((s) => s.isRunActive)
export const useActivitySteps = () => useDesktopStore((s) => s.activitySteps)
export const useStatusLine = () => useDesktopStore((s) => s.statusLine)

// UI state — return [value, setter] tuples for convenience.
// useShallow prevents infinite re-renders from new array identity on each selector call.
export const useFilesPanelOpen = (): [boolean, (open: boolean) => void] =>
  useDesktopStore(useShallow((s) => [s.filesPanelOpen, s.setFilesPanelOpen]))

// Task setup state — live title/description from task card for canvas checklist
export const useTaskSetupTitle = () => useDesktopStore((s) => s.taskSetupTitle)
export const useTaskSetupDescription = () =>
  useDesktopStore((s) => s.taskSetupDescription)
export const useTaskFocusTarget = (): [
  'title' | 'description' | 'sidebar' | null,
  (target: 'title' | 'description' | 'sidebar' | null) => void,
] =>
  useDesktopStore(useShallow((s) => [s.taskFocusTarget, s.setTaskFocusTarget]))

// Run actions — bundled for consumer convenience.
// useShallow prevents infinite re-renders from new object identity on each selector call.
export const useRunActions = () =>
  useDesktopStore(
    useShallow((s) => ({
      approve: s.runApprove,
      continue_: s.runContinue,
      start: s.runStart,
      stop: s.runStop,
      isLoading: s.runActionsLoading,
      isStopping: s.runActionsStopping,
      error: s.runActionsError,
      upgradeNeeded: s.runActionsUpgradeNeeded,
      billingWarning: s.runActionsBillingWarning,
      remainingMinutes: s.runActionsRemainingMinutes,
    })),
  )
