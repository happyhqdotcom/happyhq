import { describe, expect, it, vi } from 'vitest'

import type { PlaygroundComponent } from '../_registry/types'

import { usePlaygroundStore } from './playground-store'

function makeComponent(
  overrides: Partial<PlaygroundComponent> = {},
): PlaygroundComponent {
  return {
    id: 'test/component',
    name: 'Test',
    category: 'Interaction',
    variants: {
      alpha: { name: 'Alpha', data: { a: 1 } },
      beta: { name: 'Beta', data: { b: 2 } },
    },
    controls: {
      enabled: { type: 'toggle', label: 'Enabled', default: true },
      speed: { type: 'slider', label: 'Speed', default: 5, min: 1, max: 10 },
    },
    render: () => null,
    ...overrides,
  }
}

describe('usePlaygroundStore', () => {
  // Reset store state between tests
  const initialState = usePlaygroundStore.getState()
  afterEach(() => usePlaygroundStore.setState(initialState, true))

  it('selects a component, defaulting to first variant and control defaults', () => {
    const comp = makeComponent()
    usePlaygroundStore.getState().selectComponent(comp)

    const state = usePlaygroundStore.getState()
    expect(state.selectedComponent).toBe('test/component')
    expect(state.selectedVariant).toBe('alpha')
    expect(state.controlValues).toEqual({ enabled: true, speed: 5 })
    expect(state.events).toEqual([])
  })

  it('clears events when selecting a new component', () => {
    const comp = makeComponent()
    usePlaygroundStore.getState().logEvent('click', 'button')
    expect(usePlaygroundStore.getState().events).toHaveLength(1)

    usePlaygroundStore.getState().selectComponent(comp)
    expect(usePlaygroundStore.getState().events).toEqual([])
  })

  it('selects a variant and resets controls to defaults', () => {
    const comp = makeComponent()
    usePlaygroundStore.getState().selectComponent(comp)
    usePlaygroundStore.getState().setControl('enabled', false)
    expect(usePlaygroundStore.getState().controlValues.enabled).toBe(false)

    usePlaygroundStore.getState().selectVariant('beta', comp)
    const state = usePlaygroundStore.getState()
    expect(state.selectedVariant).toBe('beta')
    expect(state.controlValues).toEqual({ enabled: true, speed: 5 })
  })

  it('sets individual control values', () => {
    const comp = makeComponent()
    usePlaygroundStore.getState().selectComponent(comp)
    usePlaygroundStore.getState().setControl('speed', 8)

    expect(usePlaygroundStore.getState().controlValues.speed).toBe(8)
    // Other controls unchanged
    expect(usePlaygroundStore.getState().controlValues.enabled).toBe(true)
  })

  it('logs events with timestamps', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000)

    usePlaygroundStore.getState().logEvent('click', 'allow')
    usePlaygroundStore.getState().logEvent('submit', { form: 'data' })

    const events = usePlaygroundStore.getState().events
    expect(events).toEqual([
      { timestamp: 1000, name: 'click', args: ['allow'] },
      { timestamp: 2000, name: 'submit', args: [{ form: 'data' }] },
    ])
  })

  it('clears events', () => {
    usePlaygroundStore.getState().logEvent('click')
    usePlaygroundStore.getState().clearEvents()
    expect(usePlaygroundStore.getState().events).toEqual([])
  })

  it('handles a component with no controls', () => {
    const comp = makeComponent({ controls: undefined })
    usePlaygroundStore.getState().selectComponent(comp)

    expect(usePlaygroundStore.getState().controlValues).toEqual({})
  })
})
