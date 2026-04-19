import type { StreamEntry } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import useSWR from 'swr'
import { create } from 'zustand'

// Stable empty array — avoids new reference on every render (React 19 + useSyncExternalStore)
const EMPTY: StreamEntry[] = []

// ── State shape ─────────────────────────────────────────────────────────
// Client-only state — the streams list lives in SWR cache
// (warmed by WorkspaceInitializer in the layout).

interface StreamsState {
  // The slug of the currently active stream (set by DesktopDataProvider).
  // Used by the sidebar for active-state highlight instead of usePathname(),
  // because the native replaceState bypass doesn't update Next.js's router state.
  activeStreamSlug: string | null
  setActiveStreamSlug: (slug: string | null) => void

  // Whether the "Show Completed Tasks" section is expanded in task lists.
  // Stored here (not component-local) so it survives route changes.
  showCompletedTasks: boolean
  setShowCompletedTasks: (show: boolean | ((prev: boolean) => boolean)) => void
}

export const useStreamsStore = create<StreamsState>((set) => ({
  activeStreamSlug: null,
  setActiveStreamSlug: (slug) => set({ activeStreamSlug: slug }),

  showCompletedTasks: false,
  setShowCompletedTasks: (show) =>
    set((s) => ({
      showCompletedTasks:
        typeof show === 'function' ? show(s.showCompletedTasks) : show,
    })),
}))

// ── SWR-backed selector hooks ───────────────────────────────────────────
// Read from SWR cache (warmed by WorkspaceInitializer). Same API as before.

export const useStreams = (): StreamEntry[] => {
  const { data } = useSWR<StreamEntry[]>('/api/fs/streams', fetcher, {
    revalidateOnFocus: false,
  })
  return data ?? EMPTY
}

export const useStreamsLoading = (): boolean => {
  const { data, error } = useSWR<StreamEntry[]>('/api/fs/streams', fetcher, {
    revalidateOnFocus: false,
  })
  return !data && !error
}

export const useStreamsMutate = () => {
  const { mutate } = useSWR<StreamEntry[]>('/api/fs/streams', fetcher, {
    revalidateOnFocus: false,
  })
  return mutate
}

// Client-only selector hooks — read from Zustand
export const useActiveStreamSlug = () =>
  useStreamsStore((s) => s.activeStreamSlug)
