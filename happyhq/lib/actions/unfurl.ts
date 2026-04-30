'use server'

import { lookup } from 'dns/promises'

export interface UnfurlResult {
  success: true
  title: string | null
  description: string | null
  image: string | null
  favicon: string | null
}

export interface UnfurlError {
  success: false
  error: string
}

export type UnfurlResponse = UnfurlResult | UnfurlError

// Regex patterns for metadata extraction
const TITLE_REGEX = /<title[^>]*>([^<]+)<\/title>/i
const OG_TITLE_REGEX =
  /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
const OG_TITLE_REGEX_ALT =
  /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i

const DESCRIPTION_REGEX =
  /<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i
const DESCRIPTION_REGEX_ALT =
  /<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i
const OG_DESCRIPTION_REGEX =
  /<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i
const OG_DESCRIPTION_REGEX_ALT =
  /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:description["']/i

const OG_IMAGE_REGEX =
  /<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i
const OG_IMAGE_REGEX_ALT =
  /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i

const FAVICON_REGEX = /<link[^>]*rel=["']icon["'][^>]*href=["']([^"']+)["']/i
const FAVICON_REGEX_ALT =
  /<link[^>]*href=["']([^"']+)["'][^>]*rel=["']icon["']/i
const SHORTCUT_ICON_REGEX =
  /<link[^>]*rel=["']shortcut icon["'][^>]*href=["']([^"']+)["']/i

/**
 * SSRF protection: check if an IP address is private/internal
 */
function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number)
  return (
    parts[0] === 127 ||
    parts[0] === 10 ||
    parts[0] === 0 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
  )
}

async function isPrivateIp(hostname: string): Promise<boolean> {
  try {
    const { address, family } = await lookup(hostname)

    if (family === 4) {
      return isPrivateIpv4(address)
    } else {
      const lower = address.toLowerCase()

      if (lower.startsWith('::ffff:')) {
        const ipv4Part = lower.slice(7)
        return isPrivateIpv4(ipv4Part)
      }

      const firstSegment = parseInt(lower.split(':')[0], 16)
      const isLinkLocal = firstSegment >= 0xfe80 && firstSegment <= 0xfebf

      return (
        lower === '::1' ||
        lower.startsWith('fc') ||
        lower.startsWith('fd') ||
        isLinkLocal
      )
    }
  } catch {
    return true
  }
}

/**
 * Parse user-supplied input into a URL, defaulting to https:// when no scheme
 * is present. Any value that can't be coerced into a valid URL returns null.
 */
function parseInputUrl(input: string): URL | null {
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
  const candidate = hasScheme ? input : `https://${input}`
  try {
    return new URL(candidate)
  } catch {
    return null
  }
}

/**
 * SSRF gate: only http(s), no embedded credentials, hostname must not resolve
 * to a private/loopback range. Applied to the initial URL and every redirect
 * target so a 302 can't slip past the initial check.
 */
async function validateUrl(parsed: URL | null): Promise<URL | null> {
  if (!parsed) return null
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (parsed.username || parsed.password) return null
  if (await isPrivateIp(parsed.hostname)) return null
  return parsed
}

/**
 * Resolve a potentially relative URL to an absolute URL
 */
function resolveUrl(href: string, baseUrl: string): string {
  if (!href) return ''
  if (href.startsWith('http://') || href.startsWith('https://')) return href
  if (href.startsWith('//')) return `https:${href}`

  try {
    return new URL(href, baseUrl).href
  } catch {
    return ''
  }
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
}

/**
 * Decode common HTML entities in a single pass so already-decoded entities in
 * the input (e.g. `&amp;lt;` meaning a literal `&lt;`) are not re-decoded.
 */
function decodeHtmlEntities(str: string): string {
  return str.replace(
    /&(?:amp|lt|gt|quot|#39|nbsp);/g,
    (match) => HTML_ENTITIES[match] ?? match,
  )
}

/**
 * Fetch and extract metadata from a URL (title, description, image, favicon)
 */
export async function unfurlUrl(url: string): Promise<UnfurlResponse> {
  try {
    let current = await validateUrl(parseInputUrl(url))
    if (!current) {
      return { success: false, error: 'Invalid URL' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    // Follow redirects manually so the same SSRF/scheme/credential gate
    // applies to every hop, not just the initial URL.
    const maxRedirects = 5
    let response: Response | undefined

    for (let i = 0; i <= maxRedirects; i++) {
      response = await fetch(current.href, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; HappyHQ/1.0; +https://happyhq.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })

      if (response.status < 300 || response.status >= 400) break

      const location = response.headers.get('location')
      if (!location) break

      let redirectParsed: URL | null
      try {
        redirectParsed = new URL(location, current.href)
      } catch {
        return { success: false, error: 'Invalid URL' }
      }

      const next = await validateUrl(redirectParsed)
      if (!next) {
        return { success: false, error: 'Invalid URL' }
      }
      current = next
    }

    clearTimeout(timeout)

    if (!response) {
      return { success: false, error: 'Failed to fetch URL' }
    }

    if (!response.ok) {
      return { success: false, error: 'Failed to fetch URL' }
    }

    // Only read first 50KB to avoid huge pages
    const reader = response.body?.getReader()
    if (!reader) {
      return { success: false, error: 'Failed to read response' }
    }

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 50 * 1024

    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }

    reader.cancel()

    const title =
      html.match(OG_TITLE_REGEX)?.[1] ||
      html.match(OG_TITLE_REGEX_ALT)?.[1] ||
      html.match(TITLE_REGEX)?.[1] ||
      null

    const description =
      html.match(OG_DESCRIPTION_REGEX)?.[1] ||
      html.match(OG_DESCRIPTION_REGEX_ALT)?.[1] ||
      html.match(DESCRIPTION_REGEX)?.[1] ||
      html.match(DESCRIPTION_REGEX_ALT)?.[1] ||
      null

    const imageRaw =
      html.match(OG_IMAGE_REGEX)?.[1] || html.match(OG_IMAGE_REGEX_ALT)?.[1]
    const image = imageRaw ? resolveUrl(imageRaw, current.href) : null

    const faviconRaw =
      html.match(FAVICON_REGEX)?.[1] ||
      html.match(FAVICON_REGEX_ALT)?.[1] ||
      html.match(SHORTCUT_ICON_REGEX)?.[1]
    const favicon = faviconRaw
      ? resolveUrl(faviconRaw, current.href)
      : `https://www.google.com/s2/favicons?domain=${current.hostname}&sz=32`

    return {
      success: true,
      title: title ? decodeHtmlEntities(title) : null,
      description: description ? decodeHtmlEntities(description) : null,
      image,
      favicon,
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { success: false, error: 'Request timed out' }
    }
    return { success: false, error: 'Failed to unfurl URL' }
  }
}
