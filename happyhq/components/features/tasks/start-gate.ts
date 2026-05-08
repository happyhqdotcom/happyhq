// Single source of truth for whether the idle "Start Task" button is enabled.
// The task card (home page) and task panel (desktop) call this with the same
// inputs so the same idle task can't be enabled on one surface and disabled on
// the other (issue #255).
export function canStartIdleTask({
  streamSlug,
  title,
  hasDescription,
  hasInputs,
  isUploading,
  runActionsLoading,
  runActionsUpgradeNeeded,
}: {
  streamSlug: string | null
  title: string | null | undefined
  hasDescription: boolean
  hasInputs: boolean
  isUploading: boolean
  runActionsLoading: boolean
  runActionsUpgradeNeeded: boolean
}): boolean {
  return (
    streamSlug != null &&
    !!title?.trim() &&
    (hasDescription || hasInputs) &&
    !isUploading &&
    !runActionsLoading &&
    !runActionsUpgradeNeeded
  )
}
