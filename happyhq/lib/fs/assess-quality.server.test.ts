import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { assessTextQuality } from './assess-quality.server'

describe('assessTextQuality', () => {
  // --- Empty ---

  it('returns empty for an empty string', () => {
    const result = assessTextQuality('')
    expect(result.quality).toBe('empty')
  })

  it('returns empty for whitespace-only', () => {
    const result = assessTextQuality('   \n\t\n   ')
    expect(result.quality).toBe('empty')
  })

  // --- Too short ---

  it('returns poor for very short text', () => {
    const result = assessTextQuality('Hello')
    expect(result.quality).toBe('poor')
  })

  it('returns poor for 49 characters', () => {
    const result = assessTextQuality('a'.repeat(49))
    // 49 chars but all same char → hits dominant char first
    expect(result.quality).toBe('poor')
  })

  // --- Dominant character (macron garbage) ---

  it('returns poor for macron-filled garbage (real pdfium failure)', () => {
    // Simulates the actual failure: 256 bytes of macron characters (U+0304)
    const macronGarbage = '\u0304'.repeat(256)
    const result = assessTextQuality(macronGarbage)
    expect(result.quality).toBe('poor')
  })

  it('returns poor when one character dominates > 50%', () => {
    // 60% dots, 40% real text
    const text = '.'.repeat(120) + 'Hello world this is real text here'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('poor')
  })

  it('returns good when no character dominates', () => {
    const text =
      'The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('good')
  })

  // --- Low printable ratio ---

  it('returns poor for mostly non-printable characters', () => {
    // Combine control characters with a bit of real text
    const controlChars = Array.from({ length: 200 }, (_, i) =>
      String.fromCodePoint((i % 30) + 1),
    ).join('')
    const text = controlChars + 'Some text here.'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('poor')
  })

  // --- Good quality ---

  it('returns good for normal English text', () => {
    const text =
      'This is a normal document with enough content to pass the minimum length threshold. It contains typical English prose with varied characters and punctuation.'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('good')
  })

  it('returns good for CJK text', () => {
    // Chinese text: "This is a normal Chinese document with sufficient content"
    const text =
      '这是一个正常的中文文档，包含足够的内容来通过最小长度阈值。它包含典型的中文散文，具有多种字符和标点符号。这里有更多的文字来确保我们超过五十个字符的限制。'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('good')
  })

  it('returns good for mixed-script text', () => {
    const text =
      'Hello world! Привет мир! مرحبا بالعالم! 你好世界！ This is a multilingual document with enough content.'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('good')
  })

  it('returns good for text with common special characters', () => {
    const text =
      'Revenue: $1,234,567.89 — up 15% from last quarter. Email: user@example.com. Path: /usr/local/bin. Ratio: 3:1.'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('good')
  })

  // --- Edge cases ---

  it('returns good for text at the 50-character boundary', () => {
    // 50 chars of varied content — should pass all checks
    const text = 'abcdefghijklmnopqrstuvwxyz ABCDEFGHIJKLMNOPQRSTUVW'
    const result = assessTextQuality(text)
    expect(result.quality).toBe('good')
  })

  it('handles text that is all whitespace except a few chars', () => {
    const text = '   \n\n   ab   \n\n   '
    const result = assessTextQuality(text)
    expect(result.quality).toBe('poor') // trimmed length < 50
  })
})

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

// Generate text from specific Unicode script ranges
function textFromRange(
  start: number,
  end: number,
  minLength = 60,
): fc.Arbitrary<string> {
  return fc
    .array(fc.integer({ min: start, max: end }), {
      minLength,
      maxLength: minLength + 40,
    })
    .map((cps) => cps.map((cp) => String.fromCodePoint(cp)).join(''))
}

describe('property-based: assessTextQuality', () => {
  it('never crashes on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const result = assessTextQuality(text)
        expect(['good', 'poor', 'empty']).toContain(result.quality)
      }),
    )
  })

  it('output is always one of the three valid quality values', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const { quality } = assessTextQuality(text)
        expect(
          quality === 'good' || quality === 'poor' || quality === 'empty',
        ).toBe(true)
      }),
    )
  })

  it('Latin text is always good quality', () => {
    fc.assert(
      fc.property(textFromRange(0x0041, 0x007a), (text) => {
        expect(assessTextQuality(text).quality).toBe('good')
      }),
    )
  })

  it('CJK text is always good quality', () => {
    fc.assert(
      fc.property(textFromRange(0x4e00, 0x9fff), (text) => {
        expect(assessTextQuality(text).quality).toBe('good')
      }),
    )
  })

  it('Bengali text is good quality', () => {
    // Bengali: 0x0980–0x09FF — ~300 million speakers
    fc.assert(
      fc.property(textFromRange(0x0985, 0x09b9), (text) => {
        expect(assessTextQuality(text).quality).toBe('good')
      }),
    )
  })

  it('Tamil text is good quality', () => {
    // Tamil: 0x0B80–0x0BFF — ~80 million speakers
    fc.assert(
      fc.property(textFromRange(0x0b85, 0x0bb9), (text) => {
        expect(assessTextQuality(text).quality).toBe('good')
      }),
    )
  })

  it('Georgian text is good quality', () => {
    // Georgian: 0x10A0–0x10FF — ~4 million speakers
    fc.assert(
      fc.property(textFromRange(0x10d0, 0x10f0), (text) => {
        expect(assessTextQuality(text).quality).toBe('good')
      }),
    )
  })

  it('Telugu text is good quality', () => {
    // Telugu: 0x0C00–0x0C7F — ~80 million speakers
    fc.assert(
      fc.property(textFromRange(0x0c15, 0x0c39), (text) => {
        expect(assessTextQuality(text).quality).toBe('good')
      }),
    )
  })
})
