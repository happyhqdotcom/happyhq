'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatMessageComponent } from '@/components/features/chat/messages/chat-message'
import type { ChatMessage } from '@/lib/chat/types'

import { usePlaygroundStore } from '../_components/playground-store'
import {
  ASSISTANT_MESSAGE_RICH,
  ASSISTANT_MESSAGE_SHORT,
  USER_MESSAGE_LONG,
  USER_MESSAGE_PLAIN,
  USER_MESSAGE_WITH_FILES,
} from '../_data/messages'
import type { PlaygroundComponent } from './types'

// ---------------------------------------------------------------------------
// Assistant Message wrapper — renders the message and provides play/stop/reset
// canvas actions to simulate word-by-word streaming on any variant
// ---------------------------------------------------------------------------

function AssistantMessageRenderer({
  data,
  controls,
}: {
  data: ChatMessage
  controls: Record<string, unknown>
}) {
  const isHistorical = controls.isHistorical as boolean
  const isStreamingControl = controls.isStreaming as boolean
  const sourceText = data.content
  const [simulatedContent, setSimulatedContent] = useState<string | null>(null)
  const [isSimulating, setIsSimulating] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsSimulating(false)
  }, [])

  const start = useCallback(() => {
    stop()
    indexRef.current = 0
    setSimulatedContent('')
    setIsSimulating(true)

    const words = sourceText.split(' ')
    timerRef.current = setInterval(() => {
      const chunkSize = Math.floor(Math.random() * 4) + 1
      const nextIndex = Math.min(indexRef.current + chunkSize, words.length)
      indexRef.current = nextIndex
      setSimulatedContent(words.slice(0, nextIndex).join(' '))

      if (nextIndex >= words.length) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        setIsSimulating(false)
      }
    }, 100)
  }, [stop, sourceText])

  const reset = useCallback(() => {
    stop()
    setSimulatedContent(null)
  }, [stop])

  // Variant changes are handled by `<Fragment key={variantKey}>` in
  // playground/page.tsx, which fully remounts this renderer — no manual
  // reset effect needed.

  const setCanvasActions = usePlaygroundStore((s) => s.setCanvasActions)
  const setIsStreaming = usePlaygroundStore((s) => s.setIsStreaming)

  useEffect(() => {
    setCanvasActions({ start, stop, reset })
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      setCanvasActions(null)
      setIsStreaming(false)
    }
  }, [start, stop, reset, setCanvasActions, setIsStreaming])

  useEffect(() => {
    setIsStreaming(isSimulating)
  }, [isSimulating, setIsStreaming])

  const message: ChatMessage = {
    ...data,
    content: simulatedContent ?? data.content,
    isStreaming: isSimulating || isStreamingControl,
    isHistorical,
  }

  return <ChatMessageComponent message={message} />
}

const userMessageRegistration: PlaygroundComponent = {
  id: 'messages/user',
  name: 'User Message',
  category: 'Messages',
  variants: {
    plain: { name: 'Plain', data: USER_MESSAGE_PLAIN },
    'with-files': { name: 'With Files', data: USER_MESSAGE_WITH_FILES },
    long: { name: 'Long (truncated)', data: USER_MESSAGE_LONG },
  },
  render: ({ data }) => {
    const message = data as ChatMessage
    return <ChatMessageComponent message={message} />
  },
}

const assistantMessageRegistration: PlaygroundComponent = {
  id: 'messages/assistant',
  name: 'Assistant Message',
  category: 'Messages',
  canvasWidth: 'md',
  variants: {
    short: { name: 'Short', data: ASSISTANT_MESSAGE_SHORT },
    'rich-markdown': { name: 'Rich Markdown', data: ASSISTANT_MESSAGE_RICH },
  },
  controls: {
    isStreaming: {
      type: 'toggle',
      label: 'Streaming',
      default: false,
    },
    isHistorical: {
      type: 'toggle',
      label: 'Historical',
      default: false,
    },
  },
  render: ({ data, controls }) => (
    <AssistantMessageRenderer data={data as ChatMessage} controls={controls} />
  ),
}

export const messageComponents: PlaygroundComponent[] = [
  userMessageRegistration,
  assistantMessageRegistration,
]
