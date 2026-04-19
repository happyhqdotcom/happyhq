import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { extractLinks, stripHtml } from './extract-text.server'

describe('property-based: stripHtml', () => {
  it('never leaves HTML tags in the output', () => {
    fc.assert(
      fc.property(fc.string(), (html) => {
        const result = stripHtml(html)
        // No opening tags should survive (self-closing or otherwise)
        expect(result).not.toMatch(/<[a-zA-Z][^>]*>/)
        // No closing tags should survive
        expect(result).not.toMatch(/<\/[a-zA-Z]+>/)
      }),
    )
  })

  it('never leaves script or style blocks in the output', () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        const html = `<script>alert("${content}")</script><p>safe</p><style>.x{color:${content}}</style>`
        const result = stripHtml(html)
        expect(result.toLowerCase()).not.toContain('<script')
        expect(result.toLowerCase()).not.toContain('<style')
        expect(result.toLowerCase()).not.toContain('alert(')
      }),
    )
  })

  it('never leaves &nbsp; entities in the output', () => {
    fc.assert(
      fc.property(fc.string(), (html) => {
        const result = stripHtml(html)
        expect(result).not.toContain('&nbsp;')
      }),
    )
  })

  it('never crashes on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (html) => {
        const result = stripHtml(html)
        expect(typeof result).toBe('string')
      }),
    )
  })
})

describe('property-based: extractLinks', () => {
  it('never returns mailto or tel links', () => {
    fc.assert(
      fc.property(fc.string(), (html) => {
        const links = extractLinks(html)
        for (const link of links) {
          expect(link.url).not.toMatch(/^mailto:/)
          expect(link.url).not.toMatch(/^tel:/)
          expect(link.url).not.toBe('#')
          expect(link.url).not.toBe('')
        }
      }),
    )
  })

  it('never returns duplicate URLs', () => {
    fc.assert(
      fc.property(fc.string(), (html) => {
        const links = extractLinks(html)
        const urls = links.map((l) => l.url)
        expect(new Set(urls).size).toBe(urls.length)
      }),
    )
  })

  it('round-trips: links embedded in HTML are extracted', () => {
    const url = fc.webUrl()
    const text = fc
      .string({ minLength: 1 })
      .filter((s) => !s.includes('<') && !s.includes('>'))

    fc.assert(
      fc.property(url, text, (href, linkText) => {
        const html = `<p>Hello</p><a href="${href}">${linkText}</a><p>World</p>`
        const links = extractLinks(html)

        // Should find at least one link (unless it's mailto/tel/#)
        if (
          !href.startsWith('mailto:') &&
          !href.startsWith('tel:') &&
          href !== '#' &&
          href.trim() !== ''
        ) {
          expect(links.length).toBeGreaterThanOrEqual(1)
          expect(links[0].url).toBe(href.replace(/&amp;/g, '&').trim())
        }
      }),
    )
  })

  it('never crashes on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (html) => {
        const links = extractLinks(html)
        expect(Array.isArray(links)).toBe(true)
      }),
    )
  })
})
