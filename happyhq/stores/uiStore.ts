import { create } from 'zustand'

// ── Generic dialog visibility ───────────────────────────────────────────
//
// One dialog open at a time, identified by name. Callers go through
// `openDialog('xxx')` from anywhere (no hook required, no provider); the
// dialog component reads its own slice via the `useUiStore` hook.
//
// Add a new dialog by extending the `DialogName` union and rendering the
// matching component in the root layout. Call sites stay identical in shape.

export type DialogName = 'createStream'

interface UiState {
  openDialog: DialogName | null
  open: (name: DialogName) => void
  close: () => void
}

export const useUiStore = create<UiState>((set) => ({
  openDialog: null,
  open: (name) => set({ openDialog: name }),
  close: () => set({ openDialog: null }),
}))

/** Imperative open — works from anywhere, no hook required. */
export const openDialog = (name: DialogName) => useUiStore.getState().open(name)

/** Imperative close — primarily used by dialog `onClose` handlers. */
export const closeDialog = () => useUiStore.getState().close()
