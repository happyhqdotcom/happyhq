'use client'

import type { ToolCall } from '@/lib/chat/types'
import { Circle, CircleCheck, CircleDot } from 'lucide-react'

interface TodoItem {
  content: string
  status: string
  activeForm: string
}

interface TodoWriteDisplayProps {
  toolCall: ToolCall
  isActive: boolean
}

export function TodoWriteDisplay({ toolCall }: TodoWriteDisplayProps) {
  const todos = toolCall.input.todos as TodoItem[] | undefined
  if (!Array.isArray(todos) || todos.length === 0) return null

  const wrapperClass =
    'ml-6 space-y-0.5' +
    (todos.length > 6 ? ' max-h-[180px] overflow-y-auto' : '')

  return (
    <div className={wrapperClass}>
      {todos.map((todo, i) => (
        <div
          key={i}
          className="flex items-center gap-2 py-0.5 text-[13px] leading-snug"
        >
          {todo.status === 'completed' && (
            <>
              <CircleCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
              <span className="text-muted-foreground/50 decoration-muted-foreground/20 line-through">
                {todo.content}
              </span>
            </>
          )}
          {todo.status === 'in_progress' && (
            <>
              <CircleDot className="h-3.5 w-3.5 shrink-0 text-blue-500/70" />
              <span className="text-foreground/80 font-medium">
                {todo.activeForm}
              </span>
            </>
          )}
          {todo.status === 'pending' && (
            <>
              <Circle className="text-muted-foreground/30 h-3.5 w-3.5 shrink-0" />
              <span className="text-muted-foreground/60">{todo.content}</span>
            </>
          )}
        </div>
      ))}
    </div>
  )
}
