import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockAbortSession } = vi.hoisted(() => ({
  mockAbortSession: vi.fn(),
}))

vi.mock('@/lib/chat/active-sessions', () => ({
  abortSession: mockAbortSession,
}))

import { POST } from './route'

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/chat/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/chat/stop', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 400 for invalid JSON', async () => {
    const request = new Request('http://localhost/api/chat/stop', {
      method: 'POST',
      body: 'not json',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when sessionId is missing', async () => {
    const response = await POST(makeRequest({}))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing sessionId' })
  })

  it('returns 404 when no active session exists for the given sessionId', async () => {
    mockAbortSession.mockReturnValue(false)

    const response = await POST(makeRequest({ sessionId: 'nonexistent' }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'No active session' })
    expect(mockAbortSession).toHaveBeenCalledWith('nonexistent')
  })

  it('aborts the session and returns 200 on success', async () => {
    mockAbortSession.mockReturnValue(true)

    const response = await POST(makeRequest({ sessionId: 'session-42' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'stopping' })
    expect(mockAbortSession).toHaveBeenCalledWith('session-42')
  })
})
