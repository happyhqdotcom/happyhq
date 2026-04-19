import { describe, expect, it } from 'vitest'

import {
  cancelPending,
  denyPending,
  submitAnswer,
  waitForAnswer,
} from './pending-questions'

describe('pending-questions', () => {
  const sessionId = 'test-session-001'

  describe('waitForAnswer + submitAnswer', () => {
    it('resolves with the submitted answers', async () => {
      const promise = waitForAnswer(sessionId)
      const answers = { q1: 'a1', q2: 'a2' }

      const found = submitAnswer(sessionId, answers)

      expect(found).toBe(true)
      await expect(promise).resolves.toEqual(answers)
    })

    it('returns false when no pending entry exists', () => {
      expect(submitAnswer('nonexistent', { q1: 'a1' })).toBe(false)
    })
  })

  describe('waitForAnswer + denyPending', () => {
    it('rejects with an error when denied', async () => {
      const promise = waitForAnswer(sessionId)

      const found = denyPending(sessionId)

      expect(found).toBe(true)
      await expect(promise).rejects.toThrow('User denied AskUserQuestion')
    })

    it('returns false when no pending entry exists', () => {
      expect(denyPending('nonexistent')).toBe(false)
    })
  })

  describe('cancelPending', () => {
    it('removes the entry so submit and deny find nothing', () => {
      waitForAnswer(sessionId)
      cancelPending(sessionId)

      expect(submitAnswer(sessionId, { q1: 'a1' })).toBe(false)
      expect(denyPending(sessionId)).toBe(false)
    })
  })

  describe('stale entry cleanup', () => {
    it('replaces a stale entry when waitForAnswer is called again', async () => {
      // First call creates an entry (simulates stale pending)
      waitForAnswer(sessionId)
      // Second call replaces it — only the new promise should resolve
      const promise = waitForAnswer(sessionId)
      submitAnswer(sessionId, { q1: 'fresh' })
      await expect(promise).resolves.toEqual({ q1: 'fresh' })
    })
  })

  describe('isolation between sessions', () => {
    it('does not cross-resolve different sessions', async () => {
      const promiseA = waitForAnswer('session-a')
      const promiseB = waitForAnswer('session-b')

      submitAnswer('session-a', { q1: 'answer-a' })
      denyPending('session-b')

      await expect(promiseA).resolves.toEqual({ q1: 'answer-a' })
      await expect(promiseB).rejects.toThrow('User denied AskUserQuestion')
    })
  })

  describe('submit after deny has no effect', () => {
    it('returns false if entry was already denied', async () => {
      const promise = waitForAnswer(sessionId)
      denyPending(sessionId)

      // Entry is gone — submit should find nothing
      expect(submitAnswer(sessionId, { q1: 'too late' })).toBe(false)

      // Promise was rejected by deny
      await expect(promise).rejects.toThrow()
    })
  })
})
