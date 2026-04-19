'use client'

import { displayTitle } from '@/lib/format'
import { useStreamSlug } from '@/stores/desktopStore'
import { useStreams } from '@/stores/streamsStore'
import { useRouter } from 'next/navigation'
import { ChromeButton } from './atoms/chrome-button'
import {
  ACTIVITY_DEBUG_WINDOW_ID,
  GIT_LOG_WINDOW_ID,
  MOCK_RUN_WINDOW_ID,
  PLAYBOOK_WINDOW_ID,
  SAMPLES_WINDOW_ID,
  SPECS_WINDOW_ID,
} from './constants'
import { useStreamContent } from './hooks/use-desktop-data'
import { useOpenPanel } from './hooks/use-open-panel'

interface FooterBarProps {
  openDirectoryWindow: (id: string, title: string) => void
  openOrFocusWindow: (
    id: string,
    title: string,
    filePath: string,
    content: string,
  ) => void
  islandHasContent: boolean
  islandHidden: boolean
  onIslandHiddenChange: (hidden: boolean) => void
}

export function FooterBar({
  openDirectoryWindow,
  openOrFocusWindow,
  islandHasContent,
  islandHidden,
  onIslandHiddenChange,
}: FooterBarProps) {
  return (
    <div className="flex h-9 shrink-0 items-center gap-1 px-3">
      {/* ── Left: stream context ── */}
      <FooterStreamContext
        openDirectoryWindow={openDirectoryWindow}
        openOrFocusWindow={openOrFocusWindow}
      />

      <div className="flex-1" />

      {/* ── Right: history, debug ── */}
      <ChromeButton
        onClick={() => openDirectoryWindow(GIT_LOG_WINDOW_ID, 'Git Log')}
      >
        History
      </ChromeButton>
      <ChromeButton
        onClick={() =>
          openDirectoryWindow(ACTIVITY_DEBUG_WINDOW_ID, 'Activity Debug')
        }
      >
        Debug
      </ChromeButton>
      {process.env.NODE_ENV === 'development' && (
        <ChromeButton
          onClick={() => openDirectoryWindow(MOCK_RUN_WINDOW_ID, 'Mock Run')}
        >
          Mock
        </ChromeButton>
      )}

      {/* ── Island toggle ── */}
      <div className="flex items-center">
        <div
          className={`overflow-hidden transition-all duration-200 ${
            islandHasContent ? 'max-w-[16px] opacity-100' : 'max-w-0 opacity-0'
          }`}
        >
          <div className="mx-1.5 h-3.5 w-px bg-black/10" />
        </div>
        <div
          className={`overflow-hidden transition-all duration-200 ${
            islandHasContent ? 'max-w-[106px] opacity-100' : 'max-w-0 opacity-0'
          }`}
        >
          <button
            onClick={() => onIslandHiddenChange(!islandHidden)}
            className={`w-[106px] rounded-lg px-2 py-1 text-xs whitespace-nowrap transition-colors hover:bg-black/5 hover:text-black/60 ${islandHidden ? 'text-black/60' : 'text-black/40'}`}
          >
            {islandHidden ? 'Show Progress' : 'Hide Progress'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stream context (left side of footer) ─────────────────────────────

function FooterStreamContext({
  openDirectoryWindow,
  openOrFocusWindow,
}: {
  openDirectoryWindow: (id: string, title: string) => void
  openOrFocusWindow: (
    id: string,
    title: string,
    filePath: string,
    content: string,
  ) => void
}) {
  const router = useRouter()
  const openPanel = useOpenPanel()
  const streamSlug = useStreamSlug()
  const streams = useStreams()
  const streamTitle = streams.find((s) => s.name === streamSlug)?.title ?? null
  const streamContent = useStreamContent()

  if (!streamSlug) {
    if (openPanel.type === 'task') {
      return (
        <span className="rounded-lg px-2 py-1 text-xs text-black/25">
          No stream assigned
        </span>
      )
    }
    return null
  }

  return (
    <>
      {openPanel.type === 'task' ? (
        <ChromeButton
          onClick={() =>
            router.push(`/tasks/${encodeURIComponent(streamSlug)}`)
          }
          className="flex items-center gap-1.5"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            className="shrink-0"
          >
            <path
              d="M10 12L6 8l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {displayTitle(streamTitle, streamSlug)}
        </ChromeButton>
      ) : (
        <span className="rounded-lg px-2 py-1 text-xs text-black/40">
          {displayTitle(streamTitle, streamSlug)}
        </span>
      )}
      <div className="mx-0.5 h-3.5 w-px bg-black/10" />
      <ChromeButton
        onClick={() =>
          openOrFocusWindow(
            PLAYBOOK_WINDOW_ID,
            'playbook.md',
            `${streamSlug}/playbook.md`,
            streamContent?.playbook ?? '',
          )
        }
      >
        Playbook
      </ChromeButton>
      <ChromeButton
        onClick={() => openDirectoryWindow(SPECS_WINDOW_ID, 'Specs')}
      >
        Specs
      </ChromeButton>
      <ChromeButton
        onClick={() => openDirectoryWindow(SAMPLES_WINDOW_ID, 'Samples')}
      >
        Samples
      </ChromeButton>
    </>
  )
}
