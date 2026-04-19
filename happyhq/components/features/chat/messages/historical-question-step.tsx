'use client'

import type { AskUserQuestionInput, ToolCall } from '@/lib/chat/types'
import { Check } from 'lucide-react'

interface HistoricalQuestionStepProps {
  toolCall: ToolCall
}

export function HistoricalQuestionStep({
  toolCall,
}: HistoricalQuestionStepProps) {
  const input = toolCall.input as unknown as AskUserQuestionInput
  const answers = toolCall.answers

  return (
    <div className="space-y-1.5">
      {input.questions.map((q, i) => (
        <QuestionRow key={i} question={q} answer={answers?.[q.question]} />
      ))}
    </div>
  )
}

function QuestionRow({
  question,
  answer,
}: {
  question: AskUserQuestionInput['questions'][number]
  answer?: string
}) {
  return (
    <div className="pb-2 last:pb-0">
      <div className="flex items-baseline gap-2">
        <Check className="text-muted-foreground h-4 w-4 shrink-0 self-center" />
        <span className="text-foreground text-sm font-medium">Asked</span>
        <span className="text-foreground/60 min-w-0 truncate text-xs">
          {question.question}
        </span>
      </div>
      {answer && (
        <div className="text-foreground/70 mt-1 ml-6 rounded-lg border border-zinc-950/10 px-3 py-2 text-[11px] leading-snug">
          {answer}
        </div>
      )}
    </div>
  )
}
