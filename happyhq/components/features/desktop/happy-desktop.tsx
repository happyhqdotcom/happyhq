'use client'

import type { TaskItem } from '@/lib/fs/types'
import { taskItemsKey } from '@/lib/swr-keys'
import type { ReactNode } from 'react'
import { useMemo } from 'react'
import { SWRConfig } from 'swr'
import { ChatSessionProvider } from './providers/chat-session-provider'
import { DesktopInitializer } from './providers/desktop-initializer'
import { DesktopShell } from './shell'

/**
 * Root entry point for the desktop experience.
 * Composes providers + initializer + shell.
 *
 * Persists across route changes within the (desktop) route group.
 * Page routes render as {children} inside the shell, each wrapped in
 * SWRConfig fallback so panel content has data on the very first render.
 */
export function HappyDesktop({
  children,
  initialTaskItems,
}: {
  children: ReactNode
  initialTaskItems: TaskItem[]
}) {
  const swrFallback = useMemo(
    () => ({ [taskItemsKey()]: initialTaskItems }),
    [initialTaskItems],
  )

  return (
    <SWRConfig value={{ fallback: swrFallback }}>
      <DesktopInitializer />
      <ChatSessionProvider>
        <DesktopShell>{children}</DesktopShell>
      </ChatSessionProvider>
    </SWRConfig>
  )
}
