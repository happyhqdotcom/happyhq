import { create } from 'zustand'

import type { PlaygroundComponent, PlaygroundEvent } from '../_registry/types'

function getDefaultControls(
  component: PlaygroundComponent | null,
): Record<string, unknown> {
  if (!component?.controls) return {}
  const defaults: Record<string, unknown> = {}
  for (const [key, control] of Object.entries(component.controls)) {
    defaults[key] = control.default
  }
  return defaults
}

function getFirstVariantKey(
  component: PlaygroundComponent | null,
): string | null {
  if (!component) return null
  const keys = Object.keys(component.variants)
  return keys[0] ?? null
}

interface PanelState {
  isLocked: boolean
  isPeekabooVisible: boolean
}

type BottomTab = 'events' | 'props' | 'data'

interface CanvasActions {
  start: () => void
  stop: () => void
  reset: () => void
}

interface PlaygroundState {
  selectedComponent: string | null
  selectedVariant: string | null
  controlValues: Record<string, unknown>
  events: PlaygroundEvent[]
  bottomPanelOpen: boolean
  bottomTab: BottomTab

  // Canvas streaming controls (registered by demo components)
  canvasActions: CanvasActions | null
  isStreaming: boolean
  hasStreamed: boolean

  // Panel states (locked inline vs peekaboo overlay)
  leftPanel: PanelState
  rightPanel: PanelState

  selectComponent: (component: PlaygroundComponent) => void
  selectVariant: (name: string, component: PlaygroundComponent) => void
  setControl: (name: string, value: unknown) => void
  logEvent: (name: string, ...args: unknown[]) => void
  clearEvents: () => void
  setBottomPanelOpen: (open: boolean) => void
  setBottomTab: (tab: BottomTab) => void
  setCanvasActions: (actions: CanvasActions | null) => void
  setIsStreaming: (streaming: boolean) => void

  setLeftPanel: (state: Partial<PanelState>) => void
  setRightPanel: (state: Partial<PanelState>) => void
}

export const usePlaygroundStore = create<PlaygroundState>((set) => ({
  selectedComponent: null,
  selectedVariant: null,
  controlValues: {},
  events: [],
  bottomPanelOpen: false,
  bottomTab: 'events',
  canvasActions: null,
  isStreaming: false,
  hasStreamed: false,

  // Left panel starts locked (component browser always visible)
  leftPanel: { isLocked: true, isPeekabooVisible: false },
  // Right panel starts unlocked (slides in on hover or when component selected)
  rightPanel: { isLocked: false, isPeekabooVisible: false },

  selectComponent: (component) =>
    set({
      selectedComponent: component.id,
      selectedVariant: getFirstVariantKey(component),
      controlValues: getDefaultControls(component),
      events: [],
    }),

  selectVariant: (name, component) =>
    set({
      selectedVariant: name,
      controlValues: getDefaultControls(component),
    }),

  setControl: (name, value) =>
    set((state) => ({
      controlValues: { ...state.controlValues, [name]: value },
    })),

  logEvent: (name, ...args) =>
    set((state) => ({
      events: [...state.events, { timestamp: Date.now(), name, args }],
    })),

  clearEvents: () => set({ events: [] }),

  setBottomPanelOpen: (open) => set({ bottomPanelOpen: open }),
  setBottomTab: (tab) => set({ bottomTab: tab }),
  setCanvasActions: (actions) =>
    set({ canvasActions: actions, hasStreamed: false }),
  setIsStreaming: (streaming) =>
    set((state) => ({
      isStreaming: streaming,
      hasStreamed: state.hasStreamed || streaming,
    })),

  setLeftPanel: (partial) =>
    set((state) => ({ leftPanel: { ...state.leftPanel, ...partial } })),

  setRightPanel: (partial) =>
    set((state) => ({ rightPanel: { ...state.rightPanel, ...partial } })),
}))
