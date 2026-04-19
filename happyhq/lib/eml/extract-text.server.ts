import { simpleParser } from 'mailparser'

import type { EmailMetadata } from './types'
export type { EmailMetadata } from './types'

export interface EmlAttachment {
  filename: string
  content: Buffer
}

export interface EmlExtraction {
  metadata: EmailMetadata
  attachments: EmlAttachment[]
}

/** Extract <a href> links from HTML, filtering out junk (mailto, anchors, tracking). */
export function extractLinks(
  html: string,
): Array<{ url: string; text: string }> {
  const seen = new Set<string>()
  const links: Array<{ url: string; text: string }> = []
  const re =
    /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>|<a\s[^>]*href='([^']+)'[^>]*>([\s\S]*?)<\/a>/gi
  let match
  while ((match = re.exec(html)) !== null) {
    const url = (match[1] ?? match[3]).replace(/&amp;/g, '&').trim()
    const text = (match[2] ?? match[4])
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (
      !url ||
      url === '#' ||
      url.startsWith('mailto:') ||
      url.startsWith('tel:') ||
      seen.has(url)
    )
      continue
    seen.add(url)
    links.push({ url, text })
  }
  return links
}

/** Strip HTML tags, scripts, styles, entities, and URLs from an HTML string. */
export function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[^;]+;/g, ' ')
    .replace(/https?:\/\/[^\s]+/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Strip Outlook signature noise from plain text: icon placeholders, tel:/mailto: refs, CID refs. Unwrap angle-bracket URLs to readable form. */
function stripSignatureNoise(text: string): string {
  return text
    .replace(/\[cid:[^\]]+\]/g, '') // [cid:image001.jpg@...]
    .replace(/\[(mobilePhone|emailAddress|website|Image|linkedin)\]/gi, '') // Outlook vCard icon alt text
    .replace(/<tel:[^>]+>/g, '') // <tel:+44...>
    .replace(/<mailto:[^>]+>/g, '') // <mailto:foo@bar.com>
    .replace(/(.+?)<(https?:\/\/[^>]+)>/g, '[$1]($2)') // text<URL> → [text](URL) markdown link
    .replace(/<(https?:\/\/[^>]+)>/g, '$1') // bare <URL> → plain URL
    .replace(/^\s+$/gm, '') // trim whitespace-only lines (left by stripped placeholders)
}

/** Truncate at common email footer indicators. */
function cleanEmailContent(text: string): string {
  if (!text || text.trim().length === 0) return ''

  const footerKeywords = [
    'copyright',
    'unsubscribe',
    'registered office',
    'privacy policy',
    'address book',
    'vat no',
    'all rights reserved',
    'click here to',
  ]

  let mainContent = text
  for (const keyword of footerKeywords) {
    const index = text.toLowerCase().indexOf(keyword)
    if (index > 100) {
      mainContent = text.substring(0, index).trim()
      break
    }
  }

  return stripSignatureNoise(mainContent)
    .replace(/view in browser/gi, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Extract readable body text from a parsed email. Prefers text, falls back to stripped HTML. */
function extractBody(
  text: string | undefined,
  html: string | false | undefined,
): string {
  if (text && text.trim().length > 50) {
    return cleanEmailContent(text)
  }
  if (html) {
    return cleanEmailContent(stripHtml(html))
  }
  return cleanEmailContent(text || '')
}

function formatAddress(addr: { name?: string; address?: string }): string {
  if (addr.name && addr.address) return `${addr.name} <${addr.address}>`
  return addr.address || addr.name || ''
}

/**
 * Parse a raw .eml buffer and return structured metadata (written as
 * email.json — the agent-readable extracted form) plus file attachments.
 */
export async function extractContentFromEml(
  emlBuffer: Buffer,
): Promise<EmlExtraction> {
  const parsed = await simpleParser(emlBuffer)

  const body = extractBody(parsed.text, parsed.html)
  const links = parsed.html ? extractLinks(String(parsed.html)) : []

  // --- Collect attachments ---
  // Include inline images if they're substantial content (> 1KB).
  // Small inline images are almost always email signature logos / icons.
  const attachments: EmlAttachment[] = []
  const seenNames = new Set<string>()

  if (parsed.attachments?.length) {
    for (let i = 0; i < parsed.attachments.length; i++) {
      const att = parsed.attachments[i]
      if (att.contentDisposition === 'inline' && att.cid && att.size < 102_400)
        continue

      let filename = att.filename || `attachment-${i + 1}`
      if (seenNames.has(filename)) {
        const ext = filename.lastIndexOf('.')
        const base = ext > 0 ? filename.slice(0, ext) : filename
        const suffix = ext > 0 ? filename.slice(ext) : ''
        let counter = 2
        while (seenNames.has(`${base}-${counter}${suffix}`)) counter++
        filename = `${base}-${counter}${suffix}`
      }
      seenNames.add(filename)
      attachments.push({ filename, content: att.content })
    }
  }

  // --- Build structured metadata (serves both UI viewer and agent) ---
  const fromStr = parsed.from?.value?.length
    ? parsed.from.value.map(formatAddress).join(', ')
    : ''
  const toAddrs = parsed.to
    ? (Array.isArray(parsed.to) ? parsed.to : [parsed.to])
        .flatMap((t) => t.value.map(formatAddress))
        .join(', ')
    : ''
  const ccAddrs = parsed.cc
    ? (Array.isArray(parsed.cc) ? parsed.cc : [parsed.cc])
        .flatMap((c) => c.value.map(formatAddress))
        .join(', ')
    : undefined

  const metadata: EmailMetadata = {
    subject: parsed.subject || '(no subject)',
    from: fromStr,
    to: toAddrs,
    ...(ccAddrs ? { cc: ccAddrs } : {}),
    ...(parsed.date ? { date: parsed.date.toISOString() } : {}),
    body,
    attachments: attachments.map((a) => a.filename),
    ...(links.length > 0 ? { links } : {}),
  }

  return { metadata, attachments }
}
