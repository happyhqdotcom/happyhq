import { describe, expect, it } from 'vitest'

import { GET } from './route'

describe('GET /api/health', () => {
  it('returns 200 with { ok: true }', async () => {
    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ ok: true })
  })
})
