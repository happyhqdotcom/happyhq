import fs from 'node:fs/promises'
import path from 'node:path'

import type { Page } from 'playwright'

import { assertSafePathSegment } from '@/lib/fs/paths'

export type DumpHelper = (name?: string) => Promise<void>

/**
 * Returns a `dump(name?)` closure bound to a Playwright page and an exercise
 * artifact directory. With no name it writes `<exDir>/dom.html` (the final
 * snapshot the harness calls automatically). With a name it writes
 * `<exDir>/dom-<name>.html` plus `<exDir>/screenshots/<name>.png` so an
 * exercise can capture intermediate states.
 *
 * `name` is validated by `assertSafePathSegment` so the interpolated filename
 * can't traverse out of `<exDir>`.
 */
export function createDump(page: Page, exDir: string): DumpHelper {
  return async function dump(name?: string): Promise<void> {
    const html = await page.content()
    if (!name) {
      await fs.writeFile(path.join(exDir, 'dom.html'), html, 'utf8')
      return
    }
    assertSafePathSegment(name, 'dump name')
    await fs.writeFile(path.join(exDir, `dom-${name}.html`), html, 'utf8')
    const shotsDir = path.join(exDir, 'screenshots')
    await fs.mkdir(shotsDir, { recursive: true })
    await page.screenshot({
      path: path.join(shotsDir, `${name}.png`),
      fullPage: true,
    })
  }
}
