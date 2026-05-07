import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mockConfig = vi.hoisted(() => ({
  current: undefined as Record<string, unknown> | undefined,
}))

vi.mock('@/lib/config/use-config', () => ({
  useConfig: () => ({
    config: mockConfig.current,
    error: undefined,
    isLoading: false,
    mutate: vi.fn(),
  }),
}))

import { Composer } from './composer'

describe('Composer', () => {
  it('calls onSubmit with trimmed text when the send button is clicked', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '  hello world  ' } })

    const sendButton = screen.getByRole('button', { name: /send message/i })
    fireEvent.click(sendButton)

    expect(onSubmit).toHaveBeenCalledWith('hello world', undefined)
  })

  it('submits on Enter and clears the textarea', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'test message' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSubmit).toHaveBeenCalledWith('test message', undefined)
    expect(textarea.value).toBe('')
  })

  it('does not submit on Shift+Enter', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'line one' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(textarea.value).toBe('line one')
  })

  it('does not submit when the textarea is empty', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does not submit when the textarea contains only whitespace', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('disables the textarea and send button when disabled is true', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} disabled />)

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.disabled).toBe(true)

    const sendButton = screen.getByRole('button', {
      name: /send message/i,
    }) as HTMLButtonElement
    expect(sendButton.disabled).toBe(true)
  })

  it('refocuses the textarea after submission', () => {
    const onSubmit = vi.fn()
    render(<Composer onSubmit={onSubmit} />)

    const textarea = screen.getByRole('textbox')
    textarea.focus()
    fireEvent.change(textarea, { target: { value: 'hello' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    expect(document.activeElement).toBe(textarea)
  })

  describe('file staging', () => {
    it('opens file picker when the Plus button is clicked', () => {
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      const clickSpy = vi.spyOn(fileInput, 'click')

      const addButton = screen.getByRole('button', { name: /attach file/i })
      fireEvent.click(addButton)

      expect(clickSpy).toHaveBeenCalled()
    })

    it('shows staged file after selecting a PDF', async () => {
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement

      const file = new File(['content'], 'sample.pdf', {
        type: 'application/pdf',
      })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('sample.pdf')).not.toBeNull()
      })
    })

    it('passes File objects in onSubmit', async () => {
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      const file = new File(['content'], 'Acme Report Q4.pdf', {
        type: 'application/pdf',
      })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('Acme Report Q4.pdf')).not.toBeNull()
      })

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'Here are my samples' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

      expect(onSubmit).toHaveBeenCalledWith('Here are my samples', [file])
    })

    it('allows submitting with only files and no text', async () => {
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      const file = new File(['content'], 'doc.pdf', {
        type: 'application/pdf',
      })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('doc.pdf')).not.toBeNull()
      })

      const sendButton = screen.getByRole('button', { name: /send message/i })
      fireEvent.click(sendButton)

      expect(onSubmit).toHaveBeenCalledWith('', [file])
    })

    it('removes a staged file when the remove button is clicked', async () => {
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      const file = new File(['content'], 'sample.pdf', {
        type: 'application/pdf',
      })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('sample.pdf')).not.toBeNull()
      })

      const removeButton = screen.getByRole('button', {
        name: /remove sample\.pdf/i,
      })
      fireEvent.click(removeButton)

      expect(screen.queryByText('sample.pdf')).toBeNull()
    })

    it('shows staged file after selecting an EML', async () => {
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement

      const file = new File(['content'], 'deal.eml', {
        type: 'message/rfc822',
      })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('deal.eml')).not.toBeNull()
        expect(screen.getByText('Email')).not.toBeNull()
      })
    })

    it('filters out unsupported files from drag-and-drop', async () => {
      const onSubmit = vi.fn()
      const { container } = render(<Composer onSubmit={onSubmit} />)

      const dropZone = container.firstElementChild as HTMLElement
      const pdfFile = new File(['content'], 'doc.pdf', {
        type: 'application/pdf',
      })
      const emlFile = new File(['content'], 'deal.eml', {
        type: 'message/rfc822',
      })
      // .xyz is the canonical "permanently unsupported" extension for tests
      // here — pick something obscure on purpose so the test doesn't churn
      // every time ALLOWED_INPUT_EXTENSIONS grows.
      const unsupported = new File(['content'], 'mystery.xyz', {
        type: 'application/octet-stream',
      })

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [pdfFile, emlFile, unsupported] },
      })

      await waitFor(() => {
        expect(screen.getByText('doc.pdf')).not.toBeNull()
        expect(screen.getByText('deal.eml')).not.toBeNull()
      })
      expect(screen.queryByText('mystery.xyz')).toBeNull()
    })

    it('clears staged files after submission', async () => {
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement
      const file = new File(['content'], 'file.pdf', {
        type: 'application/pdf',
      })
      fireEvent.change(fileInput, { target: { files: [file] } })

      await waitFor(() => {
        expect(screen.getByText('file.pdf')).not.toBeNull()
      })

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'message' } })
      fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

      expect(screen.queryByText('file.pdf')).toBeNull()
    })

    it('handles drag-and-drop file staging', async () => {
      const onSubmit = vi.fn()
      const { container } = render(<Composer onSubmit={onSubmit} />)

      const dropZone = container.firstElementChild as HTMLElement
      const file = new File(['content'], 'dropped.pdf', {
        type: 'application/pdf',
      })

      fireEvent.drop(dropZone, {
        dataTransfer: { files: [file] },
      })

      await waitFor(() => {
        expect(screen.getByText('dropped.pdf')).not.toBeNull()
      })
    })
  })

  describe('send-with-enter config', () => {
    afterEach(() => {
      mockConfig.current = undefined
    })

    it('submits on Enter when sendWithEnter is true', () => {
      mockConfig.current = { general: { sendWithEnter: true } }
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'hello' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(onSubmit).toHaveBeenCalledWith('hello', undefined)
    })

    it('does not submit on Enter when sendWithEnter is false', () => {
      mockConfig.current = { general: { sendWithEnter: false } }
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'hello' } })
      fireEvent.keyDown(textarea, { key: 'Enter' })

      expect(onSubmit).not.toHaveBeenCalled()
    })

    it('submits on Cmd+Enter when sendWithEnter is false', () => {
      mockConfig.current = { general: { sendWithEnter: false } }
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'hello' } })
      fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true })

      expect(onSubmit).toHaveBeenCalledWith('hello', undefined)
    })

    it('submits on Ctrl+Enter when sendWithEnter is false', () => {
      mockConfig.current = { general: { sendWithEnter: false } }
      const onSubmit = vi.fn()
      render(<Composer onSubmit={onSubmit} />)

      const textarea = screen.getByRole('textbox')
      fireEvent.change(textarea, { target: { value: 'hello' } })
      fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true })

      expect(onSubmit).toHaveBeenCalledWith('hello', undefined)
    })
  })

  describe('busy state', () => {
    it('shows busy message instead of textarea when busyMessage is set', () => {
      const onSubmit = vi.fn()
      render(
        <Composer
          onSubmit={onSubmit}
          busyMessage="Q is working on my-task..."
        />,
      )

      expect(screen.getByText('Q is working on my-task...')).not.toBeNull()
      expect(screen.queryByRole('textbox')).toBeNull()
    })

    it('calls onBusyClick when the busy message is clicked', () => {
      const onSubmit = vi.fn()
      const onBusyClick = vi.fn()
      render(
        <Composer
          onSubmit={onSubmit}
          busyMessage="Q is working on my-task..."
          onBusyClick={onBusyClick}
        />,
      )

      fireEvent.click(screen.getByText('Q is working on my-task...'))
      expect(onBusyClick).toHaveBeenCalledTimes(1)
    })

    it('hides add button and send button when busy', () => {
      const onSubmit = vi.fn()
      render(
        <Composer
          onSubmit={onSubmit}
          busyMessage="Q is working on my-task..."
        />,
      )

      expect(screen.queryByLabelText('Attach file')).toBeNull()
      expect(screen.queryByLabelText('Send message')).toBeNull()
    })
  })
})
