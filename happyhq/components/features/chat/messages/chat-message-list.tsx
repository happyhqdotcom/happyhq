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

type MessageKind = 'user' | 'thinking' | 'text' | 'tool'

/**
 * Classify a message for inter-message spacing in the conversation.
 *
 * The kind reflects what visually *leads* the message: ThinkingIndicator
 * renders before tool progress and content inside an assistant message, so
 * any message with non-empty thinking blocks is 'thinking'. This makes a
 * tool → thinking transition a kind change (pt-5), preventing the case
 * where a thinking message after a long run of tool rows visually glued
 * onto the bottom of the strip with only pt-2 of separation.
 *
 * Whitespace-only thinking blocks are ignored, mirroring the same check
 * inside ThinkingIndicator that hides empty blocks from rendering.
 */
export function kindOfMessage(m: ChatMessage): MessageKind {
  if (m.role === 'user') return 'user'
  if (m.thinkingBlocks?.some((b) => b.text.trim().length > 0)) return 'thinking'
  if (m.content) return 'text'
  return 'tool'
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
              const kind = kindOfMessage(msg)
              const prevKind = prev ? kindOfMessage(prev) : null
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
