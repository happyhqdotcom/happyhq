import type { ToolCall } from '@/lib/chat/types'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TodoWriteDisplay } from './todo-write-display'

function makeTodoToolCall(
  todos: Array<{ content: string; status: string; activeForm: string }>,
): ToolCall {
  return {
    id: 'tool-1',
    name: 'TodoWrite',
    input: { todos },
  }
}

describe('TodoWriteDisplay', () => {
  it('renders nothing when todos is empty', () => {
    const { container } = render(
      <TodoWriteDisplay toolCall={makeTodoToolCall([])} isActive={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when todos is missing', () => {
    const toolCall: ToolCall = { id: 'tool-1', name: 'TodoWrite', input: {} }
    const { container } = render(
      <TodoWriteDisplay toolCall={toolCall} isActive={false} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows content text for completed items', () => {
    render(
      <TodoWriteDisplay
        toolCall={makeTodoToolCall([
          {
            content: 'Read the docs',
            status: 'completed',
            activeForm: 'Reading the docs',
          },
        ])}
        isActive={false}
      />,
    )
    expect(screen.queryByText('Read the docs')).not.toBeNull()
    // Should NOT show activeForm for completed items
    expect(screen.queryByText('Reading the docs')).toBeNull()
  })

  it('shows activeForm text for in-progress items', () => {
    render(
      <TodoWriteDisplay
        toolCall={makeTodoToolCall([
          {
            content: 'Write summary',
            status: 'in_progress',
            activeForm: 'Writing summary',
          },
        ])}
        isActive={true}
      />,
    )
    expect(screen.queryByText('Writing summary')).not.toBeNull()
    // Should NOT show content for in-progress items
    expect(screen.queryByText('Write summary')).toBeNull()
  })

  it('shows content text for pending items', () => {
    render(
      <TodoWriteDisplay
        toolCall={makeTodoToolCall([
          {
            content: 'Generate output',
            status: 'pending',
            activeForm: 'Generating output',
          },
        ])}
        isActive={false}
      />,
    )
    expect(screen.queryByText('Generate output')).not.toBeNull()
    expect(screen.queryByText('Generating output')).toBeNull()
  })

  it('renders a mixed list with correct text per status', () => {
    render(
      <TodoWriteDisplay
        toolCall={makeTodoToolCall([
          {
            content: 'Read playbook',
            status: 'completed',
            activeForm: 'Reading playbook',
          },
          {
            content: 'Extract terms',
            status: 'in_progress',
            activeForm: 'Extracting terms',
          },
          {
            content: 'Analyze PDF',
            status: 'pending',
            activeForm: 'Analyzing PDF',
          },
        ])}
        isActive={true}
      />,
    )
    // Completed: shows content
    expect(screen.queryByText('Read playbook')).not.toBeNull()
    // In-progress: shows activeForm
    expect(screen.queryByText('Extracting terms')).not.toBeNull()
    // Pending: shows content
    expect(screen.queryByText('Analyze PDF')).not.toBeNull()
  })

  it('applies scroll cap when more than 6 items', () => {
    const todos = Array.from({ length: 8 }, (_, i) => ({
      content: `Task ${i + 1}`,
      status: 'pending',
      activeForm: `Doing task ${i + 1}`,
    }))
    const { container } = render(
      <TodoWriteDisplay toolCall={makeTodoToolCall(todos)} isActive={false} />,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className.includes('max-h-[180px]')).toBe(true)
    expect(wrapper.className.includes('overflow-y-auto')).toBe(true)
  })

  it('does not apply scroll cap with 6 or fewer items', () => {
    const todos = Array.from({ length: 6 }, (_, i) => ({
      content: `Task ${i + 1}`,
      status: 'pending',
      activeForm: `Doing task ${i + 1}`,
    }))
    const { container } = render(
      <TodoWriteDisplay toolCall={makeTodoToolCall(todos)} isActive={false} />,
    )
    const wrapper = container.firstChild as HTMLElement
    expect(wrapper.className.includes('max-h-[180px]')).toBe(false)
  })
})
