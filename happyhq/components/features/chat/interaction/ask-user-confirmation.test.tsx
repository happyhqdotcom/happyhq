import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AskUserConfirmation } from './ask-user-confirmation'

describe('AskUserConfirmation', () => {
  it('shows "Run command:" summary for Bash tools', () => {
    render(
      <AskUserConfirmation
        toolName="Bash"
        input={{ command: 'ls -la uploads/' }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Run command: ls -la uploads/')).not.toBeNull()
  })

  it('shows friendly summary for WeTransfer curl commands', () => {
    render(
      <AskUserConfirmation
        toolName="Bash"
        input={{
          command:
            "curl -sI 'https://we.tl/t-ITs39gAIVx' 2>&1 | grep -i location",
        }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Download files from WeTransfer')).not.toBeNull()
    // Raw command shown as muted inline text
    expect(
      screen.getByText(
        "curl -sI 'https://we.tl/t-ITs39gAIVx' 2>&1 | grep -i location",
      ),
    ).not.toBeNull()
  })

  it('shows friendly summary for generic curl with domain', () => {
    render(
      <AskUserConfirmation
        toolName="Bash"
        input={{
          command: "curl -L -o /tmp/file.zip 'https://example.com/file'",
        }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Download from example.com')).not.toBeNull()
  })

  it('does not show raw detail for non-curl Bash', () => {
    const { container } = render(
      <AskUserConfirmation
        toolName="Bash"
        input={{ command: 'npm install' }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Run command: npm install')).not.toBeNull()
    // No muted mono detail line
    expect(container.querySelector('.font-mono')).toBeNull()
  })

  it('shows "Access file:" summary for Read tools', () => {
    render(
      <AskUserConfirmation
        toolName="Read"
        input={{ file_path: '/etc/passwd' }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Access file: /etc/passwd')).not.toBeNull()
  })

  it('shows "Access file:" summary for Write tools', () => {
    render(
      <AskUserConfirmation
        toolName="Write"
        input={{ file_path: '/tmp/output.txt', content: 'hello' }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Access file: /tmp/output.txt')).not.toBeNull()
  })

  it('shows "Access file:" summary for Edit tools', () => {
    render(
      <AskUserConfirmation
        toolName="Edit"
        input={{ file_path: '/src/app.ts', old_string: 'a', new_string: 'b' }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Access file: /src/app.ts')).not.toBeNull()
  })

  it('shows "Use tool:" fallback for unknown tools', () => {
    render(
      <AskUserConfirmation
        toolName="SomeUnknownTool"
        input={{ foo: 'bar' }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Use tool: SomeUnknownTool')).not.toBeNull()
  })

  it('shows "Search the web:" summary for WebSearch', () => {
    render(
      <AskUserConfirmation
        toolName="WebSearch"
        input={{ query: 'hello world' }}
        onAllow={vi.fn()}
        onDeny={vi.fn()}
      />,
    )

    expect(screen.getByText('Search the web: hello world')).not.toBeNull()
  })

  it('calls onAllow when the Allow button is clicked', () => {
    const onAllow = vi.fn()
    render(
      <AskUserConfirmation
        toolName="Bash"
        input={{ command: 'echo hi' }}
        onAllow={onAllow}
        onDeny={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByText('Allow'))

    expect(onAllow).toHaveBeenCalledOnce()
  })

  it('calls onDeny when the Deny button is clicked', () => {
    const onDeny = vi.fn()
    render(
      <AskUserConfirmation
        toolName="Bash"
        input={{ command: 'echo hi' }}
        onAllow={vi.fn()}
        onDeny={onDeny}
      />,
    )

    fireEvent.click(screen.getByText('Deny'))

    expect(onDeny).toHaveBeenCalledOnce()
  })

  it('calls onDeny when the X dismiss button is clicked', () => {
    const onDeny = vi.fn()
    render(
      <AskUserConfirmation
        toolName="Bash"
        input={{ command: 'echo hi' }}
        onAllow={vi.fn()}
        onDeny={onDeny}
      />,
    )

    const dismissButton = screen.getByLabelText('Deny action')
    fireEvent.click(dismissButton)

    expect(onDeny).toHaveBeenCalledOnce()
  })
})
