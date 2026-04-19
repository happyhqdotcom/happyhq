import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetActiveRunInfo } = vi.hoisted(() => ({
  mockGetActiveRunInfo: vi.fn(),
}))

vi.mock('@/lib/run/loop.server', () => ({
  getActiveRunInfo: mockGetActiveRunInfo,
}))

import { GET } from './route'

describe('GET /api/run/active', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('returns null when no run is active', async () => {
    mockGetActiveRunInfo.mockReturnValue(null)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toBeNull()
  })

  it('returns stream and task when a run is active', async () => {
    mockGetActiveRunInfo.mockReturnValue({
      stream: 'my-stream',
      task: 'my-task',
    })

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ stream: 'my-stream', task: 'my-task' })
  })
})
