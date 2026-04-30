import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import {
  encodeCrockford,
  formatMinutes,
  formatSlug,
  generateTaskSlug,
  toSlug,
} from './format'

describe('formatSlug', () => {
  it('converts kebab-case to title case', () => {
    expect(formatSlug('passion-fruit')).toBe('Passion Fruit')
  })

  it('capitalizes a single word', () => {
    expect(formatSlug('hello')).toBe('Hello')
  })

  it('handles multiple hyphens', () => {
    expect(formatSlug('my-long-slug-name')).toBe('My Long Slug Name')
  })

  it('returns empty string for empty input', () => {
    expect(formatSlug('')).toBe('')
  })
})

describe('toSlug', () => {
  it('converts spaces to hyphens', () => {
    expect(toSlug('Email Intros')).toBe('email-intros')
  })

  it('strips leading and trailing hyphens', () => {
    expect(toSlug('--hello--')).toBe('hello')
  })

  it('collapses consecutive hyphens', () => {
    expect(toSlug('a---b')).toBe('a-b')
  })

  it('strips special characters', () => {
    expect(toSlug('Hello, World!')).toBe('hello-world')
  })

  it('trims whitespace', () => {
    expect(toSlug('  hello  ')).toBe('hello')
  })

  it('returns empty string for garbage input', () => {
    expect(toSlug('---')).toBe('')
  })

  it('returns empty string for empty input', () => {
    expect(toSlug('')).toBe('')
  })

  it('passes through a valid slug unchanged', () => {
    expect(toSlug('email-intros')).toBe('email-intros')
  })

  it('roundtrips with formatSlug', () => {
    expect(toSlug(formatSlug('email-intros'))).toBe('email-intros')
  })
})

const CROCKFORD_RE = /^[0-9a-hjkmnp-tv-z]+$/

describe('generateTaskSlug', () => {
  it('produces a slug with kebab title prefix and 9-char suffix', () => {
    const slug = generateTaskSlug('Email Intros')
    const parts = slug.split('-')
    // "email-intros-{9chars}" → at least 3 parts
    expect(parts.length).toBeGreaterThanOrEqual(3)
    expect(slug).toMatch(/^email-intros-/)
    const suffix = slug.slice('email-intros-'.length)
    expect(suffix).toHaveLength(9)
  })

  it('suffix uses only Crockford Base32 characters', () => {
    const slug = generateTaskSlug('Test Task')
    const suffix = slug.slice('test-task-'.length)
    expect(suffix).toMatch(CROCKFORD_RE)
  })

  it('different calls produce different suffixes', () => {
    const slugs = new Set(
      Array.from({ length: 10 }, () => generateTaskSlug('Same Title')),
    )
    // Random component means we expect at least some variation
    // (timestamp component is the same within a second, but random differs)
    expect(slugs.size).toBeGreaterThan(1)
  })

  it('title portion is kebab-cased via toSlug()', () => {
    const slug = generateTaskSlug('  Hello, World!  ')
    expect(slug).toMatch(/^hello-world-/)
  })

  it('works with empty title (suffix only)', () => {
    const slug = generateTaskSlug('')
    expect(slug).toHaveLength(9)
    expect(slug).toMatch(CROCKFORD_RE)
  })

  it('works with special characters in title', () => {
    const slug = generateTaskSlug('Q&A — Draft #3')
    expect(slug).toMatch(/^q-a-draft-3-/)
    const fullSuffix = slug.slice('q-a-draft-3-'.length)
    expect(fullSuffix).toHaveLength(9)
    expect(fullSuffix).toMatch(CROCKFORD_RE)
  })
})

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

describe('property-based: toSlug', () => {
  it('is idempotent — toSlug(toSlug(x)) === toSlug(x)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(toSlug(toSlug(input))).toBe(toSlug(input))
      }),
    )
  })

  it('output is always URL-safe', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(toSlug(input)).toMatch(/^[a-z0-9-]*$/)
      }),
    )
  })

  it('never produces leading or trailing hyphens', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const slug = toSlug(input)
        if (slug.length > 0) {
          expect(slug[0]).not.toBe('-')
          expect(slug[slug.length - 1]).not.toBe('-')
        }
      }),
    )
  })

  it('never produces consecutive hyphens', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        expect(toSlug(input)).not.toMatch(/--/)
      }),
    )
  })
})

describe('property-based: formatSlug round-trip', () => {
  it('toSlug(formatSlug(toSlug(x))) === toSlug(x)', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const slug = toSlug(input)
        expect(toSlug(formatSlug(slug))).toBe(slug)
      }),
    )
  })
})

describe('property-based: encodeCrockford', () => {
  it('output is always exactly `width` characters', () => {
    fc.assert(
      fc.property(
        fc.nat(2_000_000_000),
        fc.integer({ min: 1, max: 10 }),
        (value, width) => {
          expect(encodeCrockford(value, width)).toHaveLength(width)
        },
      ),
    )
  })

  it('output uses only Crockford Base32 charset', () => {
    fc.assert(
      fc.property(fc.nat(2_000_000_000), (value) => {
        expect(encodeCrockford(value, 7)).toMatch(CROCKFORD_RE)
      }),
    )
  })

  it('is monotonic — a < b implies encodeCrockford(a) <= encodeCrockford(b)', () => {
    fc.assert(
      fc.property(fc.nat(2_000_000_000), fc.nat(2_000_000_000), (a, b) => {
        if (a < b) {
          expect(encodeCrockford(a, 7) <= encodeCrockford(b, 7)).toBe(true)
        }
      }),
    )
  })
})

describe('property-based: generateTaskSlug', () => {
  it('suffix is always exactly 9 valid Crockford chars', () => {
    fc.assert(
      fc.property(fc.string(), (title) => {
        const slug = generateTaskSlug(title)
        const prefix = toSlug(title)
        const suffix = prefix ? slug.slice(prefix.length + 1) : slug
        expect(suffix).toHaveLength(9)
        expect(suffix).toMatch(CROCKFORD_RE)
      }),
    )
  })

  it('prefix matches toSlug(title)', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }).filter((s) => toSlug(s).length > 0),
        (title) => {
          const slug = generateTaskSlug(title)
          const prefix = toSlug(title)
          expect(slug.startsWith(prefix + '-')).toBe(true)
        },
      ),
    )
  })
})

describe('formatMinutes', () => {
  it('rounds fractional minutes at the hour boundary correctly', () => {
    // Bug: Math.round on the remainder could produce "60m" or "1h 60m"
    // when the fractional part rounds up past 59.
    expect(formatMinutes(59.5)).toBe('1h')
    expect(formatMinutes(119.5)).toBe('2h')
    expect(formatMinutes(59.4)).toBe('59m')
    expect(formatMinutes(119.4)).toBe('1h 59m')
  })
})
