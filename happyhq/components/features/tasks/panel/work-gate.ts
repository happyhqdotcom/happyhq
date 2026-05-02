import type { RunStatus } from '@/components/features/desktop/types'

// Mirrors the task card's gate (components/features/tasks/card/index.tsx):
// the work section is visible whenever work files exist on disk OR the run
// is in a working phase. Files in working/ and outputs/ stay reachable even
// when the run ends in an unexpected state (see issue #144).
export function shouldShowWorkSection({
  taskStatus,
  stoppedDuringWorking,
  hasWorkFiles,
}: {
  taskStatus: RunStatus
  stoppedDuringWorking: boolean
  hasWorkFiles: boolean
}): boolean {
  return taskStatus === 'working' || stoppedDuringWorking || hasWorkFiles
}
