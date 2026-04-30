import { useDesktopStore } from '@/stores/desktopStore'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChatContent } from './chat-content'

vi.mock('next/navigation', () => ({
  useParams: () => ({}),
}))

// ── Mocks ────────────────────────────────────────────────────────────────

const { mockChatState, mockActions } = vi.hoisted(() => {
  const mockChatState = {
    messages: [] as Array<{ role: string; content: string }>,
    isStreaming: false,
    stoppedByUser: false,
    pendingQuestion: null as { questions: Array<{ question: string }> } | null,
    pendingConfirmation: null as {
      toolName: string
      input: Record<string, unknown>
    } | null,
  }
  return {
    mockChatState,
    mockActions: {
      ensureSession: vi.fn().mockResolvedValue('mock-session'),
      send: vi.fn(),
      stop: vi.fn(),
      answerQuestion: vi.fn(),
      cancelQuestion: vi.fn(),
      allowConfirmation: vi.fn(),
      denyConfirmation: vi.fn(),
      startTask: vi.fn(),
      skipTask: vi.fn(),
    },
  }
})

vi.mock(
  '@/components/features/desktop/providers/chat-session-provider',
  () => ({
    useChatMessages: () => mockChatState.messages,
    useIsStreaming: () => mockChatState.isStreaming,
    useStoppedByUser: () => mockChatState.stoppedByUser,
    usePendingQuestion: () => mockChatState.pendingQuestion,
    usePendingConfirmation: () => mockChatState.pendingConfirmation,
    useChatSessionIdRef: () => ({ current: 'a' }),
    useDraftText: () => '',
    useDraftFiles: () => [],
    useSetDraftText: () => vi.fn(),
    useSetDraftFiles: () => vi.fn(),
    useClearDraft: () => vi.fn(),
    useChatMode: () => 'general',
    useChatStreamSlugForMode: () => null,
    useSetChatMode: () => vi.fn(),
  }),
)

vi.mock('@/stores/streamsStore', () => ({
  useStreams: () => [],
}))

vi.mock('@/components/features/desktop/hooks/use-chat-actions', () => ({
  useChatActions: () => mockActions,
}))

// Mock child components to isolate ChatContent behavior
vi.mock('./composer', () => ({
  Composer: ({
    onSubmit,
    onStop,
    disabled,
  }: {
    onSubmit: (msg: string) => void
    onStop?: () => void
    disabled?: boolean
  }) => (
    <div data-testid="composer" data-disabled={disabled}>
      <button onClick={() => onSubmit('hello')}>Send</button>
      {onStop && <button onClick={onStop}>Stop</button>}
    </div>
  ),
}))

vi.mock('./interaction/ask-user-confirmation', () => ({
  AskUserConfirmation: ({
    onAllow,
    onDeny,
  }: {
    onAllow: () => void
    onDeny: () => void
  }) => (
    <div data-testid="confirmation">
      <button onClick={onAllow}>Allow</button>
      <button onClick={onDeny}>Deny</button>
    </div>
  ),
}))

vi.mock('./interaction/question-options', () => ({
  QuestionOptions: ({
    onAnswer,
    onCancel,
  }: {
    onAnswer: (a: Record<string, string>) => void
    onCancel?: () => void
  }) => (
    <div data-testid="question-options">
      <button onClick={() => onAnswer({ q: 'a' })}>Answer</button>
      {onCancel && <button onClick={onCancel}>Cancel</button>}
    </div>
  ),
}))

vi.mock('./messages/chat-message-list', () => ({
  ChatMessageList: ({ messages }: { messages: unknown[] }) => (
    <div data-testid="message-list">{messages.length} messages</div>
  ),
}))

