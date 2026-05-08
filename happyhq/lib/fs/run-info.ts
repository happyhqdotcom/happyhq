import type { PhaseRecord, RunInfo } from './types'

/** Return the discovery PhaseRecord, or undefined if the run hasn't completed discovery. */
export function getDiscoveryPhase(
  run: RunInfo | null | undefined,
): PhaseRecord | undefined {
  return run?.phases?.find((p) => p.phase === 'discovery')
}

/** Return the planning PhaseRecord, or undefined if the run hasn't completed planning. */
export function getPlanningPhase(
  run: RunInfo | null | undefined,
): PhaseRecord | undefined {
  return run?.phases?.find((p) => p.phase === 'planning')
}

/** Return all working PhaseRecords (one per iteration) in order. */
export function getWorkingPhases(
  run: RunInfo | null | undefined,
): PhaseRecord[] {
  return run?.phases?.filter((p) => p.phase === 'working') ?? []
}
