import { describe, expect, it, vi } from 'vitest'

const { mockListChats, mockListAllChats, mockStreamExists } = vi.hoisted(
  () => ({
    mockListChats: vi.fn(),
    mockListAllChats: vi.fn(),
    mockStreamExists: vi.fn(),
  }),
)

vi.mock('@/lib/fs/read.server', () => ({
  listChats: mockListChats,
  listAllChats: mockListAllChats,
  streamExists: mockStreamExists,
}))

import { GET } from './route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/fs/chats')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url)
}

describe('GET /api/fs/chats', () => {
  it('returns all chats when name parameter is missing', async () => {
    const allChats = [
      {
        streamName: 'stream-1',
        sessionId: 'sess-1',
        title: 'Chat one',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
    ]
    mockListAllChats.mockResolvedValue(allChats)

    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(allChats)
  })

  it('returns 404 when stream does not exist', async () => {
    mockStreamExists.mockResolvedValue(false)

    const response = await GET(makeRequest({ name: 'nonexistent-stream' }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Stream not found' })
  })

  it('returns chat sessions for an existing stream', async () => {
    const chats = [
      {
        sessionId: 'sess-1',
        name: 'First chat',
        createdAt: '2024-01-02T00:00:00.000Z',
      },
      {
        sessionId: 'sess-2',
        name: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ]
    mockStreamExists.mockResolvedValue(true)
    mockListChats.mockResolvedValue(chats)

    const response = await GET(makeRequest({ name: 'my-stream' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(chats)
    expect(mockListChats).toHaveBeenCalledWith('my-stream')
  })

  it('returns empty array when stream has no chats', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockListChats.mockResolvedValue([])

    const response = await GET(makeRequest({ name: 'empty-stream' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual([])
  })

  it('returns 500 when listChats throws', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockListChats.mockRejectedValue(new Error('disk failure'))

    const response = await GET(makeRequest({ name: 'my-stream' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })

  it('returns 500 when streamExists throws', async () => {
    mockStreamExists.mockRejectedValue(new Error('permission denied'))

    const response = await GET(makeRequest({ name: 'my-stream' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
