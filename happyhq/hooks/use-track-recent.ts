'use client'

import { useRecentsStore } from '@/stores/recentsStore'
import { useEffect, useRef } from 'react'

/**
 * Track a stream visit.
 * Fires once when slug first becomes available.
 */
export function useTrackRecentStream(
  slug: string | undefined,
  title: string | null | undefined,
) {
  const addRecent = useRecentsStore((s) => s.addRecent)
  const trackedSlug = useRef<string | null>(null)

  useEffect(() => {
    if (!slug) return
    if (trackedSlug.current === slug) return
    trackedSlug.current = slug

    addRecent({
      type: 'stream',
      slug,
      title: title || slug,
    })
  }, [slug, title, addRecent])
}

/**
 * Track a task visit.
 * Fires once when slug first becomes available.
 */
export function useTrackRecentTask(
  slug: string | undefined,
  title: string | null | undefined,
  streamSlug?: string,
) {
  const addRecent = useRecentsStore((s) => s.addRecent)
  const trackedSlug = useRef<string | null>(null)

  useEffect(() => {
    if (!slug) return
    if (trackedSlug.current === slug) return
    trackedSlug.current = slug

    addRecent({
      type: 'task',
      slug,
      title: title || slug,
      ...(streamSlug ? { streamSlug } : {}),
    })
  }, [slug, title, streamSlug, addRecent])
}
