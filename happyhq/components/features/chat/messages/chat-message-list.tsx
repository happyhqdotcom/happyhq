'use client'

import type { ChatMessage, ToolCall } from '@/lib/chat/types'
import React, { memo, useMemo } from 'react'
import { ChatMessageComponent } from './chat-message'
import { HistoricalQuestionStep } from './historical-question-step'

interface ChatMessageListProps {
  messages: ChatMessage[]
  /** Optional callback to render a CreateTask tool call card. If omitted, CreateTask calls are not rendered. */
  renderCreateTask?: (tc: ToolCall, msg: ChatMessage) => React.ReactNode
}

/**
 * Group messages into conversation turns. Each turn starts with a user message
 * and includes all subsequent assistant messages until the next user message.
 * Leading assistant messages (before any user message) form their own group.
 */
function groupIntoTurns(messages: ChatMessage[]): ChatMessage[][] {
  const turns: ChatMessage[][] = []
  let current: ChatMessage[] = []

  for (const msg of messages) {
    if (msg.role === 'user' && current.length > 0) {
      turns.push(current)
      current = []
    }
    current.push(msg)
  }
  if (current.length > 0) turns.push(current)
  return turns
}

/**
 * Shared message list rendering used by ChatContent.
 * Ensures feature parity (answered questions, streaming caret,
 * tool cards) across all chat surfaces (floating island, sidebar).
 */
export const ChatMessageList = memo(function ChatMessageList({
  messages,
  renderCreateTask,
}: ChatMessageListProps) {
  const turns = useMemo(() => groupIntoTurns(messages), [messages])

  return (
    <>
      {turns.map((turn) => {
        const turnKey = turn[0].id
        return (
          <div key={turnKey}>
            {turn.map((msg, i) => {
              const isFirst = i === 0
              const prev = i > 0 ? turn[i - 1] : null
              // Determine the "kind" of each message for spacing:
              // text = has content, tool = tool-only, user = user message
              const kindOf = (m: ChatMessage) =>
                m.role === 'user' ? 'user' : m.content ? 'text' : 'tool'

              const kind = kindOf(msg)
              const prevKind = prev ? kindOf(prev) : null
              const isFirstTurn = turn === turns[0]

              // First of a new kind gets full spacing (pt-5),
              // consecutive same-kind assistants get tight spacing (pt-1.5)
              const spacing =
                isFirst && isFirstTurn
                  ? 'pt-5'
                  : isFirst
                    ? 'pt-5'
                    : kind !== prevKind
                      ? 'pt-5'
                      : 'pt-2'

              if (msg.role === 'user') {
                return (
                  <div
                    key={msg.id}
                    className={`${spacing} [[data-chat-surface=page]_&]:bg-background sticky top-0 z-10 pb-1 [[data-chat-surface=window]_&]:bg-white`}
                  >
                    <ChatMessageComponent message={msg} />
                    {renderCreateTask &&
                      msg.toolCalls
                        ?.filter((tc) => tc.name === 'CreateTask')
                        .map((tc) => (
                          <div key={tc.id}>{renderCreateTask(tc, msg)}</div>
                        ))}
                    {msg.toolCalls
                      ?.filter(
                        (tc) => tc.name === 'AskUserQuestion' && tc.answers,
                      )
                      .map((tc) => (
                        <HistoricalQuestionStep key={tc.id} toolCall={tc} />
                      ))}
                  </div>
                )
              }

              return (
                <div key={msg.id} className={spacing}>
                  <ChatMessageComponent message={msg} />
                  {renderCreateTask &&
                    msg.toolCalls
                      ?.filter((tc) => tc.name === 'CreateTask')
                      .map((tc) => (
                        <div key={tc.id}>{renderCreateTask(tc, msg)}</div>
                      ))}
                  {msg.toolCalls
                    ?.filter(
                      (tc) => tc.name === 'AskUserQuestion' && tc.answers,
                    )
                    .map((tc) => (
                      <HistoricalQuestionStep key={tc.id} toolCall={tc} />
                    ))}
                </div>
              )
            })}
          </div>
        )
      })}
    </>
  )
})
