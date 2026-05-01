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

const { mockExecFileSync } = vi.hoisted(() => ({
  mockExecFileSync: vi.fn(),
}))

vi.mock('node:child_process', () => ({
  execFileSync: mockExecFileSync,
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

  it('rejects path traversal attempts at the regex barrier (400)', async () => {
    // The per-segment regex barrier sits on the original taint source and
    // rejects `..` before the path is joined with HAPPYHQ_ROOT. CodeQL needs
    // this character-class barrier on the source to model the sanitiser.
    const response = await POST(makeRequest({ path: '../../etc/passwd' }))
    const body = await response.json()

    expect(response.status).toBe(400)
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
      expect(mockExecFileSync).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('spawns open without a shell, passing the path as a discrete argv element', async () => {
    // Security contract: the path must reach `open` as its own argv slot so
    // shell metacharacters in a filename can never be interpreted as a command.
    // The path-segment regex barrier now rejects shell metacharacters before
    // they reach execFileSync — but execFileSync's argv-isolation remains the
    // last line of defence, so we still verify the path is passed positionally.
    mockStat.mockResolvedValue({ isFile: () => true })
    mockExecFileSync.mockReturnValue(undefined)
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin' })

    try {
      const safeFilename = 'my-stream/outputs/quarterly-report.md'
      const response = await POST(makeRequest({ path: safeFilename }))
      const body = await response.json()

      expect(response.status).toBe(200)
      expect(body).toEqual({ ok: true })
      expect(mockExecFileSync).toHaveBeenCalledTimes(1)
      const [file, args] = mockExecFileSync.mock.calls[0]
      expect(file).toBe('open')
      expect(args).toEqual(['-R', `/mock/home/HappyHQ/${safeFilename}`])
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform })
    }
  })

  it('rejects shell metacharacters in path segments at the regex barrier', async () => {
    // Shell metacharacters can't appear in any segment — the regex barrier
    // matches `^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$` and rejects spaces, quotes,
    // and `;`. This is the layer that closes the CodeQL `js/path-injection`
    // alert; execFileSync's argv-isolation is the last-line backstop.
    const response = await POST(
      makeRequest({ path: 'my-stream/outputs/"; touch /tmp/pwn; "weird.md' }),
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Invalid path' })
  })
})
