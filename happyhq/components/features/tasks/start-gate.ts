// Single source of truth for whether the idle "Start Task" button is enabled.
// The task card (home page) and task panel (desktop) call this with the same
// inputs so the same idle task can't be enabled on one surface and disabled on
// the other (issue #255). Discovery fills in any gaps before planning, so
// title + stream is the only content requirement.

type StartGateInput = {
  streamSlug: string | null
  title: string | null | undefined
  isUploading: boolean
  runActionsLoading: boolean
  runActionsUpgradeNeeded: boolean
}

export function canStartIdleTask(input: StartGateInput): boolean {
  return idleTaskBlockedReason(input) == null
}

// Reasons surfaced as helper text next to the disabled Start Task button (#256).
// `loading` and `upgrade-needed` are intentionally omitted: loading is
// sub-second and upgrade has its own banner directly above the button.
export type IdleTaskBlockedReason =
  | 'no-title'
  | 'no-stream'
  | 'uploading'
  | 'loading'
  | 'upgrade-needed'

// Returns the highest-priority reason the button is disabled, or null when
// startable. Ordered most-actionable first so the user sees the next knob to
// turn, not a transient state.
export function idleTaskBlockedReason({
  streamSlug,
  title,
  isUploading,
  runActionsLoading,
  runActionsUpgradeNeeded,
}: StartGateInput): IdleTaskBlockedReason | null {
  if (!title?.trim()) return 'no-title'
  if (streamSlug == null) return 'no-stream'
  if (isUploading) return 'uploading'
  if (runActionsLoading) return 'loading'
  if (runActionsUpgradeNeeded) return 'upgrade-needed'
  return null
}

const HINT_BY_REASON: Partial<Record<IdleTaskBlockedReason, string>> = {
  'no-title': 'Add a title to start',
  'no-stream': 'Assign a stream to start',
  uploading: 'Waiting for upload…',
}

export function idleTaskBlockedHint(
  reason: IdleTaskBlockedReason | null,
): string | null {
  return reason ? (HINT_BY_REASON[reason] ?? null) : null
}
