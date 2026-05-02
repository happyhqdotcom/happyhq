import { describe, expect, it } from 'vitest'
import { shouldShowWorkSection } from './work-gate'

describe('shouldShowWorkSection', () => {
  describe('files exist on disk — visible regardless of run state', () => {
    // Issue #144: working/ and outputs/ files must remain accessible whenever
    // they're present on disk, even if .run.json claims a non-finished status.
    const STATES = [
      null,
      'planning',
      'plan_ready',
      'working',
      'completed',
      'stopped',
    ] as const

    for (const taskStatus of STATES) {
      it(`shows the section when files exist and status is ${taskStatus}`, () => {
        expect(
          shouldShowWorkSection({
            taskStatus,
            stoppedDuringWorking: false,
            hasWorkFiles: true,
          }),
        ).toBe(true)
      })
    }
  })

  describe('no files on disk — gated by run state', () => {
    it('hides the section when idle and nothing has been written', () => {
      expect(
        shouldShowWorkSection({
          taskStatus: null,
          stoppedDuringWorking: false,
          hasWorkFiles: false,
        }),
      ).toBe(false)
    })

    it('hides the section while planning so the work surface stays empty', () => {
      expect(
        shouldShowWorkSection({
          taskStatus: 'planning',
          stoppedDuringWorking: false,
          hasWorkFiles: false,
        }),
      ).toBe(false)
    })

    it('hides the section in plan_ready when nothing has landed yet', () => {
      // Pre-issue-#144 behavior for the empty case is preserved: only the
      // file-presence path opens the gate prematurely.
      expect(
        shouldShowWorkSection({
          taskStatus: 'plan_ready',
          stoppedDuringWorking: false,
          hasWorkFiles: false,
        }),
      ).toBe(false)
    })

    it('shows the section while working so live activity is visible', () => {
      expect(
        shouldShowWorkSection({
          taskStatus: 'working',
          stoppedDuringWorking: false,
          hasWorkFiles: false,
        }),
      ).toBe(true)
    })

    it('shows the section when a working run was stopped, even with no files', () => {
      expect(
        shouldShowWorkSection({
          taskStatus: 'stopped',
          stoppedDuringWorking: true,
          hasWorkFiles: false,
        }),
      ).toBe(true)
    })
  })
})
