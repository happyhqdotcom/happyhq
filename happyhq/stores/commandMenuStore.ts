// Command Menu Store
// Client-only UI state for the composable command menu system.
// Replaces the previous React context + useCommandMenu hook.

'use client'

import type { Page } from '@/components/features/command-menu/types'
import { create } from 'zustand'

export type CommandMenuVariant = 'palette' | 'quick-open'

export interface CommandMenuState {
  isOpen: boolean
  variant: CommandMenuVariant | null
  search: string
  pages: Page[]

  // Actions
  openPalette: () => void
  openQuickOpen: () => void
  close: () => void
  toggle: () => void
  pushPage: (page: Page) => void
  popPage: () => void
  setSearch: (search: string) => void
}

export const useCommandMenuStore = create<CommandMenuState>()((set, get) => ({
  isOpen: false,
  variant: null,
  search: '',
  pages: [],

  openPalette: () =>
    set({ isOpen: true, variant: 'palette', search: '', pages: [] }),

  openQuickOpen: () =>
    set({ isOpen: true, variant: 'quick-open', search: '', pages: [] }),

  close: () => set({ isOpen: false, variant: null, search: '', pages: [] }),

  toggle: () => {
    const { isOpen, close, openPalette } = get()
    if (isOpen) {
      close()
    } else {
      openPalette()
    }
  },

  pushPage: (page: Page) =>
    set((s) => ({ pages: [...s.pages, page], search: '' })),

  popPage: () => set((s) => ({ pages: s.pages.slice(0, -1), search: '' })),

  setSearch: (search: string) => set({ search }),
}))

// ── Selectors ──────────────────────────────────────────────────────────

/** Current page (last in stack), or undefined if at root */
export const useCommandMenuPage = () =>
  useCommandMenuStore((s) => s.pages[s.pages.length - 1])
