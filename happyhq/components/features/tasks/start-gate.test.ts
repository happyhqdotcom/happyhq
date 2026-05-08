import { describe, expect, it } from 'vitest'
import { canStartIdleTask } from './start-gate'

const READY = {
  streamSlug: 'stream',
  title: 'A title',
  hasDescription: true,
  hasInputs: false,
  isUploading: false,
  runActionsLoading: false,
  runActionsUpgradeNeeded: false,
}

describe('canStartIdleTask', () => {
  it('enables the button when stream + title + description are present', () => {
    expect(canStartIdleTask(READY)).toBe(true)
  })

  it('enables the button when description is empty but inputs exist', () => {
    expect(
      canStartIdleTask({ ...READY, hasDescription: false, hasInputs: true }),
    ).toBe(true)
  })

  it('disables the button without a stream', () => {
    expect(canStartIdleTask({ ...READY, streamSlug: null })).toBe(false)
  })

  it('disables the button without a title', () => {
    expect(canStartIdleTask({ ...READY, title: '' })).toBe(false)
    expect(canStartIdleTask({ ...READY, title: '   ' })).toBe(false)
    expect(canStartIdleTask({ ...READY, title: null })).toBe(false)
  })

  it('disables the button when neither description nor inputs are present', () => {
    expect(
      canStartIdleTask({ ...READY, hasDescription: false, hasInputs: false }),
    ).toBe(false)
  })

  it('disables the button while uploads are in flight', () => {
    expect(canStartIdleTask({ ...READY, isUploading: true })).toBe(false)
  })

  it('disables the button while run actions are loading', () => {
    expect(canStartIdleTask({ ...READY, runActionsLoading: true })).toBe(false)
  })

  it('disables the button when an upgrade is required', () => {
    expect(canStartIdleTask({ ...READY, runActionsUpgradeNeeded: true })).toBe(
      false,
    )
  })
})
