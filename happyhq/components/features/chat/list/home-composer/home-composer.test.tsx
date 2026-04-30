import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock browser APIs missing from jsdom
Element.prototype.scrollIntoView = vi.fn()
class MockResizeObserver {
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as any
class MockIntersectionObserver {
  constructor(
    _cb: IntersectionObserverCallback,
    _opts?: IntersectionObserverInit,
  ) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.IntersectionObserver = MockIntersectionObserver as any

const mockPush = vi.hoisted(() => vi.fn())
const mockCreateChatSession = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
)
const mockToastError = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/actions', () => ({
  createChatSession: mockCreateChatSession,
  uploadFile: vi.fn(),
}))

vi.mock('@/stores/streamsStore', () => ({
  useStreams: vi.fn(() => []),
  useStreamsLoading: vi.fn(() => false),
}))

vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { error: mockToastError }),
}))

import { useStreams, useStreamsLoading } from '@/stores/streamsStore'

// UUID v4 pattern — crypto.randomUUID() is used as the sessionId
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

describe('HomeComposer', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockPush.mockClear()
    mockCreateChatSession.mockClear().mockResolvedValue(undefined)
    mockToastError.mockClear()
    vi.mocked(useStreamsLoading).mockReturnValue(false)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  async function renderAndSubmit(message = 'Build a dashboard') {
    const { HomeComposer } = await import('./home-composer')
    render(<HomeComposer />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: message } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
  }

  describe('general mode (no stream selected)', () => {
    it('creates a root-level chat session on submit', async () => {
      await renderAndSubmit()

      await waitFor(() => {
        expect(mockCreateChatSession).toHaveBeenCalledTimes(1)
      })

      // First arg is a UUID sessionId, second is null (no stream)
      expect(mockCreateChatSession).toHaveBeenCalledWith(
        expect.stringMatching(UUID_RE),
        null,
      )
    })

    it('stores the pending message with null slug', async () => {
      await renderAndSubmit('Hello world')

      await waitFor(() => {
        const raw = sessionStorage.getItem('q-home-message')
        expect(raw).not.toBeNull()
        const parsed = JSON.parse(raw!)
        expect(parsed.message).toBe('Hello world')
        expect(parsed.slug).toBeNull()
        expect(parsed.sessionId).toMatch(UUID_RE)
      })
    })

    it('navigates to /chat/{sessionId}', async () => {
      await renderAndSubmit()

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledTimes(1)
      })

      const sessionId = mockCreateChatSession.mock.calls[0][0] as string
      expect(mockPush).toHaveBeenCalledWith('/chat/' + sessionId)
    })
  })

  describe('stream-scoped mode (stream selected)', () => {
    const TEST_STREAMS = [
      {
        name: 'client-reports',
        title: 'Client Reports',
        createdAt: '2026-01-01',
      },
    ]

    it('creates a chat session in the selected stream', async () => {
      vi.mocked(useStreams).mockReturnValue(TEST_STREAMS as any)

      const { HomeComposer } = await import('./home-composer')
      render(<HomeComposer />)

      // Select a stream from the dropdown
      const dropdownButton = screen.getByText(/Work on/i).closest('button')!
      fireEvent.click(dropdownButton)
      const streamOption = await screen.findByText('Client Reports')
      fireEvent.click(streamOption)

      // Submit a message
      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'New task' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        expect(mockCreateChatSession).toHaveBeenCalledWith(
          expect.stringMatching(UUID_RE),
          'client-reports',
        )
      })

      const sessionId = mockCreateChatSession.mock.calls[0][0] as string
      expect(mockPush).toHaveBeenCalledWith('/chat/' + sessionId)
    })

    it('stores the pending message with the stream slug', async () => {
      vi.mocked(useStreams).mockReturnValue(TEST_STREAMS as any)

      const { HomeComposer } = await import('./home-composer')
      render(<HomeComposer />)

      const dropdownButton = screen.getByText(/Work on/i).closest('button')!
      fireEvent.click(dropdownButton)
      const streamOption = await screen.findByText('Client Reports')
      fireEvent.click(streamOption)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Learn this' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      await waitFor(() => {
        const raw = sessionStorage.getItem('q-home-message')
        expect(raw).not.toBeNull()
        const parsed = JSON.parse(raw!)
        expect(parsed.slug).toBe('client-reports')
        expect(parsed.message).toBe('Learn this')
      })
    })
  })

  it('disables the composer while streams are loading', async () => {
    vi.mocked(useStreamsLoading).mockReturnValue(true)

    const { HomeComposer } = await import('./home-composer')
    render(<HomeComposer />)

    const textarea = screen.getByRole('textbox')
    expect((textarea as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('shows a toast error and does not navigate on failure', async () => {
    mockCreateChatSession.mockRejectedValue(new Error('Network error'))

    await renderAndSubmit()

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith('Failed to create chat', {
        duration: Infinity,
      })
    })
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('re-enables the composer after an error', async () => {
    mockCreateChatSession.mockRejectedValue(new Error('fail'))

    const { HomeComposer } = await import('./home-composer')
    render(<HomeComposer />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: 'test' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalled()
    })

    // Composer should be re-enabled after error
    expect((textarea as HTMLTextAreaElement).disabled).toBe(false)
  })
})
