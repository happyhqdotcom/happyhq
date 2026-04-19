'use client'

import { useSearchParams } from 'next/navigation'
import { Fragment, useCallback, useEffect, useRef } from 'react'

import { Canvas } from './_components/canvas'
import { usePlaygroundStore } from './_components/playground-store'
import { findComponent } from './_registry'

export default function PlaygroundPage() {
  const searchParams = useSearchParams()
  const componentId = searchParams.get('component')
  const variantParam = searchParams.get('variant')

  const selectedVariant = usePlaygroundStore((s) => s.selectedVariant)
  const controlValues = usePlaygroundStore((s) => s.controlValues)

  // Sync URL params into store on mount and when params change.
  // The sidebar updates both store AND URL on click, so we only need
  // to handle initial load and browser back/forward here.
  const lastSyncedRef = useRef<string | null>(null)

  useEffect(() => {
    const syncKey = `${componentId}:${variantParam}`
    if (syncKey === lastSyncedRef.current) return
    lastSyncedRef.current = syncKey

    if (!componentId) return

    const component = findComponent(componentId)
    if (!component) return

    const store = usePlaygroundStore.getState()

    if (store.selectedComponent !== componentId) {
      store.selectComponent(component)
    }

    if (
      variantParam &&
      variantParam in component.variants &&
      variantParam !== store.selectedVariant
    ) {
      store.selectVariant(variantParam, component)
    }
  }, [componentId, variantParam])

  const log = useCallback((event: string, ...args: unknown[]) => {
    usePlaygroundStore.getState().logEvent(event, ...args)
  }, [])

  // Look up the current component from registry
  const component = componentId ? findComponent(componentId) : null

  if (!component) {
    return (
      <div className="text-muted-foreground flex h-full w-full items-center justify-center bg-zinc-50">
        <p className="text-sm">Select a component from the sidebar</p>
      </div>
    )
  }

  // Get current variant data — validate the key belongs to this component
  // (selectedVariant may briefly hold a stale key from the previous component
  // while the URL-sync effect catches up)
  const variantKey =
    selectedVariant && selectedVariant in component.variants
      ? selectedVariant
      : Object.keys(component.variants)[0]
  const variant = variantKey ? component.variants[variantKey] : null
  const data = variant?.data ?? null

  return (
    <Canvas width={component.canvasWidth}>
      <Fragment key={variantKey}>
        {component.render({ data, controls: controlValues, log })}
      </Fragment>
    </Canvas>
  )
}
