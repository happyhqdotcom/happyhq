'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useRef } from 'react'

import type { PlaygroundComponent } from '../_registry/types'
import { navigateSiblingButtons } from './keyboard-nav'
import { usePlaygroundStore } from './playground-store'

export function ComponentBrowser({
  components,
}: {
  components: PlaygroundComponent[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const activeId = searchParams.get('component')
  const selectComponent = usePlaygroundStore((s) => s.selectComponent)
  const containerRef = useRef<HTMLDivElement>(null)

  function handleSelect(component: PlaygroundComponent) {
    selectComponent(component)

    const firstVariant = Object.keys(component.variants)[0]
    const params = new URLSearchParams()
    params.set('component', component.id)
    if (firstVariant) {
      params.set('variant', firstVariant)
    }
    router.replace(`/playground?${params.toString()}`)
  }

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      navigateSiblingButtons(e, containerRef)
    },
    [],
  )

  return (
    <div
      ref={containerRef}
      data-component-browser
      className="space-y-0.5 px-2 py-2"
    >
      {components.map((component) => {
        const isActive = activeId === component.id
        return (
          <button
            key={component.id}
            type="button"
            onClick={() => handleSelect(component)}
            onKeyDown={handleKeyDown}
            data-active={isActive}
            className={`flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm transition-colors ${
              isActive
                ? 'bg-zinc-100 font-medium text-zinc-900'
                : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900'
            }`}
          >
            {component.name}
          </button>
        )
      })}
    </div>
  )
}
