import { describe, expect, it } from 'vitest'

import {
  allowConfirmation,
  cancelConfirmation,
  denyConfirmation,
  waitForConfirmation,
} from './pending-confirmations'

describe('pending-confirmations', () => {
  const toolUseId = 'toolu_test_001'

  describe('waitForConfirmation + allowConfirmation', () => {
    it('resolves with true when allowed', async () => {
      const promise = waitForConfirmation(toolUseId)
      const found = allowConfirmation(toolUseId)
      expect(found).toBe(true)
      await expect(promise).resolves.toBe(true)
    })

    it('returns false when no pending entry exists', () => {
      expect(allowConfirmation('nonexistent')).toBe(false)
    })
  })

  describe('waitForConfirmation + denyConfirmation', () => {
    it('resolves with false when denied', async () => {
      const promise = waitForConfirmation(toolUseId)
      const found = denyConfirmation(toolUseId)
      expect(found).toBe(true)
      await expect(promise).resolves.toBe(false)
    })

    it('returns false when no pending entry exists', () => {
      expect(denyConfirmation('nonexistent')).toBe(false)
    })
  })

  describe('cancelConfirmation', () => {
    it('removes the entry without resolving or rejecting', () => {
      waitForConfirmation(toolUseId)
      cancelConfirmation(toolUseId)
      // After cancel, allow/deny should find nothing
      expect(allowConfirmation(toolUseId)).toBe(false)
      expect(denyConfirmation(toolUseId)).toBe(false)
    })
  })

  describe('isolation between tool calls', () => {
    it('does not cross-resolve different tool calls', async () => {
      const promise1 = waitForConfirmation('toolu_aaa')
      const promise2 = waitForConfirmation('toolu_bbb')

      allowConfirmation('toolu_aaa')
      denyConfirmation('toolu_bbb')

      await expect(promise1).resolves.toBe(true)
      await expect(promise2).resolves.toBe(false)
    })

    it('supports multiple pending confirmations from the same session', async () => {
      // Two tool calls in the same assistant turn — keyed by toolUseId, not sessionId
      const promise1 = waitForConfirmation('toolu_turn1_a')
      const promise2 = waitForConfirmation('toolu_turn1_b')

      allowConfirmation('toolu_turn1_a')
      denyConfirmation('toolu_turn1_b')

      await expect(promise1).resolves.toBe(true)
      await expect(promise2).resolves.toBe(false)
    })
  })
})
