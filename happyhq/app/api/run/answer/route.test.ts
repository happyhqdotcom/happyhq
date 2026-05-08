import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockSubmitAnswer, mockGetActiveDiscoverySessionId } = vi.hoisted(
  () => ({
    mockSubmitAnswer: vi.fn(),
    mockGetActiveDiscoverySessionId: vi.fn(),
  }),
)

vi.mock('@/lib/chat/pending-questions', () => ({
  submitAnswer: mockSubmitAnswer,
}))

vi.mock('@/lib/run/loop.server', () => ({
  getActiveDiscoverySessionId: mockGetActiveDiscoverySessionId,
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/run/answer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/run/answer', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 400 for invalid JSON', async () => {
    const request = new Request('http://localhost/api/run/answer', {
      method: 'POST',
      body: 'not json',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when body is an array', async () => {
    const response = await POST(makeRequest([1, 2, 3]))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid body' })
  })

  it('returns 400 when answers field is missing', async () => {
    const response = await POST(makeRequest({}))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing or invalid answers' })
  })

  it('returns 400 when answers is not an object', async () => {
    const response = await POST(makeRequest({ answers: 'not-an-object' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing or invalid answers' })
  })

  it('returns 400 when answers is an array', async () => {
    const response = await POST(makeRequest({ answers: ['a', 'b'] }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing or invalid answers' })
  })

  it('returns 400 when an answer value is not a string', async () => {
    const response = await POST(makeRequest({ answers: { q1: 42 } }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid answer value' })
  })

  it('returns 404 when no discovery session is active', async () => {
    mockGetActiveDiscoverySessionId.mockReturnValue(null)

    const response = await POST(makeRequest({ answers: { q1: 'a1' } }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'No pending question' })
    expect(mockSubmitAnswer).not.toHaveBeenCalled()
  })

  it('returns 404 when submitAnswer returns false (session aborted)', async () => {
    mockGetActiveDiscoverySessionId.mockReturnValue('session-1')
    mockSubmitAnswer.mockReturnValue(false)

    const response = await POST(makeRequest({ answers: { q1: 'a1' } }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'No pending question' })
  })

  it('resolves the pending question and returns 200 on success', async () => {
    mockGetActiveDiscoverySessionId.mockReturnValue('session-1')
    mockSubmitAnswer.mockReturnValue(true)

    const response = await POST(
      makeRequest({ answers: { q1: 'answer-1', q2: 'answer-2' } }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'answered' })
    expect(mockSubmitAnswer).toHaveBeenCalledWith('session-1', {
      q1: 'answer-1',
      q2: 'answer-2',
    })
  })
})
