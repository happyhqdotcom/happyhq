import { describe, expect, it } from 'vitest'

import type { ChatMessage } from '@/lib/chat/types'
import { kindOfMessage } from './chat-message-list'

function msg(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 't',
    role: 'assistant',
    content: '',
    timestamp: 0,
    ...overrides,
  }
}

describe('kindOfMessage', () => {
  it('classifies user messages by role', () => {
    expect(kindOfMessage(msg({ role: 'user', content: 'hi' }))).toBe('user')
  })

  it('classifies messages with text content as text', () => {
    expect(kindOfMessage(msg({ content: 'hello' }))).toBe('text')
  })

  it('classifies tool-only messages as tool', () => {
    expect(
      kindOfMessage(
        msg({
          toolProgress: [
            { toolName: 'Read', toolUseId: 'tu-1', elapsedSeconds: 0 },
          ],
        }),
      ),
    ).toBe('tool')
  })

  it('classifies thinking-only messages as thinking, not tool', () => {
    // Was 'tool' under the old kindOf. After 8 tool rows, a thinking-only
    // message would inherit pt-2 (8px) and visually glue onto the strip.
    expect(
      kindOfMessage(
        msg({ thinkingBlocks: [{ text: 'pondering the next move' }] }),
      ),
    ).toBe('thinking')
  })

  it('classifies thinking-leading messages as thinking even when tools follow', () => {
    // ThinkingIndicator renders above tool progress in AssistantMessage, so
    // the message visually leads with thinking — its top edge spacing should
    // treat it as a thinking message, not a tool message.
    expect(
      kindOfMessage(
        msg({
          thinkingBlocks: [{ text: 'pondering' }],
          toolProgress: [
            { toolName: 'Read', toolUseId: 'tu-1', elapsedSeconds: 0 },
          ],
        }),
      ),
    ).toBe('thinking')
  })

  it('ignores empty or whitespace-only thinking blocks', () => {
    // ThinkingIndicator hides content-less blocks, so they shouldn't
    // influence spacing classification either.
    expect(kindOfMessage(msg({ thinkingBlocks: [{ text: '' }] }))).toBe('tool')
    expect(
      kindOfMessage(msg({ thinkingBlocks: [{ text: '   \n\n  ' }] })),
    ).toBe('tool')
  })
})
