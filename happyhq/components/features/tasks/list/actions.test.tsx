import type { TaskItem } from '@/lib/fs/types'
import { taskContentKey, taskItemsKey } from '@/lib/swr-keys'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockMutate, mockUpdateTaskStream, mockInvalidateStream, mockStreams } =
  vi.hoisted(() => ({
    mockMutate: vi.fn(),
    mockUpdateTaskStream: vi.fn().mockResolvedValue(undefined),
    mockInvalidateStream: vi.fn(),
    mockStreams: vi.fn(() => [
      {
        name: 'inbox',
        title: 'Inbox',
        createdAt: '',
        hasPlaybookContent: false,
      },
      {
        name: 'goals',
        title: 'Goals',
        createdAt: '',
        hasPlaybookContent: false,
      },
    ]),
  }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: mockMutate }),
}))

vi.mock('@/lib/actions', () => ({
  deleteTaskByLocation: vi.fn(),
  updateTaskStream: mockUpdateTaskStream,
}))

vi.mock('@/lib/swr-helpers', () => ({
  invalidateStream: mockInvalidateStream,
}))

vi.mock('@/stores/streamsStore', () => ({
  useStreams: () => mockStreams(),
}))

vi.mock('@/components/common/shared/delete-alert', () => ({
  DeleteAlert: () => null,
}))

vi.mock('@/components/features/tasks/atoms/stream-picker', () => ({
  StreamPicker: ({ onSelect }: { onSelect: (slug: string | null) => void }) => (
    <div>
      <button
        type="button"
        data-testid="pick-inbox"
        onClick={() => onSelect('inbox')}
      >
        pick inbox
      </button>
      <button
        type="button"
        data-testid="pick-goals"
        onClick={() => onSelect('goals')}
      >
        pick goals
      </button>
      <button
        type="button"
        data-testid="pick-none"
        onClick={() => onSelect(null)}
      >
        pick none
      </button>
    </div>
  ),
}))

import { TaskListItemActions } from './actions'

function makeTask(streamSlug: string | null = null): TaskItem {
  return {
    slug: 'task-abc',
    frontmatter: {
      title: 'Write report',
      stream: streamSlug ?? undefined,
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
    } as TaskItem['frontmatter'],
    run: null,
    description: null,
  }
}

describe('TaskListItemActions handleStreamChange', () => {
  beforeEach(() => {
    mockMutate.mockReset()
    mockUpdateTaskStream.mockReset().mockResolvedValue(undefined)
    mockInvalidateStream.mockReset()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('invalidates the per-task content cache when assigning a stream so the open card refreshes (regression: #20)', async () => {
    render(<TaskListItemActions task={makeTask(null)} onCollapse={() => {}} />)

    fireEvent.click(screen.getByTestId('pick-inbox'))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockUpdateTaskStream).toHaveBeenCalledWith('task-abc', 'inbox')
    expect(mockMutate).toHaveBeenCalledWith(taskContentKey('task-abc'))
    expect(mockMutate).toHaveBeenCalledWith(taskItemsKey())
    expect(mockInvalidateStream).toHaveBeenCalledWith('inbox')
  })

  it('invalidates both previous and new stream caches on reassignment', async () => {
    render(
      <TaskListItemActions task={makeTask('inbox')} onCollapse={() => {}} />,
    )

    fireEvent.click(screen.getByTestId('pick-goals'))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockInvalidateStream).toHaveBeenCalledWith('inbox')
    expect(mockInvalidateStream).toHaveBeenCalledWith('goals')
    expect(mockMutate).toHaveBeenCalledWith(taskContentKey('task-abc'))
  })

  it('invalidates the previous stream and the per-task cache when clearing assignment to None', async () => {
    render(
      <TaskListItemActions task={makeTask('inbox')} onCollapse={() => {}} />,
    )

    fireEvent.click(screen.getByTestId('pick-none'))
    await Promise.resolve()
    await Promise.resolve()

    expect(mockUpdateTaskStream).toHaveBeenCalledWith('task-abc', null)
    expect(mockInvalidateStream).toHaveBeenCalledWith('inbox')
    expect(mockInvalidateStream).toHaveBeenCalledTimes(1)
    expect(mockMutate).toHaveBeenCalledWith(taskContentKey('task-abc'))
  })
})
