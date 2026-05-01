import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Page } from 'playwright'

import { createDump } from './dump'

// Minimal Page stand-in — dump() only calls page.content() and page.screenshot().
function makeFakePage(html: string) {
  const screenshotCalls: Array<{ path: string; fullPage: boolean }> = []
  const page = {
    content: vi.fn(async () => html),
    screenshot: vi.fn(async (opts: { path: string; fullPage?: boolean }) => {
      screenshotCalls.push({ path: opts.path, fullPage: !!opts.fullPage })
      // Write a tiny placeholder so callers can see the file exists if they look.
      await fs.writeFile(opts.path, 'PNG-PLACEHOLDER', 'utf8')
    }),
  }
  return { page: page as unknown as Page, screenshotCalls }
}

describe('createDump', () => {
  let exDir: string

  beforeEach(async () => {
    exDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dump-test-'))
  })

  afterEach(async () => {
    await fs.rm(exDir, { recursive: true, force: true })
  })

  it('writes dom.html when called with no name', async () => {
    const { page, screenshotCalls } = makeFakePage('<html>final</html>')
    const dump = createDump(page, exDir)

    await dump()

    const written = await fs.readFile(path.join(exDir, 'dom.html'), 'utf8')
    expect(written).toBe('<html>final</html>')
    expect(screenshotCalls).toHaveLength(0)
  })

  it('writes dom-<name>.html and screenshots/<name>.png when named', async () => {
    const { page, screenshotCalls } = makeFakePage('<html>step-one</html>')
    const dump = createDump(page, exDir)

    await dump('after-send')

    const html = await fs.readFile(
      path.join(exDir, 'dom-after-send.html'),
      'utf8',
    )
    expect(html).toBe('<html>step-one</html>')
    expect(screenshotCalls).toEqual([
      {
        path: path.join(exDir, 'screenshots', 'after-send.png'),
        fullPage: true,
      },
    ])
    // The screenshot path's parent dir must exist by the time playwright writes.
    const shotsStat = await fs.stat(path.join(exDir, 'screenshots'))
    expect(shotsStat.isDirectory()).toBe(true)
  })

  it('rejects a name containing path separators', async () => {
    const { page } = makeFakePage('<html>x</html>')
    const dump = createDump(page, exDir)

    await expect(dump('foo/bar')).rejects.toThrow('Invalid dump name')
  })

  it('rejects a name with parent traversal', async () => {
    const { page } = makeFakePage('<html>x</html>')
    const dump = createDump(page, exDir)

    await expect(dump('..')).rejects.toThrow('Invalid dump name')
  })
})