// jsdom lacks ResizeObserver
class MockResizeObserver {
  constructor(_cb: ResizeObserverCallback) {}
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', MockResizeObserver)

// ── Helpers ──────────────────────────────────────────────────────────────

function renderWithStore() {
  useDesktopStore.getState().reset()
  return render(<ChatContent />)
}

// ── Tests ────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  // Reset to default chat state
  mockChatState.messages = []
  mockChatState.isStreaming = false
  mockChatState.stoppedByUser = false
  mockChatState.pendingQuestion = null
  mockChatState.pendingConfirmation = null
})

describe('ChatContent', () => {
  describe('footer: composer vs interactions', () => {
    it('shows confirmation UI when pendingConfirmation is set', () => {
      mockChatState.pendingConfirmation = {
        toolName: 'Bash',
        input: { command: 'ls' },
      }
      renderWithStore()

      expect(screen.queryByTestId('confirmation')).not.toBeNull()
      expect(screen.queryByTestId('composer')).toBeNull()
    })

    it('shows question UI when pendingQuestion is set', () => {
      mockChatState.pendingQuestion = {
        questions: [{ question: 'Pick one' }],
      }
      renderWithStore()

      expect(screen.queryByTestId('question-options')).not.toBeNull()
      expect(screen.queryByTestId('composer')).toBeNull()
    })

    it('shows composer when no pending interactions', () => {
      renderWithStore()

      expect(screen.queryByTestId('composer')).not.toBeNull()
      expect(screen.queryByTestId('confirmation')).toBeNull()
      expect(screen.queryByTestId('question-options')).toBeNull()
    })

    it('confirmation takes priority over question', () => {
      mockChatState.pendingConfirmation = {
        toolName: 'Bash',
        input: { command: 'rm' },
      }
      mockChatState.pendingQuestion = {
        questions: [{ question: 'Pick one' }],
      }
      renderWithStore()

      expect(screen.queryByTestId('confirmation')).not.toBeNull()
      expect(screen.queryByTestId('question-options')).toBeNull()
    })
  })

  describe('actions wiring', () => {
    it('confirmation allow/deny calls actions', () => {
      mockChatState.pendingConfirmation = {
        toolName: 'Bash',
        input: { command: 'ls' },
      }
      renderWithStore()

      fireEvent.click(screen.getByText('Allow'))
      expect(mockActions.allowConfirmation).toHaveBeenCalled()

      fireEvent.click(screen.getByText('Deny'))
      expect(mockActions.denyConfirmation).toHaveBeenCalled()
    })

    it('composer send calls actions.send', () => {
      renderWithStore()

      fireEvent.click(screen.getByText('Send'))
      expect(mockActions.send).toHaveBeenCalledWith('hello', undefined)
    })
  })

  describe('empty state', () => {
    it('renders emptyState prop when no messages', () => {
      useDesktopStore.getState().reset()
      render(<ChatContent emptyState={<p>No messages yet</p>} />)

      expect(screen.queryByText('No messages yet')).not.toBeNull()
    })

    it('hides emptyState when messages exist', () => {
      mockChatState.messages = [{ role: 'user', content: 'hello' }]
      useDesktopStore.getState().reset()
      render(<ChatContent emptyState={<p>No messages yet</p>} />)

      expect(screen.queryByText('No messages yet')).toBeNull()
      expect(screen.queryByTestId('message-list')).not.toBeNull()
    })
  })

  describe('stopped indicator', () => {
    it('shows stopped indicator when stoppedByUser and not streaming', () => {
      mockChatState.messages = [{ role: 'user', content: 'hi' }]
      mockChatState.stoppedByUser = true
      mockChatState.isStreaming = false
      renderWithStore()

      expect(screen.queryByTestId('stopped-indicator')).not.toBeNull()
    })

    it('hides stopped indicator while still streaming', () => {
      mockChatState.messages = [{ role: 'user', content: 'hi' }]
      mockChatState.stoppedByUser = true
      mockChatState.isStreaming = true
      renderWithStore()

      expect(screen.queryByTestId('stopped-indicator')).toBeNull()
    })
  })
})
