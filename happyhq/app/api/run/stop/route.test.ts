import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  mockStopRun,
  mockGetActiveRunInfo,
  mockIsRunActive,
  mockClearStaleRun,
} = vi.hoisted(() => ({
  mockStopRun: vi.fn(),
  mockGetActiveRunInfo: vi.fn<() => { stream: string; task: string } | null>(
    () => null,
  ),
  mockIsRunActive: vi.fn<() => boolean>(() => false),
  mockClearStaleRun: vi.fn(),
}))

const { mockReadTaskContent } = vi.hoisted(() => ({
  mockReadTaskContent: vi.fn(),
}))

vi.mock('@/lib/run/loop.server', () => ({
  stopRun: mockStopRun,
  getActiveRunInfo: mockGetActiveRunInfo,
  isRunActive: mockIsRunActive,
  clearStaleRun: mockClearStaleRun,
}))

vi.mock('@/lib/fs/read.server', () => ({
  readTaskContent: mockReadTaskContent,
}))

import { POST } from './route'

function makeRequest(body?: object): Request {
  if (!body) {
    return new Request('http://localhost/api/run/stop', { method: 'POST' })
  }
  return new Request('http://localhost/api/run/stop', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/run/stop', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('stops active run and returns stopping', async () => {
    mockIsRunActive.mockReturnValue(true)

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'stopping' })
    expect(mockStopRun).toHaveBeenCalledTimes(1)
  })

  it('returns 409 when stream/task does not match active run', async () => {
    mockGetActiveRunInfo.mockReturnValue({
      stream: 'stream-a',
      task: 'task-1',
    })

    const response = await POST(
      makeRequest({ stream: 'stream-b', task: 'task-2' }),
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('stream-a/task-1')
    expect(mockStopRun).not.toHaveBeenCalled()
  })

  it('stops run when stream/task matches active run', async () => {
    mockIsRunActive.mockReturnValue(true)
    mockGetActiveRunInfo.mockReturnValue({
      stream: 'stream-a',
      task: 'task-1',
    })

    const response = await POST(
      makeRequest({ stream: 'stream-a', task: 'task-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'stopping' })
    expect(mockStopRun).toHaveBeenCalledTimes(1)
  })

  it('clears stale .run.json when no server-side run exists', async () => {
    mockIsRunActive.mockReturnValue(false)
    mockReadTaskContent.mockResolvedValue({
      run: { status: 'working' },
    })

    const response = await POST(
      makeRequest({ stream: 'stream-a', task: 'task-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'cleared_stale' })
    expect(mockClearStaleRun).toHaveBeenCalledWith('task-1')
    expect(mockStopRun).not.toHaveBeenCalled()
  })

  it('returns no_run when nothing is active or stale', async () => {
    mockIsRunActive.mockReturnValue(false)
    mockReadTaskContent.mockResolvedValue({
      run: { status: 'completed' },
    })

    const response = await POST(
      makeRequest({ stream: 'stream-a', task: 'task-1' }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'no_run' })
  })

  it('returns no_run without stream/task params when not active', async () => {
    mockIsRunActive.mockReturnValue(false)

    const response = await POST(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ status: 'no_run' })
  })
})
