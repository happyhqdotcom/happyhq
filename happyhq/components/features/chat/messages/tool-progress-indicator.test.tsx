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
      expect(screen.queryByText('To Dos')).not.toBeNull()

      // No checklist items (toolCall not matched)
      // No buttons either
      expect(screen.queryByRole('button')).toBeNull()
    })
  })
})
