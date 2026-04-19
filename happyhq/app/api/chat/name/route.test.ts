import { describe, expect, it, vi } from 'vitest'

const { mockSetChatName } = vi.hoisted(() => ({
  mockSetChatName: vi.fn(),
}))

vi.mock('@/lib/actions', () => ({
  setChatName: mockSetChatName,
}))

import { POST } from './route'

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/chat/name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/chat/name', () => {
  it('persists the provided name to chat.json', async () => {
    mockSetChatName.mockResolvedValue(undefined)

    const res = await POST(
      makeRequest({
        streamSlug: 'my-stream',
        sessionId: 'sess-1',
        name: 'Help me set up weekly reports',
      }),
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(mockSetChatName).toHaveBeenCalledWith(
      'sess-1',
      'Help me set up weekly reports',
    )
  })

  it('returns 400 when required fields are missing', async () => {
    const res = await POST(
      makeRequest({ streamSlug: 'stream', sessionId: 'sess-1' }),
    )

    expect(res.status).toBe(400)
    const data = await res.json()
    expect(data.error).toBe('Missing required fields')
  })

  it('returns 400 for invalid JSON', async () => {
    const res = await POST(
      new Request('http://localhost/api/chat/name', {
        method: 'POST',
        body: 'not json',
      }),
    )

    expect(res.status).toBe(400)
  })

  it('returns 500 when setChatName fails', async () => {
    mockSetChatName.mockRejectedValue(new Error('Disk full'))

    const res = await POST(
      makeRequest({
        streamSlug: 'stream',
        sessionId: 'sess-5',
        name: 'Hello',
      }),
    )

    expect(res.status).toBe(500)
    const data = await res.json()
    expect(data.error).toBe('Failed to save chat name')
  })
})
