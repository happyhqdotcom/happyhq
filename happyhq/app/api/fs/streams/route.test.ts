import { describe, expect, it, vi } from 'vitest'

const { mockReadStreams } = vi.hoisted(() => ({
  mockReadStreams: vi.fn(),
}))

vi.mock('@/lib/fs/read.server', () => ({
  readStreams: mockReadStreams,
}))

import { GET } from './route'

describe('GET /api/fs/streams', () => {
  it('returns streams as JSON array', async () => {
    const streams = [
      { name: 'stream-a', createdAt: '2024-06-01T00:00:00.000Z' },
      { name: 'stream-b', createdAt: '2024-01-01T00:00:00.000Z' },
    ]
    mockReadStreams.mockResolvedValue(streams)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(streams)
  })

  it('returns empty array when no streams exist', async () => {
    mockReadStreams.mockResolvedValue([])

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual([])
  })

  it('returns 500 when readStreams throws', async () => {
    mockReadStreams.mockRejectedValue(new Error('disk failure'))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
