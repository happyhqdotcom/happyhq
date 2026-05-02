import type { RunStatus } from '@/components/features/desktop/types'

// Files in outputs/ are accessible whenever they exist on disk, regardless of
// run state — see issue #144. The section also renders during working /
// stoppedDuringWorking so the user sees live activity before any file lands.
export function shouldShowOutputsSection({
  taskStatus,
  stoppedDuringWorking,
  hasOutputFiles,
}: {
  taskStatus: RunStatus
  stoppedDuringWorking: boolean
  hasOutputFiles: boolean
}): boolean {
  return taskStatus === 'working' || stoppedDuringWorking || hasOutputFiles
}
