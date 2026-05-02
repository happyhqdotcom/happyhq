import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from 'vitest'

// Mock Catalyst Dialog — uses Headless UI portals/transitions that don't work in jsdom.
// Other Catalyst components (Button, Input, Field) render as standard HTML.
vi.mock('@/components/common/catalyst/dialog', () => ({
  Dialog: ({
    open,
    onClose,
    children,
  }: {
    open: boolean
    onClose: () => void
    children: React.ReactNode
  }) => (open ? <div data-testid="dialog">{children}</div> : null),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogActions: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}))

import { NameInputDialog } from './name-dialog'

describe('NameInputDialog', () => {
  let onClose: Mock<() => void>
  let onSubmit: Mock<(name: string) => Promise<void>>

  beforeEach(() => {
    onClose = vi.fn<() => void>()
    onSubmit = vi
      .fn<(name: string) => Promise<void>>()
      .mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderDialog(overrides?: {
    open?: boolean
    defaultValue?: string
    title?: string
    submitLabel?: string
  }) {
    const props = {
      open: true,
      onClose,
      title: 'Create stream',
      defaultValue: '',
      submitLabel: 'Create',
      onSubmit,
      ...overrides,
    }
    return render(<NameInputDialog {...props} />)
  }

  function getInput() {
    return screen.getByRole('textbox') as HTMLInputElement
  }

  function getSubmitButton() {
    return screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement
  }

  function getCancelButton() {
    return screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement
  }

  // --- Contract: submit button disabled when input is empty or whitespace ---

  it('disables submit when input is empty', () => {
    renderDialog({ defaultValue: '' })
    expect(getSubmitButton().disabled).toBe(true)
  })

  it('disables submit when input is whitespace-only', () => {
    renderDialog()
    fireEvent.change(getInput(), { target: { value: '   ' } })
    expect(getSubmitButton().disabled).toBe(true)
  })

  it('enables submit when input has non-whitespace content', () => {
    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'my stream' } })
    expect(getSubmitButton().disabled).toBe(false)
  })

  // --- Contract: form submission calls onSubmit with current value ---

  it('calls onSubmit with the current input value on form submit', async () => {
    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'my project' } })
    fireEvent.submit(screen.getByRole('textbox').closest('form')!)

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith('my project')
    })
  })

  // --- Contract: onSubmit Error is displayed as inline error ---

  it('displays error message when onSubmit throws an Error', async () => {
    onSubmit.mockRejectedValue(new Error('Name already exists'))
    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'duplicate' } })
    fireEvent.submit(getInput().closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Name already exists')).not.toBeNull()
    })
  })

  // --- Contract: non-Error throw displays generic fallback ---

  it('displays generic error for non-Error throws', async () => {
    onSubmit.mockRejectedValue('string error')
    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'something' } })
    fireEvent.submit(getInput().closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('An error occurred')).not.toBeNull()
    })
  })

  // --- Contract: error clears when user types ---

  it('clears inline error when user edits the input', async () => {
    onSubmit.mockRejectedValue(new Error('Bad name'))
    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'bad' } })
    fireEvent.submit(getInput().closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Bad name')).not.toBeNull()
    })

    fireEvent.change(getInput(), { target: { value: 'good' } })
    expect(screen.queryByText('Bad name')).toBeNull()
  })

  // --- Contract: dialog cannot be closed while onSubmit is in-flight ---

  it('blocks close while submission is in-flight', async () => {
    let resolveSubmit!: () => void
    onSubmit.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSubmit = resolve
      }),
    )

    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'name' } })
    fireEvent.submit(getInput().closest('form')!)

    // While in-flight, cancel button should be disabled
    expect(getCancelButton().disabled).toBe(true)
    // And submit button should be disabled
    expect(getSubmitButton().disabled).toBe(true)

    // Resolve and let the dialog become interactive again
    await act(async () => {
      resolveSubmit()
    })

    expect(getCancelButton().disabled).toBe(false)
    expect(getSubmitButton().disabled).toBe(false)
  })

  // --- Contract: state resets when dialog re-opens ---

  it('resets value and error when dialog re-opens', async () => {
    onSubmit.mockRejectedValue(new Error('Collision'))
    const { rerender } = renderDialog({ defaultValue: 'original' })

    // Modify input and trigger an error
    fireEvent.change(getInput(), { target: { value: 'modified' } })
    fireEvent.submit(getInput().closest('form')!)
    await waitFor(() => {
      expect(screen.getByText('Collision')).not.toBeNull()
    })

    // Close dialog
    rerender(
      <NameInputDialog
        open={false}
        onClose={onClose}
        title="Create stream"
        defaultValue="original"
        submitLabel="Create"
        onSubmit={onSubmit}
      />,
    )

    // Re-open — should reset to defaultValue and clear error
    rerender(
      <NameInputDialog
        open={true}
        onClose={onClose}
        title="Create stream"
        defaultValue="original"
        submitLabel="Create"
        onSubmit={onSubmit}
      />,
    )

    expect(getInput().value).toBe('original')
    expect(screen.queryByText('Collision')).toBeNull()
  })

  // --- Contract: dialog not rendered when closed ---

  it('renders nothing when open is false', () => {
    renderDialog({ open: false })
    expect(screen.queryByTestId('dialog')).toBeNull()
  })

  // --- Contract: isSubmitting resets even after error ---

  it('re-enables buttons after onSubmit rejects', async () => {
    onSubmit.mockRejectedValue(new Error('Oops'))
    renderDialog()
    fireEvent.change(getInput(), { target: { value: 'test' } })
    fireEvent.submit(getInput().closest('form')!)

    await waitFor(() => {
      expect(screen.getByText('Oops')).not.toBeNull()
    })

    // Buttons should be re-enabled after the error
    expect(getSubmitButton().disabled).toBe(false)
    expect(getCancelButton().disabled).toBe(false)
  })
})
