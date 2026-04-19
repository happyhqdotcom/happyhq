'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { WorkingIndicator } from '@/components/features/chat/messages/working-indicator'
import { useAnimatedText } from '@/hooks/use-animated-text'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { usePlaygroundStore } from '../_components/playground-store'
import { SAMPLE_TEXT } from '../_data/sample-text'
import type { PlaygroundComponent } from './types'

// --- Animated Text wrapper ---

function AnimatedTextDemo({ controls }: { controls: Record<string, unknown> }) {
  const [text, setText] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const delimiter = controls.delimiter as '' | ' '
  const duration = controls.duration as number

  const animatedContent = useAnimatedText(text, isRunning, {
    delimiter,
    duration,
  })

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRunning(false)
  }, [])

  const start = useCallback(() => {
    stop()
    indexRef.current = 0
    setText('')
    setIsRunning(true)

    timerRef.current = setInterval(() => {
      const words = SAMPLE_TEXT.split(' ')
      const chunkSize = Math.floor(Math.random() * 5) + 1
      const nextIndex = Math.min(indexRef.current + chunkSize, words.length)
      indexRef.current = nextIndex
      setText(words.slice(0, nextIndex).join(' '))

      if (nextIndex >= words.length) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        setIsRunning(false)
      }
    }, 120)
  }, [stop])

  const reset = useCallback(() => {
    stop()
    indexRef.current = 0
    setText('')
  }, [stop])

  const setCanvasActions = usePlaygroundStore((s) => s.setCanvasActions)
  const setIsStreaming = usePlaygroundStore((s) => s.setIsStreaming)

  useEffect(() => {
    setCanvasActions({ start, stop, reset })
    return () => {
      setCanvasActions(null)
      setIsStreaming(false)
    }
  }, [start, stop, reset, setCanvasActions, setIsStreaming])

  useEffect(() => {
    setIsStreaming(isRunning)
  }, [isRunning, setIsStreaming])

  return (
    <div>
      {animatedContent ? (
        <div className="prose prose-slate prose-p:my-2 prose-p:leading-[1.65] max-w-none text-[15px]">
          <Markdown remarkPlugins={[remarkGfm]}>{animatedContent}</Markdown>
        </div>
      ) : (
        <p className="text-muted-foreground py-8 text-center text-sm italic">
          Press play to start streaming
        </p>
      )}
    </div>
  )
}

// --- Streaming Caret wrapper ---

function StreamingCaretDemo({
  controls,
}: {
  controls: Record<string, unknown>
}) {
  const isStreaming = controls.isStreaming as boolean

  return (
    <p className="text-foreground text-[15px] leading-relaxed">
      The goal is to get them to their &quot;aha moment&quot; as quickly as
      possible
      {isStreaming && (
        <span className="bg-foreground/50 ml-0.5 inline-block h-4 w-[3px] animate-pulse rounded-[1px] align-text-bottom" />
      )}
    </p>
  )
}

// --- Registrations ---

const workingIndicatorRegistration: PlaygroundComponent = {
  id: 'primitives/working',
  name: 'Working Indicator',
  category: 'Primitives',
  variants: {
    default: { name: 'Default', data: null },
  },
  render: () => <WorkingIndicator />,
}

const animatedTextRegistration: PlaygroundComponent = {
  id: 'primitives/animated-text',
  name: 'Animated Text',
  category: 'Primitives',
  canvasWidth: 'md',
  variants: {
    'word-by-word': { name: 'Word by Word', data: { delimiter: ' ' } },
    character: { name: 'Character', data: { delimiter: '' } },
  },
  controls: {
    duration: {
      type: 'slider',
      label: 'Duration (s)',
      default: 0.6,
      min: 0.1,
      max: 4,
      step: 0.1,
    },
    delimiter: {
      type: 'select',
      label: 'Delimiter',
      default: ' ',
      options: [
        { label: 'Word', value: ' ' },
        { label: 'Character', value: '' },
      ],
    },
  },
  render: ({ controls }) => <AnimatedTextDemo controls={controls} />,
}

const streamingCaretRegistration: PlaygroundComponent = {
  id: 'primitives/caret',
  name: 'Streaming Caret',
  category: 'Primitives',
  canvasWidth: 'sm',
  variants: {
    default: { name: 'Default', data: null },
  },
  controls: {
    isStreaming: {
      type: 'toggle',
      label: 'Streaming',
      default: true,
    },
  },
  render: ({ controls }) => <StreamingCaretDemo controls={controls} />,
}

export const primitivesComponents: PlaygroundComponent[] = [
  workingIndicatorRegistration,
  animatedTextRegistration,
  streamingCaretRegistration,
]
