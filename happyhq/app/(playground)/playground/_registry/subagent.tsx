'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { SubagentActivityIndicator } from '@/components/features/chat/messages/subagent-activity-indicator'
import { WritingPreviewCard } from '@/components/features/chat/messages/writing-preview'
import type { SubagentActivity, WritingPreview } from '@/lib/chat/types'

import { usePlaygroundStore } from '../_components/playground-store'
import { SAMPLE_TEXT } from '../_data/sample-text'
import {
  PARALLEL_SUBAGENTS,
  SINGLE_SUBAGENT_ACTIVE,
  SINGLE_SUBAGENT_COMPLETE,
  WRITING_WITH_SUBAGENT_TOOLS,
  WRITING_WITH_TEXT,
} from '../_data/writing'
import type { PlaygroundComponent } from './types'

// ---------------------------------------------------------------------------
// Streaming wrapper — simulates character-by-character writing output
// ---------------------------------------------------------------------------

function SubagentStreamingRenderer({
  data,
  controls,
}: {
  data: WritingPreview
  controls: Record<string, unknown>
}) {
  const isActive = controls.isActive as boolean
  const [preview, setPreview] = useState<WritingPreview>({ ...data })
  const [isRunning, setIsRunning] = useState(false)
  const indexRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setIsRunning(false)
  }, [])

  const sourceText = data.text || SAMPLE_TEXT

  const start = useCallback(() => {
    stop()
    indexRef.current = 0
    setPreview({ ...data, text: '', isActive: true })
    setIsRunning(true)

    timerRef.current = setInterval(() => {
      const chunkSize = Math.floor(Math.random() * 8) + 1
      const nextIndex = Math.min(
        indexRef.current + chunkSize,
        sourceText.length,
      )
      indexRef.current = nextIndex

      setPreview((prev) => ({
        ...prev,
        text: sourceText.slice(0, nextIndex),
      }))

      if (nextIndex >= sourceText.length) {
        clearInterval(timerRef.current!)
        timerRef.current = null
        setIsRunning(false)
        setPreview((prev) => ({ ...prev, isActive: false }))
      }
    }, 20)
  }, [stop, data, sourceText])

  const reset = useCallback(() => {
    stop()
    setPreview({ ...data })
  }, [stop, data])

  // Reset when variant changes
  useEffect(() => {
    stop()
    setPreview({ ...data })
  }, [data.parentToolUseId, stop, data])

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
    setIsStreaming(isRunning)
  }, [isRunning, setIsStreaming])

  // Sync isActive control when not simulating
  useEffect(() => {
    if (!isRunning) {
      setPreview((prev) => ({ ...prev, isActive }))
    }
  }, [isActive, isRunning])

  return <WritingPreviewCard preview={preview} />
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

const subagentRegistration: PlaygroundComponent = {
  id: 'subagent',
  name: 'Subagent',
  category: 'Tools',
  canvasWidth: 'md',
  variants: {
    drafting: {
      name: 'Drafting',
      data: WRITING_WITH_TEXT,
    },
    explore: {
      name: 'Explore',
      data: WRITING_WITH_SUBAGENT_TOOLS,
    },
  },
  controls: {
    isActive: {
      type: 'toggle',
      label: 'Active',
      default: false,
    },
  },
  render: ({ data, controls }) => (
    <SubagentStreamingRenderer
      data={data as WritingPreview}
      controls={controls}
    />
  ),
}

// ---------------------------------------------------------------------------
// Subagent Activity — lifecycle indicators (started/progress/completed)
// ---------------------------------------------------------------------------

const activityRegistration: PlaygroundComponent = {
  id: 'subagent-activity',
  name: 'Subagent Activity',
  category: 'Tools',
  canvasWidth: 'md',
  variants: {
    'single-active': {
      name: 'Single Active',
      data: SINGLE_SUBAGENT_ACTIVE,
    },
    'single-complete': {
      name: 'Single Complete',
      data: SINGLE_SUBAGENT_COMPLETE,
    },
    parallel: {
      name: 'Parallel',
      data: PARALLEL_SUBAGENTS,
    },
  },
  render: ({ data }) => (
    <SubagentActivityIndicator activities={data as SubagentActivity[]} />
  ),
}

export const subagentComponents: PlaygroundComponent[] = [
  subagentRegistration,
  activityRegistration,
]
