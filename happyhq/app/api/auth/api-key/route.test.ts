import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockStoreApiKey = vi.hoisted(() => vi.fn())

vi.mock('@/lib/agents/auth.server', () => ({
  storeApiKey: mockStoreApiKey,
}))

import { POST } from './route'

function makeRequest(body: string | object) {
  const isString = typeof body === 'string'
  return new Request('http://localhost/api/auth/api-key', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: isString ? body : JSON.stringify(body),
  })
}

describe('POST /api/auth/api-key', () => {
  beforeEach(() => {
    mockStoreApiKey.mockResolvedValue(undefined)
  })

  it('returns 400 for invalid JSON body', async () => {
    const res = await POST(
      new Request('http://localhost/api/auth/api-key', {
        method: 'POST',
        body: 'not json{{{',
      }),
    )
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('Invalid JSON')
  })

  it('returns 400 when key field is missing', async () => {
    const res = await POST(makeRequest({ notKey: 'value' }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('API key is required')
  })

  it('returns 400 when key is empty string', async () => {
    const res = await POST(makeRequest({ key: '' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when key is whitespace only', async () => {
    const res = await POST(makeRequest({ key: '   ' }))
    expect(res.status).toBe(400)
  })

  it('returns 400 when key is not a string', async () => {
    const res = await POST(makeRequest({ key: 12345 }))
    expect(res.status).toBe(400)
  })

  it('returns 200 with success for valid key', async () => {
    const res = await POST(makeRequest({ key: 'sk-ant-abc123' }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.success).toBe(true)
  })

  it('trims whitespace from key before storing', async () => {
    await POST(makeRequest({ key: '  sk-ant-abc123  ' }))
    expect(mockStoreApiKey).toHaveBeenCalledWith('sk-ant-abc123')
  })

  it('returns 500 with error message when storeApiKey throws', async () => {
    mockStoreApiKey.mockRejectedValue(new Error('Disk full'))
    const res = await POST(makeRequest({ key: 'sk-ant-abc123' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Disk full')
  })

  it('returns 500 with fallback message for non-Error throws', async () => {
    mockStoreApiKey.mockRejectedValue('string error')
    const res = await POST(makeRequest({ key: 'sk-ant-abc123' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.error).toBe('Failed to store key')
  })
})
