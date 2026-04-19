import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const { mockReadFile, mockStat } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockStat: vi.fn(),
}))

vi.mock('node:fs/promises', () => ({
  default: { readFile: mockReadFile, stat: mockStat },
  readFile: mockReadFile,
  stat: mockStat,
}))

import { GET } from './route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/fs/download')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url)
}

describe('GET /api/fs/download', () => {
  it('returns 400 when path parameter is missing', async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing path parameter' })
  })

  it('serves the raw file with Content-Disposition header', async () => {
    const fileContent = Buffer.from('Hello, world!')
    mockStat.mockResolvedValue({ isFile: () => true })
    mockReadFile.mockResolvedValue(fileContent)

    const response = await GET(
      makeRequest({ path: 'my-stream/outputs/report.md' }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="report.md"',
    )
    expect(response.headers.get('Content-Length')).toBe(
      String(fileContent.length),
    )
    const body = await response.arrayBuffer()
    expect(Buffer.from(body).toString()).toBe('Hello, world!')
  })

  it('returns 404 when file does not exist', async () => {
    const error = new Error('ENOENT') as NodeJS.ErrnoException
    error.code = 'ENOENT'
    mockStat.mockRejectedValue(error)

    const response = await GET(
      makeRequest({ path: 'my-stream/outputs/missing.md' }),
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'File not found' })
  })

  it('returns 403 for path traversal attempts', async () => {
    const response = await GET(makeRequest({ path: '../../etc/passwd' }))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body).toEqual({ error: 'Invalid path' })
  })

  it('returns 400 when path points to a directory', async () => {
    mockStat.mockResolvedValue({ isFile: () => false })

    const response = await GET(makeRequest({ path: 'my-stream/outputs' }))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Not a file' })
  })
})
