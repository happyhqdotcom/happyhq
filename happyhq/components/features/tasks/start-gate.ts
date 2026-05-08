// Single source of truth for whether the idle "Start Task" button is enabled.
// The task card (home page) and task panel (desktop) call this with the same
// inputs so the same idle task can't be enabled on one surface and disabled on
// the other (issue #255). Discovery fills in any gaps before planning, so
// title + stream is the only content requirement.
export function canStartIdleTask({
  streamSlug,
  title,
  isUploading,
  runActionsLoading,
  runActionsUpgradeNeeded,
}: {
  streamSlug: string | null
  title: string | null | undefined
  isUploading: boolean
  runActionsLoading: boolean
  runActionsUpgradeNeeded: boolean
}): boolean {
  return (
    streamSlug != null &&
    !!title?.trim() &&
    !isUploading &&
    !runActionsLoading &&
    !runActionsUpgradeNeeded
  )
}
