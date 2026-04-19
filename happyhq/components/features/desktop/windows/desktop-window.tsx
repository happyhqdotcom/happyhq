'use client'

import { useWindowById } from '@/stores/windowStore'
import type { RefObject } from 'react'
import {
  ACTIVITY_DEBUG_WINDOW_ID,
  GIT_LOG_WINDOW_ID,
  MOCK_RUN_WINDOW_ID,
  SAMPLES_WINDOW_ID,
  SPECS_WINDOW_ID,
} from '../constants'
import { ChatWindow } from './chat/chat-window'
import { CsvWindow } from './csv/csv-window'
import { ActivityDebugWindow } from './debug/activity-debug-window'
import { GitLogWindow } from './debug/git-log-window'
import { MockRunWindow } from './debug/mock-run-window'
import { EmailWindow } from './email/email-window'
import { ImageWindow } from './image/image-window'
import { MarkdownWindow } from './markdown/markdown-window'
import { PdfWindow } from './pdf/pdf-window'
import { SamplesWindow } from './samples/samples-window'
import { SpecsWindow } from './specs/specs-window'
import type { WindowComponentProps } from './types'

interface DesktopWindowProps {
  id: string
  canvasRef: RefObject<HTMLDivElement | null>
  openFileWindow: (entry: {
    name: string
    title?: string
    path: string
    rawPath?: string | null
  }) => void
}

/**
 * Thin orchestrator: reads window state to determine the type,
 * then delegates to the appropriate self-contained window component.
 */
export function DesktopWindow({
  id,
  canvasRef,
  openFileWindow,
}: DesktopWindowProps) {
  const w = useWindowById(id)
  if (!w || !w.isOpen) return null

  const props: WindowComponentProps = { id, canvasRef, openFileWindow }

  if (w.contentType === 'markdown') return <MarkdownWindow {...props} />
  if (w.contentType === 'pdf') return <PdfWindow {...props} />
  if (w.contentType === 'image') return <ImageWindow {...props} />
  if (w.contentType === 'email') return <EmailWindow {...props} />
  if (w.contentType === 'csv') return <CsvWindow {...props} />
  if (w.contentType === 'chat') return <ChatWindow {...props} />
  if (w.id === SAMPLES_WINDOW_ID) return <SamplesWindow {...props} />
  if (w.id === SPECS_WINDOW_ID) return <SpecsWindow {...props} />
  if (w.id === ACTIVITY_DEBUG_WINDOW_ID)
    return <ActivityDebugWindow {...props} />
  if (w.id === GIT_LOG_WINDOW_ID) return <GitLogWindow {...props} />
  if (w.id === MOCK_RUN_WINDOW_ID) return <MockRunWindow {...props} />

  return null
}
