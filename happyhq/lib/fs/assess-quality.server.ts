/**
 * Input quality assessment.
 *
 * Generic quality signals for file inputs — the first assessor is text
 * quality (catches garbage PDF extraction), but the same shape works for
 * future checks (file size, format validity, etc.).
 */

export type InputQuality = 'good' | 'poor' | 'empty'

export interface QualityAssessment {
  quality: InputQuality
}

/**
 * Assess the quality of extracted text content.
 *
 * Heuristics (first match wins):
 * 1. Empty — no usable content at all
 * 2. Too short — likely a scanned document that yielded almost nothing
 * 3. Dominant character — one char dominates (e.g. macron-filled garbage from pdfium)
 * 4. Low printable ratio — mostly non-printable / encoding artifacts
 */
export function assessTextQuality(text: string): QualityAssessment {
  const trimmed = text.trim()

  if (trimmed.length === 0) {
    return { quality: 'empty' }
  }

  if (trimmed.length < 50) {
    return {
      quality: 'poor',
    }
  }

  // Strip whitespace for character-level analysis
  const nonWs = trimmed.replace(/\s/g, '')
  if (nonWs.length === 0) {
    return { quality: 'empty' }
  }

  // Check for a single dominant character (> 50% of non-whitespace).
  // Catches the macron-character garbage from scanned PDF extraction.
  const freq = new Map<string, number>()
  for (const ch of nonWs) {
    freq.set(ch, (freq.get(ch) ?? 0) + 1)
  }
  for (const count of freq.values()) {
    if (count / nonWs.length > 0.5) {
      return {
        quality: 'poor',
      }
    }
  }

  // Check that enough characters are in printable Unicode ranges.
  // Covers Latin, CJK, Arabic, Cyrillic, Devanagari, and common symbols.
  let printable = 0
  for (const ch of nonWs) {
    const cp = ch.codePointAt(0)!
    if (isPrintableCodePoint(cp)) printable++
  }
  if (printable / nonWs.length < 0.7) {
    return {
      quality: 'poor',
    }
  }

  return { quality: 'good' }
}

/**
 * Returns true if the code point falls in a commonly-used printable range.
 * Intentionally broad — covers major scripts and symbols without trying
 * to enumerate every Unicode block.
 */
function isPrintableCodePoint(cp: number): boolean {
  return (
    (cp >= 0x0020 && cp <= 0x007e) || // Basic Latin (ASCII printable)
    (cp >= 0x00a0 && cp <= 0x024f) || // Latin Extended (accented chars, etc.)
    (cp >= 0x0370 && cp <= 0x03ff) || // Greek and Coptic
    (cp >= 0x0400 && cp <= 0x04ff) || // Cyrillic
    (cp >= 0x0530 && cp <= 0x058f) || // Armenian
    (cp >= 0x0590 && cp <= 0x05ff) || // Hebrew
    (cp >= 0x0600 && cp <= 0x06ff) || // Arabic
    (cp >= 0x0900 && cp <= 0x097f) || // Devanagari
    (cp >= 0x0980 && cp <= 0x09ff) || // Bengali
    (cp >= 0x0a00 && cp <= 0x0a7f) || // Gurmukhi (Punjabi)
    (cp >= 0x0a80 && cp <= 0x0aff) || // Gujarati
    (cp >= 0x0b00 && cp <= 0x0b7f) || // Oriya
    (cp >= 0x0b80 && cp <= 0x0bff) || // Tamil
    (cp >= 0x0c00 && cp <= 0x0c7f) || // Telugu
    (cp >= 0x0c80 && cp <= 0x0cff) || // Kannada
    (cp >= 0x0d00 && cp <= 0x0d7f) || // Malayalam
    (cp >= 0x0e00 && cp <= 0x0e7f) || // Thai
    (cp >= 0x0e80 && cp <= 0x0eff) || // Lao
    (cp >= 0x1000 && cp <= 0x109f) || // Myanmar
    (cp >= 0x10a0 && cp <= 0x10ff) || // Georgian
    (cp >= 0x1100 && cp <= 0x11ff) || // Hangul Jamo
    (cp >= 0x2000 && cp <= 0x206f) || // General Punctuation
    (cp >= 0x2070 && cp <= 0x209f) || // Superscripts and Subscripts
    (cp >= 0x20a0 && cp <= 0x20cf) || // Currency Symbols
    (cp >= 0x2100 && cp <= 0x214f) || // Letterlike Symbols
    (cp >= 0x2190 && cp <= 0x21ff) || // Arrows
    (cp >= 0x2200 && cp <= 0x22ff) || // Mathematical Operators
    (cp >= 0x2500 && cp <= 0x257f) || // Box Drawing
    (cp >= 0x2e80 && cp <= 0x9fff) || // CJK (radicals through unified ideographs)
    (cp >= 0xac00 && cp <= 0xd7af) || // Hangul Syllables
    (cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility Ideographs
    (cp >= 0xfe30 && cp <= 0xfe4f) || // CJK Compatibility Forms
    (cp >= 0xff00 && cp <= 0xffef) || // Halfwidth and Fullwidth Forms
    (cp >= 0x10000 && cp <= 0x1007f) || // Linear B Syllabary (historic but printable)
    (cp >= 0x1f300 && cp <= 0x1f9ff) || // Misc Symbols and Pictographs / Emoticons
    (cp >= 0x20000 && cp <= 0x2a6df) // CJK Unified Ideographs Extension B
  )
}
