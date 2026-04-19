'use client'

import { Tab, TabGroup, TabList } from '@headlessui/react'
import { Play, RotateCcw, Square } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'

import type { PlaygroundComponent } from '../_registry/types'
import { usePlaygroundStore } from './playground-store'

export function CanvasHeader({
  component,
}: {
  component: PlaygroundComponent | null
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeVariant = searchParams.get('variant')
  const selectVariant = usePlaygroundStore((s) => s.selectVariant)
  const canvasActions = usePlaygroundStore((s) => s.canvasActions)
  const isStreaming = usePlaygroundStore((s) => s.isStreaming)
  const hasStreamed = usePlaygroundStore((s) => s.hasStreamed)

  const showReset = hasStreamed && !isStreaming
  const variantKeys = component ? Object.keys(component.variants) : []
  const hasMultipleVariants = variantKeys.length > 1

  const selectedIndex = Math.max(0, variantKeys.indexOf(activeVariant ?? ''))

  function handleTabChange(index: number) {
    if (!component) return
    const key = variantKeys[index]
    if (!key) return
    selectVariant(key, component)
    const params = new URLSearchParams(searchParams.toString())
    params.set('variant', key)
    router.replace(`/playground?${params.toString()}`)
  }

  return (
    <div className="flex h-10 shrink-0 items-center justify-between rounded-t-2xl border-b border-zinc-200 bg-zinc-100 px-3">
      {/* Left side — variant tabs */}
      <div className="flex items-center">
        {component && hasMultipleVariants && (
          <TabGroup selectedIndex={selectedIndex} onChange={handleTabChange}>
            <TabList className="flex gap-1">
              {variantKeys.map((key) => (
                <Tab
                  key={key}
                  className="rounded-full px-2.5 py-1 text-xs font-semibold text-zinc-400 transition-colors outline-none data-focus:outline data-focus:outline-zinc-400 data-hover:bg-black/5 data-hover:text-zinc-600 data-selected:bg-black/10 data-selected:text-zinc-700 data-selected:data-hover:bg-black/10"
                >
                  {component.variants[key].name}
                </Tab>
              ))}
            </TabList>
          </TabGroup>
        )}
      </div>

      {/* Right side — playback controls */}
      <div className="flex items-center gap-1">
        {canvasActions && (
          <>
            {showReset && (
              <button
                type="button"
                onClick={() => {
                  canvasActions.reset()
                  usePlaygroundStore.setState({ hasStreamed: false })
                }}
                className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-600"
                aria-label="Reset"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={isStreaming ? canvasActions.stop : canvasActions.start}
              className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700"
              aria-label={isStreaming ? 'Stop' : 'Play'}
            >
              {isStreaming ? (
                <Square className="h-3 w-3 fill-current" />
              ) : (
                <Play className="h-3.5 w-3.5 fill-current" />
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
