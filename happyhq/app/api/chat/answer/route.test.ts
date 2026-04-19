import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockSubmitAnswer, mockDenyPending } = vi.hoisted(() => ({
  mockSubmitAnswer: vi.fn(),
  mockDenyPending: vi.fn(),
}))

const { mockAllowConfirmation, mockDenyConfirmation } = vi.hoisted(() => ({
  mockAllowConfirmation: vi.fn(),
  mockDenyConfirmation: vi.fn(),
}))

vi.mock('@/lib/chat/pending-questions', () => ({
  submitAnswer: mockSubmitAnswer,
  denyPending: mockDenyPending,
}))

vi.mock('@/lib/chat/pending-confirmations', () => ({
  allowConfirmation: mockAllowConfirmation,
  denyConfirmation: mockDenyConfirmation,
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/chat/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/chat/answer', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 400 for invalid JSON', async () => {
    const request = new Request('http://localhost/api/chat/answer', {
      method: 'POST',
      body: 'not json',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when sessionId is missing', async () => {
    const response = await POST(makeRequest({ answers: { q1: 'a1' } }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing sessionId' })
  })

  describe('answering a pending question', () => {
    it('resolves a pending question with the provided answers', async () => {
      mockSubmitAnswer.mockReturnValue(true)

      const response = await POST(
        makeRequest({
          sessionId: 'session-1',
          answers: { q1: 'answer-1', q2: 'answer-2' },
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true })
      expect(mockSubmitAnswer).toHaveBeenCalledWith('session-1', {
        q1: 'answer-1',
        q2: 'answer-2',
      })
    })

    it('returns 404 when no pending question exists', async () => {
      mockSubmitAnswer.mockReturnValue(false)

      const response = await POST(
        makeRequest({ sessionId: 'session-1', answers: { q1: 'a1' } }),
      )
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body).toEqual({ error: 'No pending question for this session' })
    })

    it('returns 400 when answers field is missing', async () => {
      const response = await POST(makeRequest({ sessionId: 'session-1' }))
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({ error: 'Missing answers' })
    })
  })

  describe('allowing a pending confirmation', () => {
    it('resolves a pending confirmation when allow is true', async () => {
      mockAllowConfirmation.mockReturnValue(true)

      const response = await POST(
        makeRequest({
          sessionId: 'session-1',
          toolUseId: 'toolu_123',
          allow: true,
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true })
      expect(mockAllowConfirmation).toHaveBeenCalledWith('toolu_123')
    })

    it('returns 400 when toolUseId is missing for allow', async () => {
      const response = await POST(
        makeRequest({ sessionId: 'session-1', allow: true }),
      )
      const body = await response.json()

      expect(response.status).toBe(400)
      expect(body).toEqual({ error: 'Missing toolUseId' })
    })

    it('returns 404 when no pending confirmation exists for allow', async () => {
      mockAllowConfirmation.mockReturnValue(false)

      const response = await POST(
        makeRequest({
          sessionId: 'session-1',
          toolUseId: 'toolu_123',
          allow: true,
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body).toEqual({
        error: 'No pending confirmation for this tool call',
      })
    })
  })

  describe('denying', () => {
    it('denies a pending question first when both exist', async () => {
      mockDenyPending.mockReturnValue(true)

      const response = await POST(
        makeRequest({
          sessionId: 'session-1',
          toolUseId: 'toolu_123',
          deny: true,
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true })
      expect(mockDenyPending).toHaveBeenCalledWith('session-1')
      expect(mockDenyConfirmation).not.toHaveBeenCalled()
    })

    it('falls through to deny confirmation when no pending question', async () => {
      mockDenyPending.mockReturnValue(false)
      mockDenyConfirmation.mockReturnValue(true)

      const response = await POST(
        makeRequest({
          sessionId: 'session-1',
          toolUseId: 'toolu_123',
          deny: true,
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true })
      expect(mockDenyPending).toHaveBeenCalledWith('session-1')
      expect(mockDenyConfirmation).toHaveBeenCalledWith('toolu_123')
    })

    it('returns 404 when nothing is pending to deny', async () => {
      mockDenyPending.mockReturnValue(false)
      mockDenyConfirmation.mockReturnValue(false)

      const response = await POST(
        makeRequest({
          sessionId: 'session-1',
          toolUseId: 'toolu_123',
          deny: true,
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body).toEqual({
        error: 'No pending question or confirmation for this session',
      })
    })

    it('falls through to 404 when deny has no toolUseId and no pending question', async () => {
      mockDenyPending.mockReturnValue(false)

      const response = await POST(
        makeRequest({ sessionId: 'session-1', deny: true }),
      )
      const body = await response.json()

      expect(response.status).toBe(404)
      expect(body).toEqual({
        error: 'No pending question or confirmation for this session',
      })
    })
  })

  describe('priority: allow takes precedence over answers', () => {
    it('processes allow before checking answers', async () => {
      mockAllowConfirmation.mockReturnValue(true)

      const response = await POST(
        makeRequest({
          sessionId: 'session-1',
          toolUseId: 'toolu_123',
          allow: true,
          answers: { q1: 'a1' },
        }),
      )
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true })
      expect(mockAllowConfirmation).toHaveBeenCalled()
      expect(mockSubmitAnswer).not.toHaveBeenCalled()
    })
  })
})
