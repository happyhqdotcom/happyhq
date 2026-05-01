/**
 * Smoke exercise — minimal end-to-end verification of the harness.
 *
 * Opens `/chat`, fills the home composer, submits, and waits for one of
 * three stable signals:
 *   - `[data-role="assistant-message"]` — the agent replied (API key works)
 *   - `[data-role="auth-error"]` — auth-error toast surfaced
 *   - URL navigates to `/setup` — auth-error redirect completed
 *
 * The smoke does not assert success — it asserts the harness round-trips a
 * real user gesture through the running app. Either reaching `/setup` or
 * receiving an assistant reply is a green outcome; only "neither" is a real
 * regression worth investigating from the artifacts.
 *
 *   pnpm tsx scripts/exercise.ts \
 *     --root /tmp/exercise-smoke \
 *     --script scripts/exercises/smoke.ts
 */
import type { ExerciseContext } from '@/scripts/exercise'

const SETTLED_TIMEOUT_MS = 30_000

export async function run({ page, dump }: ExerciseContext): Promise<void> {
  // The home composer (HomeComposer) lives on /chat — `/` redirects to
  // /tasks, which renders TaskQuickAdd (a different gesture).
  await page.goto('/chat')
  await page.waitForLoadState('domcontentloaded')

  const composer = page.getByRole('textbox', { name: /message/i }).first()
  await composer.waitFor({ state: 'visible', timeout: 10_000 })
  await composer.fill('hello from the harness')
  await dump('before-send')
  await composer.press('Enter')

  // Wait for any of the three terminal signals. Reaching /setup means the
  // auth-error redirect fired; the data-role hooks cover the in-page paths.
  await page.waitForFunction(
    () =>
      !!document.querySelector('[data-role="assistant-message"]') ||
      !!document.querySelector('[data-role="auth-error"]') ||
      window.location.pathname.startsWith('/setup'),
    null,
    { timeout: SETTLED_TIMEOUT_MS },
  )

  await dump('after-send')
}
