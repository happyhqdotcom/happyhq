import type { ToolCall, ToolProgressStep } from '@/lib/chat/types'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToolProgressIndicator } from './tool-progress-indicator'

vi.mock('@/components/features/desktop/windows/use-window-actions', () => ({
  useWindowActions: () => ({ openFileWindow: vi.fn() }),
}))

function makeStep(
  toolName: string,
  toolUseId: string = 'step-1',
  elapsedSeconds: number = 0,
): ToolProgressStep {
  return { toolName, toolUseId, elapsedSeconds }
}

function makeToolCall(
  name: string,
  input: Record<string, unknown>,
  id: string = 'step-1',
): ToolCall {
  return { id, name, input }
}

describe('ToolProgressIndicator', () => {
  describe('polymorphic rendering', () => {
    it('auto-expands TodoWrite checklist without info button', () => {
      const steps = [makeStep('TodoWrite')]
      const toolCalls = [
        makeToolCall('TodoWrite', {
          todos: [
            {
              content: 'First task',
              status: 'completed',
              activeForm: 'Doing first task',
            },
            {
              content: 'Second task',
              status: 'in_progress',
              activeForm: 'Doing second task',
            },
          ],
        }),
      ]

      render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={true}
        />,
      )

      // Checklist items render automatically (no click needed)
      expect(screen.queryByText('First task')).not.toBeNull()
      expect(screen.queryByText('Doing second task')).not.toBeNull()

      // No info toggle button for TodoWrite
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('shows info button for non-rich tools (e.g. Read)', () => {
      const steps = [makeStep('Read')]
      const toolCalls = [
        makeToolCall('Read', { file_path: '/path/to/file.ts' }),
      ]

      render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={true}
        />,
      )

      // Info button and file link button should both be present
      const buttons = screen.queryAllByRole('button')
      expect(buttons.length).toBe(2)
    })

    it('shows JSON detail when info button is clicked for non-rich tools', () => {
      const steps = [makeStep('Read')]
      const toolCalls = [
        makeToolCall('Read', { file_path: '/path/to/file.ts' }),
      ]

      render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={true}
        />,
      )

      // Click the info button (second button — first is the file link)
      const buttons = screen.getAllByRole('button')
      fireEvent.click(buttons[buttons.length - 1])

      // JSON detail should appear
      expect(screen.queryByText(/\/path\/to\/file\.ts/)).not.toBeNull()
    })

    it('renders only header row when TodoWrite toolCall is not yet available', () => {
      const steps = [makeStep('TodoWrite')]

      render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={[]}
          isStreaming={true}
        />,
      )

      // Header label renders
      expect(screen.queryByText('Tracking todos')).not.toBeNull()

      // No checklist items (toolCall not matched)
      // No buttons either
      expect(screen.queryByRole('button')).toBeNull()
    })
  })

  // Regression for #32: long tool details overflowed the chat container,
  // pushing the whole conversation sideways. The header row must opt into
  // shrinking (min-w-0) and the detail itself must truncate, not expand.
  describe('long detail overflow (issue #32)', () => {
    it('applies min-w-0 + truncate to a long Grep pattern so the row can shrink', () => {
      const longPattern = 'needle'.repeat(40) // ~240 chars before any cap
      const steps = [makeStep('Grep')]
      const toolCalls = [makeToolCall('Grep', { pattern: longPattern })]

      const { container } = render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={true}
        />,
      )

      const headerRow = container.querySelector('div.flex.items-baseline')
      expect(headerRow).not.toBeNull()
      expect(headerRow!.className).toMatch(/\bmin-w-0\b/)

      // The detail text the user sees is capped, not raw — but whatever made
      // it through must still be in a truncating element.
      const detail = headerRow!.querySelector(
        '.font-mono.text-xs',
      ) as HTMLElement | null
      expect(detail).not.toBeNull()
      expect(detail!.className).toMatch(/\btruncate\b/)
      expect(detail!.className).toMatch(/\bmin-w-0\b/)
    })

    it('applies truncate to a long file-link button for Read', () => {
      const longName = 'a'.repeat(120) + '.ts'
      const steps = [makeStep('Read')]
      const toolCalls = [
        makeToolCall('Read', { file_path: `/deep/${longName}` }),
      ]

      const { container } = render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={true}
        />,
      )

      const linkButton = container.querySelector(
        'button.font-mono',
      ) as HTMLElement | null
      expect(linkButton).not.toBeNull()
      expect(linkButton!.className).toMatch(/\btruncate\b/)
      expect(linkButton!.className).toMatch(/\bmin-w-0\b/)
    })

    it('keeps the elapsed timer chip from being squeezed by truncation', () => {
      const longCmd = 'echo ' + 'x'.repeat(200)
      const steps = [makeStep('Bash(echo:*)', 'step-1', 7)]
      const toolCalls = [makeToolCall('Bash(echo:*)', { command: longCmd })]

      const { container } = render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={true}
        />,
      )

      const elapsed = screen.queryByText(/^\d+s$/)
      expect(elapsed).not.toBeNull()
      expect((elapsed as HTMLElement).className).toMatch(/\bshrink-0\b/)

      const headerRow = container.querySelector('div.flex.items-baseline')
      expect(headerRow!.className).toMatch(/\bmin-w-0\b/)
    })

    // The detail string itself must reach the DOM in a bounded form — CSS
    // truncate handles visual overflow, but the cap protects screen readers,
    // tooltips, and any consumer reading textContent.
    it('caps the rendered detail length even for huge inputs', () => {
      const huge = 'q'.repeat(500)
      const steps = [makeStep('WebSearch')]
      const toolCalls = [makeToolCall('WebSearch', { query: huge })]

      render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={true}
        />,
      )

      const detail = screen
        .getAllByText(/q+/)
        .find((el) => el.classList.contains('font-mono')) as HTMLElement
      expect(detail.textContent!.length).toBeLessThan(huge.length)
      expect(detail.textContent!.endsWith('...')).toBe(true)
    })
  })

  describe('row rhythm', () => {
    // The row shell owns vertical spacing. Rich bodies must not contribute
    // their own outer margin, and the wrapper must not use sibling-margin
    // spacing — otherwise gaps between rows vary by tool type.
    it('does not stack rows with sibling-margin spacing', () => {
      const steps = [makeStep('Read', 'r1'), makeStep('TodoWrite', 'r2')]
      const toolCalls = [
        makeToolCall('Read', { file_path: '/a.ts' }, 'r1'),
        makeToolCall(
          'TodoWrite',
          {
            todos: [
              {
                content: 'Task one',
                status: 'pending',
                activeForm: 'Doing task one',
              },
            ],
          },
          'r2',
        ),
      ]

      const { container } = render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={false}
        />,
      )

      const wrapper = container.firstChild as HTMLElement
      expect(/\bspace-y-/.test(wrapper.className)).toBe(false)
    })

    it('renders rich bodies inside the row shell with no top margin of their own', () => {
      const steps = [makeStep('TodoWrite', 'r1'), makeStep('Write', 'r2')]
      const toolCalls = [
        makeToolCall(
          'TodoWrite',
          {
            todos: [
              {
                content: 'Task one',
                status: 'pending',
                activeForm: 'Doing task one',
              },
            ],
          },
          'r1',
        ),
        makeToolCall(
          'Write',
          { file_path: '/x.ts', content: 'export const x = 1\n' },
          'r2',
        ),
      ]

      const { container } = render(
        <ToolProgressIndicator
          steps={steps}
          toolCalls={toolCalls}
          isStreaming={false}
        />,
      )

      // The rich body lives inside the same row container as its header,
      // and does not bring its own top margin — the row shell handles rhythm.
      const todoText = screen.getByText('Task one')
      const todoRichRoot = todoText.parentElement!.parentElement as HTMLElement
      expect(/\bmt-/.test(todoRichRoot.className)).toBe(false)

      const writeContent = screen.getByText('export const x = 1')
      // <pre> is wrapped in a card div which is the rich root for Write.
      const writeRichRoot = writeContent.parentElement!
        .parentElement as HTMLElement
      expect(/\bmt-/.test(writeRichRoot.className)).toBe(false)

      // Both rich bodies are descendants of their row, not promoted out of it.
      const wrapper = container.firstChild as HTMLElement
      const rows = Array.from(wrapper.children) as HTMLElement[]
      expect(rows.length).toBe(2)
      expect(rows[0].contains(todoText)).toBe(true)
      expect(rows[1].contains(writeContent)).toBe(true)
    })
  })
})
