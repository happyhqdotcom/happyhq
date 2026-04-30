import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { ChatMessage } from '@/lib/chat/types'
import { ChatMessageComponent } from './chat-message'

// Mock react-markdown to render children as plain text
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown">{children}</div>
  ),
}))

vi.mock('remark-gfm', () => ({
  default: {},
}))

vi.mock('./thinking-indicator', () => ({
  ThinkingIndicator: ({ blocks }: { blocks: unknown[] }) => (
    <div data-testid="thinking-indicator">{blocks.length} blocks</div>
  ),
}))

vi.mock('./tool-progress-indicator', () => ({
  ToolProgressIndicator: ({
    steps,
  }: {
    steps: unknown[]
    toolCalls?: unknown[]
  }) => <div data-testid="tool-progress-indicator">{steps.length} steps</div>,
}))

vi.mock('./message-actions', () => ({
  MessageActions: () => <div data-testid="message-actions" />,
}))

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Hello from Q',
    timestamp: Date.now(),
    ...overrides,
  }
}

describe('ChatMessageComponent', () => {
  it('renders user messages as plain text, not through markdown', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({ role: 'user', content: 'Hello Q' })}
      />,
    )

    expect(screen.getByText('Hello Q')).not.toBeNull()
    expect(screen.queryByTestId('markdown')).toBeNull()
  })

  it('renders assistant messages through markdown', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({ content: '**bold text**' })}
      />,
    )

    expect(screen.getByTestId('markdown')).not.toBeNull()
  })

  it('shows loading indicator when streaming with empty content and no tool progress', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({ isStreaming: true, content: '' })}
      />,
    )

    // No markdown content rendered, no tool progress — loading dots should be present
    expect(screen.queryByTestId('markdown')).toBeNull()
    expect(screen.queryByTestId('tool-progress-indicator')).toBeNull()
  })

  it('shows thinking indicator when thinking blocks are present', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          thinkingBlocks: [{ text: 'Analyzing the request' }],
        })}
      />,
    )

    expect(screen.getByTestId('thinking-indicator')).not.toBeNull()
  })

  it('shows tool progress when streaming with no content', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          isStreaming: true,
          content: '',
          toolProgress: [
            { toolName: 'ReadFile', toolUseId: 'tu-1', elapsedSeconds: 2 },
          ],
        })}
      />,
    )

    expect(screen.getByTestId('tool-progress-indicator')).not.toBeNull()
  })

  it('shows tool progress alongside content', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          isStreaming: true,
          content: 'Here is the result',
          toolProgress: [
            { toolName: 'ReadFile', toolUseId: 'tu-1', elapsedSeconds: 2 },
          ],
        })}
      />,
    )

    expect(screen.getByTestId('tool-progress-indicator')).not.toBeNull()
    expect(screen.getByTestId('markdown')).not.toBeNull()
  })

  it('renders file pills for user messages with files', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          role: 'user',
          content: 'Check these files',
          files: ['report.pdf', 'data.csv'],
        })}
      />,
    )

    expect(screen.getByText('report.pdf')).not.toBeNull()
    expect(screen.getByText('data.csv')).not.toBeNull()
    expect(screen.getByText('PDF')).not.toBeNull()
    expect(screen.getByText('Spreadsheet')).not.toBeNull()
    expect(screen.getByText('Check these files')).not.toBeNull()
  })

  it('renders only file pills when content is empty', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          role: 'user',
          content: '',
          files: ['report.pdf'],
        })}
      />,
    )

    expect(screen.getByText('report.pdf')).not.toBeNull()
    expect(screen.getByText('PDF')).not.toBeNull()
  })

  it('does not render file pills when files is undefined', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          role: 'user',
          content: 'Just text',
        })}
      />,
    )

    expect(screen.getByText('Just text')).not.toBeNull()
    expect(screen.queryByText('PDF')).toBeNull()
  })

  it('does not show expand button for short user messages', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({ role: 'user', content: 'Short message' })}
      />,
    )

    expect(screen.queryByText('Show more')).toBeNull()
    expect(screen.queryByText('Show less')).toBeNull()
  })

  it('shows "Show more" button for long user messages', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({ role: 'user', content: 'A'.repeat(301) })}
      />,
    )

    expect(screen.getByText('Show more')).not.toBeNull()
  })

  it('caps visible file pills with a "+N more" toggle so the sticky block stays compact', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          role: 'user',
          content: '',
          files: ['a.pdf', 'b.pdf', 'c.pdf', 'd.pdf', 'e.pdf'],
        })}
      />,
    )

    // Only the first 2 pill filenames are visible up front…
    expect(screen.getByText('a.pdf')).not.toBeNull()
    expect(screen.getByText('b.pdf')).not.toBeNull()
    expect(screen.queryByText('c.pdf')).toBeNull()
    expect(screen.queryByText('d.pdf')).toBeNull()
    expect(screen.queryByText('e.pdf')).toBeNull()

    // …with a "+N more" affordance for the rest.
    fireEvent.click(screen.getByText('+3 more'))
    expect(screen.getByText('c.pdf')).not.toBeNull()
    expect(screen.getByText('d.pdf')).not.toBeNull()
    expect(screen.getByText('e.pdf')).not.toBeNull()

    fireEvent.click(screen.getByText('Show fewer'))
    expect(screen.queryByText('c.pdf')).toBeNull()
    expect(screen.queryByText('d.pdf')).toBeNull()
    expect(screen.queryByText('e.pdf')).toBeNull()
  })

  it('renders all pills inline when the count is at or below the visible cap', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({
          role: 'user',
          content: '',
          files: ['a.pdf', 'b.pdf'],
        })}
      />,
    )

    expect(screen.getByText('a.pdf')).not.toBeNull()
    expect(screen.getByText('b.pdf')).not.toBeNull()
    expect(screen.queryByText(/more$/)).toBeNull()
  })

  it('exposes the full filename as a title attribute so truncated pills reveal on hover', () => {
    const longName =
      '813c566a-ed6a-4d81-b708-b29234596465-2fguide-using-merchstack-to-power-your-storefront-experiences'
    render(
      <ChatMessageComponent
        message={makeMessage({
          role: 'user',
          content: '',
          files: [longName],
        })}
      />,
    )

    expect(screen.getByText(longName).getAttribute('title')).toBe(longName)
  })

  it('toggles between "Show more" and "Show less" on click', () => {
    render(
      <ChatMessageComponent
        message={makeMessage({ role: 'user', content: 'A'.repeat(301) })}
      />,
    )

    expect(screen.getByText('Show more')).not.toBeNull()

    fireEvent.click(screen.getByText('Show more'))
    expect(screen.getByText('Show less')).not.toBeNull()
    expect(screen.queryByText('Show more')).toBeNull()

    fireEvent.click(screen.getByText('Show less'))
    expect(screen.getByText('Show more')).not.toBeNull()
    expect(screen.queryByText('Show less')).toBeNull()
  })
})
