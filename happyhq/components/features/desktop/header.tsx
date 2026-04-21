'use client'

import { useStreamSlug } from '@/stores/desktopStore'
import { Home, Maximize2, Minimize2 } from 'lucide-react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { ChromeButton } from './atoms/chrome-button'
import { useStreamContent } from './hooks/use-desktop-data'
import { openInteractiveChatWindow } from './windows/chat/open-chat-window'

interface HeaderBarProps {
  expanded: boolean
  onExpandToggle: () => void
}

export function HeaderBar({ expanded, onExpandToggle }: HeaderBarProps) {
  const router = useRouter()
  const streamSlug = useStreamSlug()
  const streamContent = useStreamContent()

  // Default new chat windows to learning mode when stream has no playbook content
  const chatInitialMode =
    streamContent && !(streamContent.playbookBody ?? '').trim()
      ? ('learning' as const)
      : undefined

  // ── Q keyboard shortcut to open a chat window ──────────────────────
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'q' && e.key !== 'Q') return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.target as HTMLElement)?.isContentEditable) return
      e.preventDefault()
      openInteractiveChatWindow(streamSlug, {
        initialMode: chatInitialMode,
      })
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [streamSlug, chatInitialMode])

  return (
    <div className="relative flex h-9 shrink-0 items-center px-3">
      <ChromeButton
        onClick={() => router.push('/')}
        aria-label="Home"
        className="flex items-center gap-1"
      >
        <Home className="h-4 w-4" />
        Home
      </ChromeButton>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <Image
          src="/brand/logo.svg"
          alt="HappyHQ"
          width={80}
          height={16}
          priority
          draggable={false}
        />
      </div>
      <div className="flex-1" />
      <ChromeButton
        onClick={() =>
          openInteractiveChatWindow(streamSlug, {
            initialMode: chatInitialMode,
          })
        }
        className="flex items-center gap-1"
      >
        Chat with
        <Image
          src="/brand/q.svg"
          alt="Q"
          width={14}
          height={14}
          priority
          className="inline-block"
        />
      </ChromeButton>
      <button
        onClick={onExpandToggle}
        className="ml-1 rounded-lg p-1 text-black/40 transition-colors hover:bg-black/5 hover:text-black/60"
      >
        {expanded ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  )
}
