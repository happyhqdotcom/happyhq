'use client'

import { useDesktopStore } from '@/stores/desktopStore'
import { useParams, usePathname } from 'next/navigation'

export type OpenPanel =
  | { type: 'stream'; streamSlug: string }
  | { type: 'task'; taskSlug: string; streamSlug: string }
  | { type: 'draft' }
  | { type: 'empty' }

/**
 * Single source of truth for "what's open on the desktop."
 * Reads both slugs directly from URL params — no store detour,
 * so both are available on the first render (no flash).
 * Respects selectedStream for chat contexts outside the route group.
 */
export function useOpenPanel(): OpenPanel {
  const params = useParams<{ stream?: string; task?: string }>()
  const pathname = usePathname()
  const selectedStream = useDesktopStore((s) => s.selectedStream)
  const streamSlug = selectedStream ?? params.stream ?? ''
  const taskSlug = params.task

  if (taskSlug) return { type: 'task', taskSlug, streamSlug }
  if (pathname === '/task/new' || pathname === '/stream/new')
    return { type: 'draft' }
  if (streamSlug) return { type: 'stream', streamSlug }
  return { type: 'empty' }
}
