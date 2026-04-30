import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLookup } = vi.hoisted(() => ({
  mockLookup: vi.fn(),
}))

vi.mock('dns/promises', () => ({
  default: { lookup: mockLookup },
  lookup: mockLookup,
}))

import { unfurlUrl } from './unfurl'

const PUBLIC_IP = { address: '93.184.216.34', family: 4 }
const PRIVATE_IP = { address: '127.0.0.1', family: 4 }

function htmlResponse(html: string) {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
}

function redirectResponse(location: string) {
  return new Response(null, {
    status: 302,
    headers: { location },
  })
}

beforeEach(() => {
  mockLookup.mockReset()
  // Default: every hostname is public unless a test overrides it.
  mockLookup.mockResolvedValue(PUBLIC_IP)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('unfurlUrl: SSRF gate', () => {
  it.each([
    ['file:///etc/passwd'],
    ['ftp://example.com/x'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>'],
  ])('rejects non-http(s) scheme %s without fetching', async (input) => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl(input)

    expect(result.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects URLs with embedded credentials', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl('http://user:pass@example.com/')

    expect(result.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects hostnames that resolve to a private/loopback IP', async () => {
    mockLookup.mockResolvedValue(PRIVATE_IP)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl('http://internal.local/')

    expect(result.success).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('rejects a redirect that lands on a non-http(s) scheme', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('file:///etc/passwd'))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl('https://example.com/')

    expect(result.success).toBe(false)
    // First hop fetched, redirect target rejected before second fetch.
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects a redirect chain ending at a private IP', async () => {
    mockLookup.mockImplementation(async (host: string) =>
      host === 'evil.example' ? PRIVATE_IP : PUBLIC_IP,
    )
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://evil.example/'))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl('https://example.com/')

    expect(result.success).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('rejects a redirect that introduces credentials', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce(redirectResponse('https://user:pass@example.com/'))
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl('https://example.com/')

    expect(result.success).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('accepts a normal https URL and returns parsed metadata', async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        htmlResponse('<html><head><title>Hello</title></head></html>'),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl('https://example.com/')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.title).toBe('Hello')
    }
  })
})

describe('unfurlUrl: entity decoding', () => {
  it('decodes HTML entities in a single pass', async () => {
    // Input has `&amp;lt;` — that's a literal `&lt;` after one decode pass.
    // A naive sequential `.replace(&amp;).replace(&lt;)` would over-decode it
    // to `<`, opening an XSS path for downstream renderers.
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        htmlResponse(
          '<html><head><title>foo &amp;lt;bar&amp;gt; baz</title></head></html>',
        ),
      )
    vi.stubGlobal('fetch', fetchSpy)

    const result = await unfurlUrl('https://example.com/')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.title).toBe('foo &lt;bar&gt; baz')
    }
  })
})
