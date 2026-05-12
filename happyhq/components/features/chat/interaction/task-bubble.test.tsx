import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { TaskBubble } from './task-bubble'

describe('TaskBubble', () => {
  it('suggested state shows Create and fires onCreate', () => {
    const onCreate = vi.fn().mockResolvedValue(undefined)
    const onStart = vi.fn()
    render(
      <TaskBubble
        name="q4-report"
        state="suggested"
        onCreate={onCreate}
        onStart={onStart}
      />,
    )
    expect(screen.getByText('Suggested task')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /create/i }))
    expect(onCreate).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('created state shows Start Task footer and fires onStart', () => {
    const onCreate = vi.fn()
    const onStart = vi.fn().mockResolvedValue(undefined)
    const onView = vi.fn()
    render(
      <TaskBubble
        name="q4-report"
        state="created"
        streamSlug="sales"
        onCreate={onCreate}
        onStart={onStart}
        onView={onView}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /start task/i }))
    expect(onStart).toHaveBeenCalledTimes(1)
    expect(onCreate).not.toHaveBeenCalled()
    expect(onView).not.toHaveBeenCalled()
  })

  it('created state title click fires onView (navigate without starting)', () => {
    const onStart = vi.fn()
    const onView = vi.fn()
    render(
      <TaskBubble
        name="q4-report"
        state="created"
        streamSlug="sales"
        onStart={onStart}
        onView={onView}
      />,
    )
    fireEvent.click(screen.getByText('Q4 Report'))
    expect(onView).toHaveBeenCalledTimes(1)
    expect(onStart).not.toHaveBeenCalled()
  })

  it('started state hides the Start footer and fires onView from anywhere', () => {
    const onStart = vi.fn()
    const onView = vi.fn()
    render(
      <TaskBubble
        name="q4-report"
        state="started"
        streamSlug="sales"
        onStart={onStart}
        onView={onView}
      />,
    )
    expect(screen.queryByRole('button', { name: /start task/i })).toBeNull()
    fireEvent.click(screen.getByText('Q4 Report'))
    expect(onView).toHaveBeenCalledTimes(1)
  })

  it('shows textContext only in created state', () => {
    const ctx = 'User wants to try three apple pie variants'
    const { rerender } = render(
      <TaskBubble
        name="apple-pies"
        state="suggested"
        textContext={ctx}
        onCreate={() => {}}
      />,
    )
    expect(screen.queryByText(ctx)).toBeNull()
    rerender(
      <TaskBubble
        name="apple-pies"
        state="created"
        textContext={ctx}
        onStart={() => {}}
        onView={() => {}}
      />,
    )
    expect(screen.getByText(ctx)).toBeTruthy()
  })
})
