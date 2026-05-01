/**
 * No-op exercise — verifies the harness skeleton itself: it spawns the dev
 * server, launches Playwright, drives the page once, and writes the standard
 * artifact set. No assertions on the app's behavior.
 *
 * Use as a self-test of the harness whenever changing scripts/exercise.ts.
 *
 *   pnpm tsx scripts/exercise.ts \
 *     --root /tmp/exercise-noop \
 *     --script scripts/exercises/noop.ts
 */
import type { ExerciseContext } from '@/scripts/exercise'

export async function run({ page }: ExerciseContext): Promise<void> {
  await page.goto('/')
  // Wait for the initial network burst to settle so the captured DOM is
  // representative of "the app loaded", not "the document just parsed".
  await page.waitForLoadState('domcontentloaded')
}
