import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { StartTaskCard } from './start-task-card'

describe('StartTaskCard', () => {
  it('calls onStart when the action button is clicked', () => {
    const onStart = vi.fn()
    render(<StartTaskCard name="grade-essays" onStart={onStart} />)

    fireEvent.click(screen.getByRole('button'))

    expect(onStart).toHaveBeenCalledOnce()
  })

  it('calls onStart even when the task has already started', () => {
    const onStart = vi.fn()
    render(<StartTaskCard name="grade-essays" onStart={onStart} started />)

    fireEvent.click(screen.getByRole('button'))

    expect(onStart).toHaveBeenCalledOnce()
  })
})
