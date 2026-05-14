import type { RunInfo, TaskItem } from '@/lib/fs/types'
import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: vi.fn() }),
}))

vi.mock('@/lib/actions', () => ({
  toggleTaskDone: vi.fn(),
}))

import { TaskListItem } from './item'

function makeTask(opts: {
  pending?: 'clarification'
  runStatus?: RunInfo['status']
  completedAt?: string
}): TaskItem {
  return {
    slug: 'task-abc',
    frontmatter: {
      title: 'Write report',
      createdAt: '2026-04-01T00:00:00.000Z',
      updatedAt: '2026-04-01T00:00:00.000Z',
      pending: opts.pending,
      completedAt: opts.completedAt,
    } as TaskItem['frontmatter'],
    run: opts.runStatus
      ? ({
          status: opts.runStatus,
          stopReason: null,
          startedAt: '2026-04-01T00:00:00.000Z',
          lastIterationAt: '2026-04-01T00:00:00.000Z',
          phases: {},
        } as unknown as RunInfo)
      : null,
    description: null,
  }
}

describe('TaskListItem checkbox slot', () => {
  it('does not show the spinner while a task is awaiting clarification, even if run.status is still discovering (regression: #313)', () => {
    const { container } = render(
      <TaskListItem
        task={makeTask({ pending: 'clarification', runStatus: 'discovering' })}
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(container.querySelector('.animate-spin')).toBeNull()
  })

  it('shows the spinner for an actively running task with no pending clarification', () => {
    const { container } = render(
      <TaskListItem
        task={makeTask({ runStatus: 'working' })}
        selected={false}
        onSelect={() => {}}
      />,
    )
    expect(container.querySelector('.animate-spin')).not.toBeNull()
  })
})
