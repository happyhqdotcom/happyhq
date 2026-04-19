import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/constants.server', () => ({
  HAPPYHQ_ROOT: '/mock/home/HappyHQ',
}))

const { mockReadTextFile } = vi.hoisted(() => ({
  mockReadTextFile: vi.fn(),
}))

vi.mock('@/lib/fs/read.server', () => ({
  readTextFile: mockReadTextFile,
}))

import { GET } from './route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/fs/file')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url)
}

describe('GET /api/fs/file', () => {
  it('returns 400 when path parameter is missing', async () => {
    const response = await GET(makeRequest())
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body).toEqual({ error: 'Missing path parameter' })
  })

  it('returns file content wrapped in { content } for an existing file', async () => {
    mockReadTextFile.mockResolvedValue('# Hello World')

    const response = await GET(
      makeRequest({ path: 'my-stream/specs/tone.md' }) as any,
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ content: '# Hello World' })
  })

  it('returns 404 when file does not exist', async () => {
    mockReadTextFile.mockResolvedValue(null)

    const response = await GET(
      makeRequest({ path: 'my-stream/missing.md' }) as any,
    )
    const body = await response.json()

    expect(response.status).toBe(404)
    expect(body).toEqual({ error: 'File not found' })
  })

  it('returns 500 when readTextFile throws (e.g., path traversal rejection)', async () => {
    mockReadTextFile.mockRejectedValue(
      new Error('Path ../../etc/passwd is outside ~/HappyHQ/'),
    )

    const response = await GET(makeRequest({ path: '../../etc/passwd' }) as any)
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(body).toEqual({ error: 'Internal server error' })
  })
})
