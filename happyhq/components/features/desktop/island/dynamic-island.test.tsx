import type { RunInfo, TaskContent } from '@/lib/fs/types'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type PendingQuestions = NonNullable<RunInfo['pendingQuestions']>

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  mockUseParams,
  mockUseChatActions,
  mockUseTaskContent,
  mockUseActiveTask,
  mockUseTaskStatus,
  mockUseActivitySteps,
  mockUseRunActions,
  mockUsePendingQuestion,
  mockUsePendingConfirmation,
} = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
  mockUseChatActions: vi.fn(),
  mockUseTaskContent: vi.fn(),
  mockUseActiveTask: vi.fn(),
  mockUseTaskStatus: vi.fn(),
  mockUseActivitySteps: vi.fn(),
  mockUseRunActions: vi.fn(),
  mockUsePendingQuestion: vi.fn(),
  mockUsePendingConfirmation: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useParams: mockUseParams,
}))

vi.mock('../hooks/use-chat-actions', () => ({
  useChatActions: mockUseChatActions,
}))

vi.mock('../hooks/use-desktop-data', () => ({
  useTaskContent: mockUseTaskContent,
  useActiveTask: mockUseActiveTask,
  useTaskStatus: mockUseTaskStatus,
}))

vi.mock('../providers/chat-session-provider', () => ({
  usePendingQuestion: mockUsePendingQuestion,
  usePendingConfirmation: mockUsePendingConfirmation,
}))

vi.mock('@/stores/desktopStore', () => ({
  useActivitySteps: mockUseActivitySteps,
  useRunActions: mockUseRunActions,
}))

// Stub IslandShell + working content so we render without their internals
vi.mock('./island-shell', () => ({
  IslandShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="island-shell">{children}</div>
  ),
}))

vi.mock('./modes/working', () => ({
  TaskWorkingContent: () => <div data-testid="working-content" />,
}))

import { DynamicIsland } from './dynamic-island'

// ── Helpers ────────────────────────────────────────────────────────

const SAMPLE_QUESTIONS: PendingQuestions = [
  {
    question: 'What format should the email take?',
    header: 'Format',
    options: [
      { label: 'Short', description: 'One paragraph' },
      { label: 'Long', description: 'Multiple paragraphs with detail' },
    ],
    multiSelect: false,
  },
]

const EMPTY_QUESTIONS = [] as unknown as PendingQuestions

function makeTaskContent(
  status: RunInfo['status'],
  pendingQuestions?: PendingQuestions,
): TaskContent {
  return {
    frontmatter: null,
    plan: null,
    description: null,
    run: {
      status,
      startedAt: '2024-01-01',
      lastIterationAt: '2024-01-01',
      phases: [],
      ...(pendingQuestions ? { pendingQuestions } : {}),
    },
    inputs: [],
    working: [],
    outputs: [],
  }
}

function setupDefaults(
  taskSlug: string | undefined = 'my-task',
  taskContent: TaskContent | null = null,
  status: RunInfo['status'] | null = null,
) {
  mockUseParams.mockReturnValue({ task: taskSlug })
  mockUseChatActions.mockReturnValue({
    allowConfirmation: vi.fn(),
    denyConfirmation: vi.fn(),
    answerQuestion: vi.fn(),
    cancelQuestion: vi.fn(),
  })
  mockUseTaskContent.mockReturnValue(taskContent)
  mockUseActiveTask.mockReturnValue({ frontmatter: { title: 'Demo task' } })
  mockUseTaskStatus.mockReturnValue(status)
  mockUseActivitySteps.mockReturnValue([])
  mockUseRunActions.mockReturnValue({
    stop: vi.fn(),
    isStopping: false,
    answerQuestion: vi.fn().mockResolvedValue(undefined),
  })
  mockUsePendingQuestion.mockReturnValue(null)
  mockUsePendingConfirmation.mockReturnValue(null)
}

// ── Tests ──────────────────────────────────────────────────────────

describe('DynamicIsland — discovery questions', () => {
  beforeEach(() => {
    setupDefaults()
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders QuestionOptions when status is discovering and pendingQuestions is set on disk', () => {
    const taskContent = makeTaskContent('discovering', SAMPLE_QUESTIONS)
    setupDefaults('my-task', taskContent, 'discovering')

    render(<DynamicIsland />)

    // The question text comes through QuestionOptions
    expect(
      screen.getByText('What format should the email take?'),
    ).not.toBeNull()
    expect(screen.getByText('Short')).not.toBeNull()
    expect(screen.getByText('Long')).not.toBeNull()
  })

  it('does not render the question UI when discovering but pendingQuestions is empty', () => {
    const taskContent = makeTaskContent('discovering', EMPTY_QUESTIONS)
    setupDefaults('my-task', taskContent, 'discovering')

    render(<DynamicIsland />)

    expect(screen.queryByText('What format should the email take?')).toBeNull()
  })

  it('does not render the question UI when pendingQuestions is unset', () => {
    const taskContent = makeTaskContent('discovering')
    setupDefaults('my-task', taskContent, 'discovering')

    render(<DynamicIsland />)

    expect(screen.queryByText('What format should the email take?')).toBeNull()
  })

  it('does not render discovery question UI when status is not discovering', () => {
    // pendingQuestions might linger but status has moved on — gate on status.
    const taskContent = makeTaskContent('planning', SAMPLE_QUESTIONS)
    setupDefaults('my-task', taskContent, 'planning')

    render(<DynamicIsland />)

    expect(screen.queryByText('What format should the email take?')).toBeNull()
  })

  it('reading from taskContent (SWR) means the island re-renders from disk on reconnect', () => {
    // First render: no questions
    const taskContent1 = makeTaskContent('discovering')
    setupDefaults('my-task', taskContent1, 'discovering')
    const { rerender } = render(<DynamicIsland />)
    expect(screen.queryByText('What format should the email take?')).toBeNull()

    // SWR refetch lands new pendingQuestions on disk → re-render shows them
    const taskContent2 = makeTaskContent('discovering', SAMPLE_QUESTIONS)
    mockUseTaskContent.mockReturnValue(taskContent2)
    rerender(<DynamicIsland />)

    expect(
      screen.getByText('What format should the email take?'),
    ).not.toBeNull()
  })

  it('submitting answers calls runActions.answerQuestion with the answer record', () => {
    const taskContent = makeTaskContent('discovering', SAMPLE_QUESTIONS)
    const answerQuestion = vi.fn().mockResolvedValue(undefined)
    setupDefaults('my-task', taskContent, 'discovering')
    mockUseRunActions.mockReturnValue({
      stop: vi.fn(),
      isStopping: false,
      answerQuestion,
    })

    render(<DynamicIsland />)

    fireEvent.click(screen.getByText('Short'))
    fireEvent.click(screen.getByText('Submit answers'))

    expect(answerQuestion).toHaveBeenCalledWith({
      'What format should the email take?': 'Short',
    })
  })
})
