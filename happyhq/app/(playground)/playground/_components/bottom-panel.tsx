'use client'

import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'

import { findComponent } from '../_registry'
import { EventLog } from './event-log'
import { usePlaygroundStore } from './playground-store'

type Tab = 'events' | 'props' | 'data'

const TABS: { value: Tab; label: string }[] = [
  { value: 'events', label: 'Events' },
  { value: 'props', label: 'Props' },
  { value: 'data', label: 'Data' },
]

/**
 * Always-visible tab bar at the bottom of the center area.
 * Clicking a tab when panel is collapsed expands it.
 */
export function BottomTabBar() {
  const activeTab = usePlaygroundStore((s) => s.bottomTab)
  const setActiveTab = usePlaygroundStore((s) => s.setBottomTab)
  const bottomPanelOpen = usePlaygroundStore((s) => s.bottomPanelOpen)
  const clearEvents = usePlaygroundStore((s) => s.clearEvents)

  function handleTabClick(tab: Tab) {
    setActiveTab(tab)
    if (!bottomPanelOpen) {
      usePlaygroundStore.getState().setBottomPanelOpen(true)
    } else if (tab === activeTab) {
      usePlaygroundStore.getState().setBottomPanelOpen(false)
    }
  }

  return (
    <div className="flex h-9 shrink-0 items-center bg-white px-2">
      {/* Tabs */}
      <div className="flex items-center gap-0.5">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => handleTabClick(tab.value)}
            className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
              activeTab === tab.value && bottomPanelOpen
                ? 'bg-zinc-100 text-zinc-900'
                : 'text-zinc-400 hover:text-zinc-600'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="ml-auto flex items-center gap-0.5">
        {activeTab === 'events' && (
          <button
            type="button"
            onClick={clearEvents}
            className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Clear events"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            usePlaygroundStore.getState().setBottomPanelOpen(!bottomPanelOpen)
          }
          className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label={bottomPanelOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {bottomPanelOpen ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronUp className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  )
}

/**
 * Panel content area — lives inside the collapsible ResizablePanel.
 */
export function BottomPanelContent() {
  const selectedId = usePlaygroundStore((s) => s.selectedComponent)
  const selectedVariant = usePlaygroundStore((s) => s.selectedVariant)
  const controlValues = usePlaygroundStore((s) => s.controlValues)

  const activeTab = usePlaygroundStore((s) => s.bottomTab)
  const component = selectedId ? (findComponent(selectedId) ?? null) : null

  const variantData =
    component && selectedVariant
      ? component.variants[selectedVariant]?.data
      : undefined

  const propsData =
    variantData !== undefined
      ? { data: variantData, controls: controlValues }
      : undefined

  return (
    <div className="h-full overflow-auto bg-white">
      {activeTab === 'events' && <EventLog />}
      {activeTab === 'props' && (
        <pre className="p-3 font-mono text-xs text-zinc-600">
          {propsData
            ? JSON.stringify(propsData, null, 2)
            : 'No component selected'}
        </pre>
      )}
      {activeTab === 'data' && (
        <pre className="p-3 font-mono text-xs text-zinc-600">
          {variantData !== undefined
            ? JSON.stringify(variantData, null, 2)
            : 'No component selected'}
        </pre>
      )}
    </div>
  )
}
