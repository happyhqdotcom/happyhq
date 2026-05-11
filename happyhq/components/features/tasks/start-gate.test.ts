import { describe, expect, it } from 'vitest'
import {
  canStartIdleTask,
  idleTaskBlockedHint,
  idleTaskBlockedReason,
} from './start-gate'

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

describe('idleTaskBlockedReason', () => {
  it('returns null when startable', () => {
    expect(idleTaskBlockedReason(READY)).toBeNull()
  })

  it('reports no-title before no-stream when both are missing', () => {
    // Title is the most actionable knob: the user is staring at it as they
    // type. Surface it first.
    expect(
      idleTaskBlockedReason({ ...READY, title: '', streamSlug: null }),
    ).toBe('no-title')
  })

  it('reports no-stream when title is set but stream is missing', () => {
    expect(idleTaskBlockedReason({ ...READY, streamSlug: null })).toBe(
      'no-stream',
    )
  })

  it('reports uploading after content prerequisites are met', () => {
    expect(idleTaskBlockedReason({ ...READY, isUploading: true })).toBe(
      'uploading',
    )
  })

  it('reports loading for in-flight start requests', () => {
    expect(idleTaskBlockedReason({ ...READY, runActionsLoading: true })).toBe(
      'loading',
    )
  })

  it('reports upgrade-needed when out of quota', () => {
    expect(
      idleTaskBlockedReason({ ...READY, runActionsUpgradeNeeded: true }),
    ).toBe('upgrade-needed')
  })
})

describe('idleTaskBlockedHint', () => {
  it('returns null when nothing is blocking', () => {
    expect(idleTaskBlockedHint(null)).toBeNull()
  })

  it('returns user-actionable hints for content reasons', () => {
    expect(idleTaskBlockedHint('no-title')).toBe('Add a title to start')
    expect(idleTaskBlockedHint('no-stream')).toBe('Assign a stream to start')
    expect(idleTaskBlockedHint('uploading')).toBe('Waiting for upload…')
  })

  it('returns null for reasons surfaced elsewhere', () => {
    // `loading` is sub-second; `upgrade-needed` already has its own banner
    // directly above the button.
    expect(idleTaskBlockedHint('loading')).toBeNull()
    expect(idleTaskBlockedHint('upgrade-needed')).toBeNull()
  })
})
