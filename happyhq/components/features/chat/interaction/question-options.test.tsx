import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QuestionOptions } from './question-options'

const sampleQuestion = {
  question: 'What type of file is this?',
  header: 'File type',
  options: [
    { label: 'Sample PDF', description: 'A sample document for intake' },
    { label: 'Task input', description: 'A file for a future task' },
  ],
  multiSelect: false,
}

const multiQuestions = [
  {
    question: 'What type of file is this?',
    header: 'File type',
    options: [
      { label: 'Sample PDF', description: 'A sample document' },
      { label: 'Task input', description: 'A file for a task' },
    ],
    multiSelect: false,
  },
  {
    question: 'How should it be processed?',
    header: 'Processing',
    options: [
      { label: 'Extract text', description: 'Run through OCR' },
      { label: 'Keep as-is', description: 'No processing' },
    ],
    multiSelect: false,
  },
  {
    question: 'Priority level?',
    header: 'Priority',
    options: [
      { label: 'High', description: 'Urgent' },
      { label: 'Low', description: 'When convenient' },
    ],
    multiSelect: false,
  },
]

describe('QuestionOptions', () => {
  it('renders the question text and all predefined options', () => {
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={vi.fn()} />)

    expect(screen.getByText('What type of file is this?')).not.toBeNull()
    expect(screen.getByText('Sample PDF')).not.toBeNull()
    expect(screen.getByText('Task input')).not.toBeNull()
  })

  it('renders an auto-generated "Other" option', () => {
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={vi.fn()} />)

    expect(screen.getByText('Other')).not.toBeNull()
  })

  it('calls onAnswer with a Record keyed by question text on submit', () => {
    const onAnswer = vi.fn()
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByText('Sample PDF'))
    fireEvent.click(screen.getByText('Submit answers'))

    expect(onAnswer).toHaveBeenCalledWith({
      'What type of file is this?': 'Sample PDF',
    })
  })

  it('does not submit when nothing is selected', () => {
    const onAnswer = vi.fn()
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByText('Submit answers'))

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('reveals a text input when "Other" is selected', () => {
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={vi.fn()} />)

    fireEvent.click(screen.getByText('Other'))

    expect(screen.getByRole('textbox')).not.toBeNull()
  })

  it('calls onAnswer with custom text when "Other" is submitted', () => {
    const onAnswer = vi.fn()
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={onAnswer} />)

    fireEvent.click(screen.getByText('Other'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'My custom answer' } })
    fireEvent.click(screen.getByText('Submit answers'))

    expect(onAnswer).toHaveBeenCalledWith({
      'What type of file is this?': 'My custom answer',
    })
  })

  it('clears "Other" text when switching to a predefined option', () => {
    const onAnswer = vi.fn()
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={onAnswer} />)

    // Select Other and type something
    fireEvent.click(screen.getByText('Other'))
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'custom' },
    })

    // Switch to a predefined option
    fireEvent.click(screen.getByText('Task input'))
    fireEvent.click(screen.getByText('Submit answers'))

    expect(onAnswer).toHaveBeenCalledWith({
      'What type of file is this?': 'Task input',
    })
    // The Other text input should be gone
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('renders option descriptions when present', () => {
    render(<QuestionOptions questions={[sampleQuestion]} onAnswer={vi.fn()} />)

    expect(screen.getByText('A sample document for intake')).not.toBeNull()
    expect(screen.getByText('A file for a future task')).not.toBeNull()
  })

  describe('multi-select questions', () => {
    const multiSelectQuestion = {
      question: 'What kinds of docs do you write?',
      header: 'Doc types',
      options: [
        { label: 'Specs', description: 'Design specs' },
        { label: 'Runbooks', description: 'Ops runbooks' },
        { label: 'Postmortems', description: 'Incident reviews' },
      ],
      multiSelect: true,
    }

    it('lets the user select more than one option and submits them comma-joined', () => {
      const onAnswer = vi.fn()
      render(
        <QuestionOptions
          questions={[multiSelectQuestion]}
          onAnswer={onAnswer}
        />,
      )

      fireEvent.click(screen.getByText('Specs'))
      fireEvent.click(screen.getByText('Postmortems'))
      fireEvent.click(screen.getByText('Submit answers'))

      expect(onAnswer).toHaveBeenCalledWith({
        'What kinds of docs do you write?': 'Specs, Postmortems',
      })
    })

    it('toggles a selected option off when clicked again', () => {
      const onAnswer = vi.fn()
      render(
        <QuestionOptions
          questions={[multiSelectQuestion]}
          onAnswer={onAnswer}
        />,
      )

      fireEvent.click(screen.getByText('Specs'))
      fireEvent.click(screen.getByText('Runbooks'))
      fireEvent.click(screen.getByText('Specs'))
      fireEvent.click(screen.getByText('Submit answers'))

      expect(onAnswer).toHaveBeenCalledWith({
        'What kinds of docs do you write?': 'Runbooks',
      })
    })

    it('appends "Other" freeform text to the selection set', () => {
      const onAnswer = vi.fn()
      render(
        <QuestionOptions
          questions={[multiSelectQuestion]}
          onAnswer={onAnswer}
        />,
      )

      fireEvent.click(screen.getByText('Specs'))
      fireEvent.click(screen.getByText('Other'))
      fireEvent.change(screen.getByRole('textbox'), {
        target: { value: 'API references' },
      })
      fireEvent.click(screen.getByText('Submit answers'))

      expect(onAnswer).toHaveBeenCalledWith({
        'What kinds of docs do you write?': 'Specs, API references',
      })
    })
  })

  describe('multi-question auto-advance', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('advances to the next unanswered tab after selecting a predefined option', () => {
      render(<QuestionOptions questions={multiQuestions} onAnswer={vi.fn()} />)

      // First tab is active — its question text is visible
      expect(screen.getByText('What type of file is this?')).not.toBeNull()

      // Select a predefined option on the first question
      fireEvent.click(screen.getByText('Sample PDF'))

      // Before 150ms, the first tab's content is still visible
      expect(screen.getByText('What type of file is this?')).not.toBeNull()

      // After 150ms, should advance to second tab
      act(() => {
        vi.advanceTimersByTime(150)
      })

      expect(screen.getByText('How should it be processed?')).not.toBeNull()
    })

    it('does not auto-advance when "Other" is selected', () => {
      render(<QuestionOptions questions={multiQuestions} onAnswer={vi.fn()} />)

      // Click "Other" on the first question
      fireEvent.click(screen.getByText('Other'))

      act(() => {
        vi.advanceTimersByTime(300)
      })

      // Still on the first tab — the textarea is visible
      expect(screen.getByRole('textbox')).not.toBeNull()
    })

    it('does not auto-advance when the last unanswered question is answered', () => {
      render(<QuestionOptions questions={multiQuestions} onAnswer={vi.fn()} />)

      // Answer first question
      fireEvent.click(screen.getByText('Sample PDF'))
      act(() => {
        vi.advanceTimersByTime(150)
      })

      // Now on second tab — answer it
      fireEvent.click(screen.getByText('Extract text'))
      act(() => {
        vi.advanceTimersByTime(150)
      })

      // Now on third tab — answer it (all answered now)
      fireEvent.click(screen.getByText('High'))
      act(() => {
        vi.advanceTimersByTime(300)
      })

      // Should stay on third tab — its question is still visible
      expect(screen.getByText('Priority level?')).not.toBeNull()
    })

    it('skips already-answered questions when advancing', () => {
      render(<QuestionOptions questions={multiQuestions} onAnswer={vi.fn()} />)

      // Answer first question, auto-advance to second
      fireEvent.click(screen.getByText('Sample PDF'))
      act(() => {
        vi.advanceTimersByTime(150)
      })

      // Manually go back to first tab and re-answer it
      fireEvent.click(screen.getByText('File type'))

      // Answer second question by clicking its tab first
      fireEvent.click(screen.getByText('Processing'))
      fireEvent.click(screen.getByText('Extract text'))
      act(() => {
        vi.advanceTimersByTime(150)
      })

      // Should skip to third (first two are answered)
      expect(screen.getByText('Priority level?')).not.toBeNull()
    })
  })
})
