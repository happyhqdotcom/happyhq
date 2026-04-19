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

/**
 * Decode common HTML entities
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

/**
 * Fetch and extract metadata from a URL (title, description, image, favicon)
 */
export async function unfurlUrl(url: string): Promise<UnfurlResponse> {
  try {
    const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`
    const hostname = new URL(normalizedUrl).hostname

    if (await isPrivateIp(hostname)) {
      return { success: false, error: 'Invalid URL' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    // Follow redirects manually to validate each target against SSRF
    let currentUrl = normalizedUrl
    const maxRedirects = 5
    let response: Response | undefined

    for (let i = 0; i <= maxRedirects; i++) {
      response = await fetch(currentUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (compatible; HappyHQ/1.0; +https://happyhq.com)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })

      // Not a redirect — done
      if (response.status < 300 || response.status >= 400) break

      const location = response.headers.get('location')
      if (!location) break

      // Resolve relative redirect URLs
      const redirectUrl = new URL(location, currentUrl).href
      const redirectHostname = new URL(redirectUrl).hostname

      // SSRF check on redirect target
      if (await isPrivateIp(redirectHostname)) {
        return { success: false, error: 'Invalid URL' }
      }

      currentUrl = redirectUrl
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
    const image = imageRaw ? resolveUrl(imageRaw, normalizedUrl) : null

    const faviconRaw =
      html.match(FAVICON_REGEX)?.[1] ||
      html.match(FAVICON_REGEX_ALT)?.[1] ||
      html.match(SHORTCUT_ICON_REGEX)?.[1]
    const favicon = faviconRaw
      ? resolveUrl(faviconRaw, normalizedUrl)
      : `https://www.google.com/s2/favicons?domain=${new URL(normalizedUrl).hostname}&sz=32`

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
