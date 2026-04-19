import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetcher, FetchError } from './swr'

describe('FetchError', () => {
  it('preserves the HTTP status code', () => {
    const error = new FetchError('Not Found', 404)
    expect(error.status).toBe(404)
    expect(error.message).toBe('Not Found')
  })

  it('is an instance of Error', () => {
    const error = new FetchError('Internal Server Error', 500)
    expect(error).toBeInstanceOf(Error)
  })
})

describe('fetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('returns parsed JSON on a successful response', async () => {
    const data = { name: 'test-stream', createdAt: '2024-01-01T00:00:00Z' }
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(data), { status: 200 }),
    )

    const result = await fetcher('/api/fs/streams')
    expect(result).toEqual(data)
  })

  it('throws FetchError with status 404 on a not-found response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        statusText: 'Not Found',
      }),
    )

    await expect(fetcher('/api/fs/file?path=missing.md')).rejects.toThrow(
      FetchError,
    )

    try {
      await fetcher('/api/fs/file?path=missing.md')
    } catch (error) {
      expect(error).toBeInstanceOf(FetchError)
      expect((error as FetchError).status).toBe(404)
    }
  })

  it('throws FetchError with status 500 on a server error response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        statusText: 'Internal Server Error',
      }),
    )

    try {
      await fetcher('/api/fs/streams')
    } catch (error) {
      expect(error).toBeInstanceOf(FetchError)
      expect((error as FetchError).status).toBe(500)
      expect((error as FetchError).message).toBe('Internal Server Error')
    }
  })
})
