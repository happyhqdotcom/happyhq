import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const { mockStat } = vi.hoisted(() => ({
  mockStat: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: { stat: mockStat },
  stat: mockStat,
}))

const { mockExecSync } = vi.hoisted(() => ({
  mockExecSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execSync: mockExecSync,
}))

import { POST } from './route'

function makeRequest(body?: unknown) {
  return new Request('http://localhost/api/fs/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : 'not json{',
  })
}

describe('POST /api/fs/reveal', () => {
  it('returns 400 when body is invalid JSON', async () => {
    const response = await POST(
      new Request('http://localhost/api/fs/reveal', {
        method: 'POST',
        body: 'not json{',
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid JSON' })
  })

  it('returns 400 when path is missing', async () => {
    const response = await POST(makeRequest({}))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing path parameter' })
  })

  it('returns 403 for path traversal attempts', async () => {
    const response = await POST(makeRequest({ path: '../../etc/passwd' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Invalid path' })
  })

  it('returns 404 when file does not exist', async () => {
    const error = new Error('ENOENT') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    mockStat.mockRejectedValue(error)

    const response = await POST(
      makeRequest({ path: 'my-stream/outputs/missing.md' }),
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'File not found' })
  })

  it('returns 501 on non-macOS platforms', async () => {
    mockStat.mockResolvedValue({ isFile: () => true })
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'linux' })

    try {
      const response = await POST(
        makeRequest({ path: 'my-stream/outputs/report.md' }),
      )
      const body = await response.json()

      expect(response.status).toBe(501)
      expect(body).toEqual({ error: 'Not supported on this platform' })
      expect(mockExecSync).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('calls open -R and returns ok for a valid file', async () => {
    mockStat.mockResolvedValue({ isFile: () => true })
    mockExecSync.mockReturnValue(undefined)

    const response = await POST(
      makeRequest({ path: 'my-stream/outputs/report.md' }),
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockExecSync).toHaveBeenCalledWith(
      'open -R "/mock/home/HappyHQ/my-stream/outputs/report.md"',
    )
  })
})
