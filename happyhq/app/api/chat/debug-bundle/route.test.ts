import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockAssembleDebugBundle = vi.hoisted(() => vi.fn())

vi.mock('@/lib/chat/assemble-debug-bundle.server', () => ({
  assembleDebugBundle: mockAssembleDebugBundle,
}))

import { GET } from './route'

function makeRequest(params: Record<string, string> = {}) {
  const url = new URL('http://localhost/api/chat/debug-bundle')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  return new Request(url)
}

const validBundle = {
  version: 1,
  exportedAt: '2025-01-01T00:00:00.000Z',
  appVersion: '0.1.0',
  streamName: 'my-stream',
  chat: { sessionId: 'abc12345-full-id', name: 'Test chat', createdAt: null },
  rawJournal: '{"type":"user"}\n{"type":"assistant"}\n',
  playbook: null,
  specs: [],
  environment: { platform: 'darwin', nodeVersion: 'v20.0.0', arch: 'arm64' },
}

describe('GET /api/chat/debug-bundle', () => {
  beforeEach(() => {
    mockAssembleDebugBundle.mockResolvedValue(validBundle)
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  it('succeeds when stream parameter is missing (stream is optional)', async () => {
    const res = await GET(makeRequest({ session: 'abc12345-full-id' }))
    expect(res.status).toBe(200)
    const disposition = res.headers.get('Content-Disposition')
    expect(disposition).toBe('attachment; filename="debug-root-abc12345.json"')
  })

  it('returns 400 when session parameter is missing', async () => {
    const res = await GET(makeRequest({ stream: 'my-stream' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Missing session parameter')
  })

  it('returns 400 when session contains forward slash (directory traversal)', async () => {
    const res = await GET(
      makeRequest({ stream: 'my-stream', session: '../etc/passwd' }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid session ID')
  })

  it('returns 400 when session contains backslash (directory traversal)', async () => {
    const res = await GET(
      makeRequest({ stream: 'my-stream', session: 'abc\\def' }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid session ID')
  })

  it('returns 400 when session contains dot-dot (parent traversal)', async () => {
    const res = await GET(
      makeRequest({ stream: 'my-stream', session: 'abc..def' }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid session ID')
  })

  it('returns JSON with Content-Disposition attachment header for valid params', async () => {
    const res = await GET(
      makeRequest({ stream: 'my-stream', session: 'abc12345-full-id' }),
    )
    expect(res.status).toBe(200)

    const disposition = res.headers.get('Content-Disposition')
    expect(disposition).toBe(
      'attachment; filename="debug-my-stream-abc12345.json"',
    )
    expect(res.headers.get('Content-Type')).toBe('application/json')

    const body = await res.json()
    expect(body.version).toBe(1)
    expect(body.streamName).toBe('my-stream')
  })

  it('filename uses first 8 chars of session ID', async () => {
    const res = await GET(
      makeRequest({
        stream: 'client-proposals',
        session: 'deadbeef-9999-aaaa-bbbb',
      }),
    )
    const disposition = res.headers.get('Content-Disposition')
    expect(disposition).toBe(
      'attachment; filename="debug-client-proposals-deadbeef.json"',
    )
  })

  it('returns 500 when assembleDebugBundle throws', async () => {
    mockAssembleDebugBundle.mockRejectedValue(new Error('Disk read failed'))
    const res = await GET(
      makeRequest({ stream: 'my-stream', session: 'abc12345' }),
    )
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Internal server error')
  })
})
