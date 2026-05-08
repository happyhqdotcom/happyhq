import { describe, expect, it } from 'vitest'
import { canStartIdleTask } from './start-gate'

const READY = {
  streamSlug: 'stream',
  title: 'A title',
  isUploading: false,
  runActionsLoading: false,
  runActionsUpgradeNeeded: false,
}

describe('canStartIdleTask', () => {
  it('enables the button when stream + title are present', () => {
    expect(canStartIdleTask(READY)).toBe(true)
  })

  it('does not require a description or inputs — discovery fills gaps', () => {
    // Regression guard for #258 + discovery: gate is title + stream only;
    // missing description/inputs is discovery's job to surface, not the
    // button's job to block.
    expect(canStartIdleTask(READY)).toBe(true)
  })

  it('disables the button without a stream', () => {
    expect(canStartIdleTask({ ...READY, streamSlug: null })).toBe(false)
  })

  it('disables the button without a title', () => {
    expect(canStartIdleTask({ ...READY, title: '' })).toBe(false)
    expect(canStartIdleTask({ ...READY, title: '   ' })).toBe(false)
    expect(canStartIdleTask({ ...READY, title: null })).toBe(false)
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
