'use client'

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/common/ui/tabs'
import type { AskUserQuestionInput } from '@/lib/chat/types'
import { cn } from '@/lib/utils'
import { Radio, RadioGroup } from '@headlessui/react'
import { Check, X } from 'lucide-react'
import { useCallback, useState } from 'react'

interface QuestionOptionsProps {
  questions: AskUserQuestionInput['questions']
  onAnswer: (answers: Record<string, string>) => void
  onCancel?: () => void
}

export function QuestionOptions({
  questions,
  onAnswer,
  onCancel,
}: QuestionOptionsProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [otherActive, setOtherActive] = useState<Record<string, boolean>>({})
  const [otherTexts, setOtherTexts] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState(questions[0].question)

  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const autoResizeRef = useCallback((el: HTMLTextAreaElement | null) => {
    if (el) autoResize(el)
  }, [])

  const handleSelect = (questionText: string, label: string) => {
    const newAnswers = { ...answers, [questionText]: label }
    setAnswers(newAnswers)
    setOtherActive((prev) => ({ ...prev, [questionText]: false }))
    setOtherTexts((prev) => ({ ...prev, [questionText]: '' }))

    // Auto-advance to next unanswered tab after 150ms
    const allAnswered = questions.every((q) => newAnswers[q.question])
    if (!allAnswered) {
      const next = questions.find((q) => !newAnswers[q.question])
      if (next) setTimeout(() => setActiveTab(next.question), 150)
    }
  }

  const handleSelectOther = (questionText: string) => {
    // Keep the previous answer as fallback — only cleared when user empties the text field.
    // Deleting here caused the X/Y counter to flash between values.
    setOtherActive((prev) => ({ ...prev, [questionText]: true }))
  }

  const handleOtherText = (questionText: string, text: string) => {
    setOtherTexts((prev) => ({ ...prev, [questionText]: text }))
    if (text.trim()) {
      setAnswers((prev) => ({ ...prev, [questionText]: text.trim() }))
    } else {
      setAnswers((prev) => {
        const next = { ...prev }
        delete next[questionText]
        return next
      })
    }
  }

  const isAnswered = (questionText: string) =>
    answers[questionText] !== undefined && answers[questionText] !== ''

  const canSubmit = questions.every(
    (q) => answers[q.question] !== undefined && answers[q.question] !== '',
  )

  const handleSubmit = () => {
    if (canSubmit) onAnswer(answers)
  }

  const advanceToNext = () => {
    const nextUnanswered = questions.find(
      (q) =>
        q.question !== activeTab &&
        (!answers[q.question] || answers[q.question] === ''),
    )
    if (nextUnanswered) setActiveTab(nextUnanswered.question)
  }

  const renderQuestion = (
    question: AskUserQuestionInput['questions'][number],
  ) => (
    <div>
      <p className="mb-2 text-sm font-medium text-zinc-900">
        {question.question}
      </p>

      <div className="space-y-0.5">
        <RadioGroup
          value={
            otherActive[question.question]
              ? ''
              : (answers[question.question] ?? '')
          }
          onChange={(val: string) => handleSelect(question.question, val)}
        >
          {question.options.map((option) => (
            <Radio
              key={option.label}
              value={option.label}
              className={cn(
                'group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1 text-left transition-colors',
                'hover:bg-black/5',
                'data-checked:bg-black/5',
                'outline-none',
              )}
            >
              <div className="min-w-0">
                <span className="text-sm font-medium text-zinc-900">
                  {option.label}
                </span>
                {option.description && (
                  <span className="block text-xs text-zinc-500">
                    {option.description}
                  </span>
                )}
              </div>
              <Check className="h-4 w-4 shrink-0 text-zinc-900 opacity-0 transition group-data-checked:opacity-100" />
            </Radio>
          ))}
        </RadioGroup>

        {/* Auto-generated "Other" option — outside RadioGroup since it clears radio selection */}
        <button
          type="button"
          onClick={() => handleSelectOther(question.question)}
          className={cn(
            'flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-1.5 text-left transition-colors',
            otherActive[question.question] ? 'bg-black/5' : 'hover:bg-black/5',
          )}
        >
          {otherActive[question.question] ? (
            <textarea
              ref={autoResizeRef}
              value={otherTexts[question.question] || ''}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                handleOtherText(question.question, e.target.value)
                autoResize(e.target)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (canSubmit) {
                    handleSubmit()
                  } else if (otherTexts[question.question]?.trim()) {
                    advanceToNext()
                  }
                }
              }}
              placeholder="Type your answer..."
              autoFocus
              rows={1}
              className="max-h-36 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400"
            />
          ) : (
            <span className="text-sm font-medium text-zinc-900">Other</span>
          )}
          <Check
            className={cn(
              'h-4 w-4 shrink-0 text-zinc-900 transition',
              otherActive[question.question] ? 'opacity-100' : 'opacity-0',
            )}
          />
        </button>
      </div>
    </div>
  )

  return (
    <div
      onMouseDown={(e) => e.stopPropagation()}
      className="flex flex-col rounded-[28px] bg-white p-3.5 shadow-[0_4px_20px_rgba(0,0,0,0.035)] ring-4 ring-[oklch(0.9_0.058_28/.5)] outline-1 outline-[oklch(0.795_0.115_28)]"
    >
      {questions.length > 1 ? (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="mb-2 flex items-center">
            <TabsList className="h-auto flex-1 justify-start gap-0.5 overflow-x-auto border-none bg-transparent p-0">
              {questions.map((q) => (
                <TabsTrigger
                  key={q.question}
                  value={q.question}
                  className="gap-1.5 rounded-md border-none bg-transparent px-2 py-1 text-xs text-zinc-900/40 shadow-none data-[state=active]:bg-black/5 data-[state=active]:text-zinc-900 data-[state=active]:shadow-none"
                >
                  {q.header}
                </TabsTrigger>
              ))}
            </TabsList>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-700"
                aria-label="Dismiss question"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {questions.map((question) => (
              <TabsContent key={question.question} value={question.question}>
                {renderQuestion(question)}
              </TabsContent>
            ))}
          </div>
        </Tabs>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-900/40">
              {questions[0].header}
            </span>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/5 hover:text-zinc-700"
                aria-label="Dismiss question"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {questions.map((question) => (
              <div key={question.question}>{renderQuestion(question)}</div>
            ))}
          </div>
        </>
      )}

      {/* Bottom bar: progress + submit */}
      <div className="mt-2 flex items-center justify-between">
        <span className="text-xs text-zinc-400">
          {Object.keys(answers).filter((k) => answers[k] !== '').length}/
          {questions.length} answered
        </span>
        {questions.length > 1 && !canSubmit ? (
          <button
            type="button"
            onClick={advanceToNext}
            disabled={!isAnswered(activeTab)}
            className={cn(
              'flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-opacity',
              isAnswered(activeTab)
                ? 'opacity-100'
                : 'cursor-not-allowed opacity-40',
            )}
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={cn(
              'flex items-center gap-1.5 rounded-full bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-opacity',
              canSubmit ? 'opacity-100' : 'cursor-not-allowed opacity-40',
            )}
          >
            Submit answers
          </button>
        )}
      </div>
    </div>
  )
}
