import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  log: vi.fn(),
}))

vi.mock('@/lib/log.server', () => ({
  log: mocks.log,
}))

import { POST } from './route'

beforeEach(() => {
  mocks.log.mockClear()
})

function makeRequest(body: unknown) {
  return new Request('http://localhost/api/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('POST /api/log', () => {
  it('logs a client event with data', async () => {
    const res = await POST(
      makeRequest({
        event: 'client.error',
        data: { message: 'something broke', source: 'app.tsx' },
      }),
    )

    expect(res.status).toBe(204)
    expect(mocks.log).toHaveBeenCalledWith('client.error', {
      message: 'something broke',
      source: 'app.tsx',
    })
  })

  it('prepends client. prefix if missing', async () => {
    const res = await POST(
      makeRequest({ event: 'error', data: { message: 'test' } }),
    )

    expect(res.status).toBe(204)
    expect(mocks.log).toHaveBeenCalledWith('client.error', { message: 'test' })
  })

  it('does not double-prefix client. events', async () => {
    await POST(makeRequest({ event: 'client.fetch.error' }))

    expect(mocks.log).toHaveBeenCalledWith('client.fetch.error', {})
  })

  it('returns 204 for missing event field', async () => {
    const res = await POST(makeRequest({ data: { foo: 'bar' } }))

    expect(res.status).toBe(204)
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('returns 204 for non-object body', async () => {
    const res = await POST(makeRequest('not json'))

    expect(res.status).toBe(204)
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('returns 204 for null body', async () => {
    const res = await POST(makeRequest(null))

    expect(res.status).toBe(204)
    expect(mocks.log).not.toHaveBeenCalled()
  })

  it('truncates long stack traces', async () => {
    const longStack = 'x'.repeat(10_000)
    await POST(
      makeRequest({
        event: 'client.error',
        data: { stack: longStack },
      }),
    )

    const data = mocks.log.mock.calls[0][1] as { stack: string }
    expect(data.stack.length).toBeLessThan(6_000)
    expect(data.stack).toContain('…[truncated]')
  })

  it('returns 204 even when log() throws', async () => {
    mocks.log.mockImplementationOnce(() => {
      throw new Error('disk full')
    })

    const res = await POST(
      makeRequest({ event: 'client.error', data: { message: 'test' } }),
    )

    expect(res.status).toBe(204)
  })
})
