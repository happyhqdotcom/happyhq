import { describe, expect, it, vi } from 'vitest'

const { mockReadTaskContent } = vi.hoisted(() => ({
  mockReadTaskContent: vi.fn(),
}))

vi.mock('@/lib/fs/read.server', () => ({
  readTaskContent: mockReadTaskContent,
}))

import { GET } from './route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/fs/task')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url)
}

describe('GET /api/fs/task', () => {
  it('returns 400 when task parameter is missing', async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing task parameter' })
  })

  it('returns 404 when task does not exist', async () => {
    mockReadTaskContent.mockResolvedValue(null)

    const response = await GET(makeRequest({ task: 'nonexistent' }))
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'Task not found' })
  })

  it('returns TaskContent for an existing task', async () => {
    const taskContent = {
      plan: '# Plan\nDo the thing.',
      progress: 'Step 1 done.',
      run: {
        status: 'working',
        iteration: 1,
        startedAt: '2024-01-01T00:00:00.000Z',
        lastIterationAt: '2024-01-01T00:01:00.000Z',
        error: null,
      },
      inputs: [],
      files: [],
      outputs: [],
    }
    mockReadTaskContent.mockResolvedValue(taskContent)

    const response = await GET(makeRequest({ task: 'my-task' }))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual(taskContent)
  })

  it('ignores stream param and always reads from root', async () => {
    const taskContent = { plan: null, run: null, inputs: [], outputs: [] }
    mockReadTaskContent.mockResolvedValue(taskContent)

    const response = await GET(
      makeRequest({ stream: 'some-stream', task: 'my-task' }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    // Verify readTaskContent was called with just the task slug
    expect(mockReadTaskContent).toHaveBeenCalledWith('my-task')
  })

  it('returns 500 when readTaskContent throws', async () => {
    mockReadTaskContent.mockRejectedValue(new Error('disk failure'))

    const response = await GET(makeRequest({ task: 'my-task' }))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
