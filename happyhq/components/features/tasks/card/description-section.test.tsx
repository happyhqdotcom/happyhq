import type { TaskContent } from '@/lib/fs/types'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = vi.hoisted(() => ({
  content: null as TaskContent | null,
}))

vi.mock('../hooks/use-task-swr', () => ({
  useTaskContentData: () => mockState.content,
  useTaskMutate: () => vi.fn(),
}))

vi.mock('@/stores/taskStore', () => ({
  useTaskStore: (selector: (s: { taskSlug: string }) => unknown) =>
    selector({ taskSlug: 'task-1' }),
}))

vi.mock('@/lib/actions', () => ({
  writeTaskDescription: vi.fn().mockResolvedValue(undefined),
}))

import { DescriptionSection } from './description-section'

const baseContent: TaskContent = {
  description: '',
  inputs: [],
  outputs: [],
  working: [],
  plan: null,
  run: null,
} as unknown as TaskContent

beforeEach(() => {
  mockState.content = { ...baseContent, description: '' }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('DescriptionSection — cursor stability while typing', () => {
  it('preserves user input when server data refreshes mid-edit', () => {
    const { rerender } = render(<DescriptionSection />)
    const textarea = screen.getByPlaceholderText(
      'Add context...',
    ) as HTMLTextAreaElement

    // Simulates a fast typist: user types past what the debounced save has flushed.
    fireEvent.change(textarea, { target: { value: 'hello world' } })
    expect(textarea.value).toBe('hello world')

    // Server-side save lands and SWR refetches with the older snapshot
    // (the value that was sent before the user kept typing).
    mockState.content = { ...baseContent, description: 'hello' }
    rerender(<DescriptionSection />)

    // The user's in-flight edit must not be clobbered by the stale server value.
    expect(textarea.value).toBe('hello world')
  })

  it('initializes from server description when content arrives after first render', () => {
    mockState.content = null
    const { rerender } = render(<DescriptionSection />)
    const textarea = screen.getByPlaceholderText(
      'Add context...',
    ) as HTMLTextAreaElement
    expect(textarea.value).toBe('')

    mockState.content = { ...baseContent, description: 'loaded from server' }
    rerender(<DescriptionSection />)

    expect(textarea.value).toBe('loaded from server')
  })
})
