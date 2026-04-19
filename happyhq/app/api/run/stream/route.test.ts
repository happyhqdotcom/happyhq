import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetActiveStream } = vi.hoisted(() => ({
  mockGetActiveStream: vi.fn(),
}))

vi.mock('@/lib/run/loop.server', () => ({
  getActiveStream: mockGetActiveStream,
}))

import { GET } from './route'

describe('GET /api/run/stream', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns 404 when no run is active', async () => {
    mockGetActiveStream.mockReturnValue(null)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'No active run' })
  })

  it('returns streaming response with correct headers when run is active', async () => {
    const { readable } = new TransformStream<Uint8Array, Uint8Array>()
    mockGetActiveStream.mockReturnValue(readable)

    const response = await GET()

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/x-ndjson')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.body).toBe(readable)
  })
})
