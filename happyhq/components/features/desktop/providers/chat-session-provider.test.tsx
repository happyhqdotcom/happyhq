import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// ── Mock setup (vi.hoisted so they're available in vi.mock factories) ───

const mockSendMessage = vi.hoisted(() => vi.fn())
const mockLoadHistory = vi.hoisted(() => vi.fn())
const mockSetState = vi.hoisted(() => vi.fn())
const mockSubscribe = vi.hoisted(() => vi.fn(() => vi.fn()))
const mockGetState = vi.hoisted(() =>
  vi.fn(() => ({
    sendMessage: mockSendMessage,
    loadHistory: mockLoadHistory,
    messages: [],
    isStreaming: false,
  })),
)

vi.mock('@/stores/chatStore', () => ({
  createChatStore: () => {
    // Minimal Zustand-like store mock
    const store = ((selector: (s: unknown) => unknown) =>
      selector(mockGetState())) as unknown
    ;(store as { getState: typeof mockGetState }).getState = mockGetState
    ;(store as { setState: typeof mockSetState }).setState = mockSetState
    ;(store as { subscribe: typeof mockSubscribe }).subscribe = mockSubscribe
    return store
  },
}))

// Desktop store — mock the global store and hooks
const mockSetSelectedStream = vi.hoisted(() => vi.fn())
const mockDesktopGetState = vi.hoisted(() =>
  vi.fn(() => ({
    setSelectedStream: mockSetSelectedStream,
  })),
)

const mockStreamSlug = vi.hoisted(() => ({ current: 'test-stream' }))
const mockChats = vi.hoisted(() => ({
  current: [] as Array<{ sessionId: string; lastActive: string }>,
}))

vi.mock('@/stores/desktopStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/desktopStore')>()
  return {
    ...actual,
    // Mock the global store with controlled getState
    useDesktopStore: Object.assign(() => null, {
      getState: mockDesktopGetState,
      setState: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    }),
    // Override hooks to return controlled values
    useStreamSlug: () => mockStreamSlug.current,
  }
})

vi.mock('./hooks/use-desktop-data', () => ({
  useChatsList: () => mockChats.current,
}))

vi.mock('@/stores/streamsStore', () => ({
  useStreams: () => [],
}))

// ── Import after mocks ──────────────────────────────────────────────────

import { ChatSessionProvider } from './chat-session-provider'

// ── Helpers ─────────────────────────────────────────────────────────────

function renderProvider(props?: { initialSessionId?: string }) {
  return render(
    <ChatSessionProvider initialSessionId={props?.initialSessionId}>
      <div data-testid="child" />
    </ChatSessionProvider>,
  )
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ChatSessionProvider', () => {
  beforeEach(() => {
    sessionStorage.clear()
    mockSendMessage.mockClear()
    mockLoadHistory.mockClear()
    mockSetState.mockClear()
    mockSubscribe.mockClear().mockReturnValue(vi.fn())
    mockGetState.mockClear().mockReturnValue({
      sendMessage: mockSendMessage,
      loadHistory: mockLoadHistory,
      messages: [],
      isStreaming: false,
    })
    mockSetSelectedStream.mockClear()
    mockDesktopGetState.mockClear().mockReturnValue({
      setSelectedStream: mockSetSelectedStream,
    })
    mockStreamSlug.current = 'test-stream'
    mockChats.current = []
  })

  describe('pending message handoff', () => {
    const pendingMessage = {
      slug: 'test-stream',
      sessionId: 'session-123',
      message: 'Build a dashboard',
    }

    it('consumes pending message and calls sendMessage with correct params', () => {
      sessionStorage.setItem('q-home-message', JSON.stringify(pendingMessage))

      renderProvider({ initialSessionId: 'session-123' })

      expect(mockSendMessage).toHaveBeenCalledWith({
        message: 'Build a dashboard',
        sessionId: 'session-123',
        streamSlug: 'test-stream',
      })
    })

    it('removes the sessionStorage key after consumption', () => {
      sessionStorage.setItem('q-home-message', JSON.stringify(pendingMessage))

      renderProvider({ initialSessionId: 'session-123' })

      expect(sessionStorage.getItem('q-home-message')).toBeNull()
    })

    it('ignores pending message when sessionId does not match', () => {
      sessionStorage.setItem('q-home-message', JSON.stringify(pendingMessage))

      renderProvider({ initialSessionId: 'other-session' })

      expect(mockSendMessage).not.toHaveBeenCalled()
      // Key must remain for the correct session to consume
      expect(sessionStorage.getItem('q-home-message')).not.toBeNull()
    })

    it('removes key and does not crash on malformed JSON', () => {
      sessionStorage.setItem('q-home-message', '{not valid json!!!')

      // Should not throw
      renderProvider({ initialSessionId: 'session-123' })

      expect(sessionStorage.getItem('q-home-message')).toBeNull()
      expect(mockSendMessage).not.toHaveBeenCalled()
    })

    it('does not call loadHistory when pending message is consumed', () => {
      sessionStorage.setItem('q-home-message', JSON.stringify(pendingMessage))
      mockChats.current = [
        { sessionId: 'existing-session', lastActive: '2024-01-01T00:00:00Z' },
      ]

      renderProvider({ initialSessionId: 'session-123' })

      // sendMessage was called (pending message consumed)
      expect(mockSendMessage).toHaveBeenCalled()
      // loadHistory must NOT be called — sessionIdRef was set by the pending effect
      expect(mockLoadHistory).not.toHaveBeenCalled()
    })
  })

  describe('load history on mount', () => {
    it('does not auto-load most recent chat (windows manage their own sessions)', () => {
      mockChats.current = [
        { sessionId: 'recent-session', lastActive: '2024-01-02T00:00:00Z' },
      ]

      renderProvider()

      expect(mockLoadHistory).not.toHaveBeenCalled()
    })
  })
})
