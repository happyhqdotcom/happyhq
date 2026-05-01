/**
 * Rename-stream exercise — verification for issue #24
 * (rename stream while windows open).
 *
 * The flow:
 *   1. Pre-seed `<root>/acme/specs/` and `<root>/acme/samples/` so the
 *      sandboxed dev server lists `acme` in the sidebar without us having
 *      to drive a create-stream UI gesture.
 *   2. Open `/acme` (desktop view). With no playbook, StreamPanelView
 *      auto-opens an interactive chat window — that's the "open window"
 *      whose state #24 is about. The window lives in `windowStore`, a
 *      module-scoped zustand singleton, so it survives navigation.
 *   3. Navigate to `/tasks/acme` (sidebar is rendered by the (app) route
 *      group's layout, not the (desktop) shell), open the stream-row
 *      dropdown, click Rename, type `acme-renamed`, submit.
 *   4. The StreamRow handler navigates to `/tasks/acme-renamed` after the
 *      rename action returns — wait for that URL, then walk back to
 *      `/acme-renamed` (desktop view) to capture the window state.
 *
 * The exercise is intentionally non-asserting: the artifact set
 * (dom-*.html + screenshots/*.png + network.jsonl + logs.jsonl + console.jsonl)
 * is the evidence Ralphie greps. If #24 is fixed, the final desktop snapshot
 * shows a chat window cleanly bound to `acme-renamed`. If not, the snapshot
 * shows stale references to `acme` (or no window at all if the rebind
 * crashed) — either way, the directory is the bug report.
 *
 *   pnpm tsx scripts/exercise.ts \
 *     --root /tmp/exercise-rename \
 *     --script scripts/exercises/rename-stream.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'

import type { ExerciseContext } from '@/scripts/exercise'

const OLD_SLUG = 'acme'
const NEW_SLUG = 'acme-renamed'

export async function run({
  page,
  dump,
  root,
  baseUrl,
}: ExerciseContext): Promise<void> {
  // 1. Pre-seed the stream directory. createStream() (lib/actions/streams.ts)
  //    materialises `<slug>/specs/` and `<slug>/samples/` — the same shape
  //    any sidebar-listed stream has on disk. We mirror that here rather
  //    than calling the action so we don't depend on the create-stream UI.
  const streamDir = path.join(root, OLD_SLUG)
  await fs.mkdir(path.join(streamDir, 'specs'), { recursive: true })
  await fs.mkdir(path.join(streamDir, 'samples'), { recursive: true })

  // 2. Open the desktop view. Empty stream + no playbook trips the
  //    auto-open path in StreamPanelView, materialising a chat window.
  await page.goto(`${baseUrl}/${OLD_SLUG}`)
  await page.waitForLoadState('domcontentloaded')

  // The chat window's title bar renders the constant string "Chat with Q".
  // Waiting on that text confirms the window mounted.
  await page.waitForSelector('text=Chat with Q', { timeout: 15_000 })
  await dump('before-rename')

  // 3. Move to the task-list route, where GlobalSidebar is mounted.
  //    DesktopShell does not render the sidebar — that lives under (app).
  await page.goto(`${baseUrl}/tasks/${OLD_SLUG}`)
  await page.waitForLoadState('domcontentloaded')

  const trigger = page.getByRole('button', {
    name: `Stream actions for ${OLD_SLUG}`,
  })
  await trigger.waitFor({ state: 'attached', timeout: 10_000 })
  // The wrapper has `opacity-0` until hover/focus-within; the button is
  // still in the layout and dispatches pointer events. Hover first to
  // ensure the dropdown stays visible after click.
  await trigger.hover()
  await trigger.click()

  await page.getByRole('menuitem', { name: /rename/i }).click()
  // HeadlessUI's <Dialog> wrapper div has children that are `position: fixed`
  // — its own bounding box is 0×0, so `getByRole('dialog').waitFor({state:
  // 'visible'})` fails Playwright's visibility check even when the dialog is
  // open. Wait on the autofocused input the dialog mounts instead.
  const input = page.locator(`input[data-autofocus][value="${OLD_SLUG}"]`)
  await input.waitFor({ state: 'visible', timeout: 5_000 })
  await input.fill(NEW_SLUG)
  await dump('rename-dialog')
  // The Input is controlled — fill() updates state, React re-renders the
  // input with a new `value` attribute, and the original locator becomes
  // stale. The input still has focus, so dispatch Enter on the keyboard
  // directly to submit the form.
  await page.keyboard.press('Enter')

  // The StreamRow handler pushes /tasks/<newSlug> when the user is
  // viewing the renamed stream. Pre-navigate confirms the rename action
  // round-tripped end-to-end.
  await page.waitForURL(new RegExp(`/tasks/${NEW_SLUG}$`), { timeout: 15_000 })
  await dump('after-rename')

  // 4. Walk back to the desktop. If #24 is fixed, the chat window in
  //    windowStore rebinds to acme-renamed; if not, its meta.streamName
  //    still says acme and any chat action will hit the (now-missing)
  //    old slug. Either outcome is recorded by the artifact set.
  await page.goto(`${baseUrl}/${NEW_SLUG}`)
  await page.waitForLoadState('domcontentloaded')
  // Same window-mount sentinel as before — confirms a chat window is
  // live on the new desktop, regardless of which slug it points at.
  await page
    .waitForSelector('text=Chat with Q', { timeout: 15_000 })
    .catch(() => {
      // Don't throw — the absence of a chat window is itself evidence
      // for the artifact reader. dump() below captures whatever's there.
    })
  await dump('back-on-renamed-desktop')
}
