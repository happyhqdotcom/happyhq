import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockReadStreamContent, mockStreamExists } = vi.hoisted(() => ({
  mockReadStreamContent: vi.fn(),
  mockStreamExists: vi.fn(),
}))

vi.mock('@/lib/fs/read.server', () => ({
  readStreamContent: mockReadStreamContent,
  streamExists: mockStreamExists,
}))

import { GET } from './route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/fs/stream')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/fs/stream', () => {
  it('returns 400 when name parameter is missing', async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing name parameter' })
  })

  it('returns StreamContent for a valid stream name', async () => {
    const streamContent = {
      playbook: '# My Playbook',
      specs: [
        {
          name: 'tone.md',
          path: 'my-stream/specs/tone.md',
          type: 'file',
          modifiedAt: '2024-01-01T00:00:00.000Z',
        },
      ],
      samples: [],
      tasks: [],
    }
    mockStreamExists.mockResolvedValue(true)
    mockReadStreamContent.mockResolvedValue(streamContent)

    const response = await GET(makeRequest({ name: 'my-stream' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(streamContent)
  })

  it('returns 404 for a nonexistent stream', async () => {
    mockStreamExists.mockResolvedValue(false)

    const response = await GET(makeRequest({ name: 'nonexistent' }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Stream not found' })
    // readStreamContent should not be called for a nonexistent stream
    expect(mockReadStreamContent).not.toHaveBeenCalled()
  })

  it('returns StreamContent with null/empty fields for an existing empty stream', async () => {
    const emptyContent = {
      playbook: null,
      specs: [],
      samples: [],
      tasks: [],
    }
    mockStreamExists.mockResolvedValue(true)
    mockReadStreamContent.mockResolvedValue(emptyContent)

    const response = await GET(makeRequest({ name: 'empty-stream' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(emptyContent)
  })

  it('returns 500 when readStreamContent throws', async () => {
    mockStreamExists.mockResolvedValue(true)
    mockReadStreamContent.mockRejectedValue(new Error('disk failure'))

    const response = await GET(makeRequest({ name: 'my-stream' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
