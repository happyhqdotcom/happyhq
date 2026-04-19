'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// ── Types ──────────────────────────────────────────────────────────────

export type RecentItemType = 'stream' | 'task'

export interface RecentItem {
  type: RecentItemType
  slug: string
  title: string
  streamSlug?: string // for tasks: parent stream (undefined for inbox tasks)
  timestamp: number
}

const MAX_RECENTS = 12

function isSameRecent(a: RecentItem, b: RecentItem): boolean {
  if (a.type !== b.type) return false
  return a.slug === b.slug
}

// ── Store ──────────────────────────────────────────────────────────────

interface RecentsState {
  recents: RecentItem[]
  addRecent: (item: Omit<RecentItem, 'timestamp'>) => void
  clearRecents: () => void
}

export const useRecentsStore = create<RecentsState>()(
  persist(
    (set) => ({
      recents: [],

      addRecent: (item) =>
        set((state) => {
          const newItem: RecentItem = { ...item, timestamp: Date.now() }
          const filtered = state.recents.filter(
            (r) => !isSameRecent(r, newItem),
          )
          return { recents: [newItem, ...filtered].slice(0, MAX_RECENTS) }
        }),

      clearRecents: () => set({ recents: [] }),
    }),
    {
      name: 'happyhq:recents',
      partialize: (state) => ({ recents: state.recents }),
    },
  ),
)

// ── URL builder ────────────────────────────────────────────────────────

export function getRecentUrl(item: RecentItem): string {
  if (item.type === 'stream') {
    return `/${encodeURIComponent(item.slug)}`
  }
  if (item.streamSlug) {
    return `/${encodeURIComponent(item.streamSlug)}/${encodeURIComponent(item.slug)}`
  }
  return `/task/${encodeURIComponent(item.slug)}`
}
