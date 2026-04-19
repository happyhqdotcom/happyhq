import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockWriteTextFile } = vi.hoisted(() => ({
  mockWriteTextFile: vi.fn(),
}))

vi.mock('./write.server', () => ({
  writeTextFile: mockWriteTextFile,
}))

// Mock Date.now for deterministic timestamps
const MOCK_DATE = '2026-03-23T10:00:00.000Z'
vi.useFakeTimers()
vi.setSystemTime(new Date(MOCK_DATE))

import { persistWebInput } from './web-input.server'

describe('persistWebInput', () => {
  beforeEach(() => {
    mockWriteTextFile.mockReset()
  })

  it('persists content with heading-based page slug', async () => {
    const content = '# Planning Application 2023/0892\n\nSome content here.'
    const result = await persistWebInput(
      '/mock/task',
      'https://planning.wandsworth.gov.uk/app/2023-0892',
      content,
    )

    expect(result).toBe(
      'inputs/web/planning-wandsworth-gov-uk/planning-application-2023-0892.md',
    )
    expect(mockWriteTextFile).toHaveBeenCalledOnce()
    const [filePath, written] = mockWriteTextFile.mock.calls[0]
    expect(filePath).toBe(
      '/mock/task/inputs/web/planning-wandsworth-gov-uk/planning-application-2023-0892.md',
    )
    expect(written).toContain('---\n')
    expect(written).toContain(
      'url: https://planning.wandsworth.gov.uk/app/2023-0892',
    )
    expect(written).toContain(`fetched: ${MOCK_DATE}`)
    expect(written).toContain('# Planning Application 2023/0892')
  })

  it('falls back to URL path when no heading', async () => {
    const content = 'No heading here, just plain text.'
    const result = await persistWebInput(
      '/mock/task',
      'https://maps.app.goo.gl/57-lombard-road',
      content,
    )

    expect(result).toBe('inputs/web/maps-app-goo-gl/57-lombard-road.md')
  })

  it('falls back to "page" when URL path is empty', async () => {
    const content = 'No heading here.'
    const result = await persistWebInput(
      '/mock/task',
      'https://example.com/',
      content,
    )

    expect(result).toBe('inputs/web/example-com/page.md')
  })

  it('returns null for empty content', async () => {
    const result = await persistWebInput(
      '/mock/task',
      'https://example.com/page',
      '',
    )
    expect(result).toBeNull()
    expect(mockWriteTextFile).not.toHaveBeenCalled()
  })

  it('returns null for whitespace-only content', async () => {
    const result = await persistWebInput(
      '/mock/task',
      'https://example.com/page',
      '   \n  ',
    )
    expect(result).toBeNull()
  })

  it('returns null for empty URL', async () => {
    const result = await persistWebInput('/mock/task', '', 'Some content')
    expect(result).toBeNull()
  })

  it('returns null for invalid URL', async () => {
    const result = await persistWebInput(
      '/mock/task',
      'not-a-url',
      'Some content',
    )
    expect(result).toBeNull()
  })

  it('is idempotent — same URL and heading produce same path', async () => {
    const content = '# My Page\n\nContent v1'
    const result1 = await persistWebInput(
      '/mock/task',
      'https://example.com/foo',
      content,
    )
    const result2 = await persistWebInput(
      '/mock/task',
      'https://example.com/foo',
      content,
    )
    expect(result1).toBe(result2)
  })

  it('slugifies domain dots to hyphens', async () => {
    const result = await persistWebInput(
      '/mock/task',
      'https://sub.domain.example.co.uk/page',
      '# Title\n\nBody',
    )
    expect(result).toBe('inputs/web/sub-domain-example-co-uk/title.md')
  })

  it('handles heading with special characters', async () => {
    const result = await persistWebInput(
      '/mock/task',
      'https://example.com/page',
      '# Report — Q4 (2025) & Analysis!\n\nBody',
    )
    expect(result).toBe('inputs/web/example-com/report-q4-2025-analysis.md')
  })
})
