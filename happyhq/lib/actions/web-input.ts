'use server'

import path from 'node:path'

import { assertSafeTaskSlug, taskPath } from '@/lib/fs/paths'
import { ensureDirectory, writeTextFile } from '@/lib/fs/write.server'
import { commitGitState } from '@/lib/git/sync.server'
import { log } from '@/lib/log.server'

/**
 * Slugify a string for use in file paths.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Save a URL as a web input on a task — just frontmatter with the link and
 * unfurl metadata. The agent can fetch full content later if needed.
 */
export async function addWebInput(
  taskSlug: string,
  url: string,
  unfurl?: {
    title: string | null
    description: string | null
    image: string | null
    favicon: string | null
  },
): Promise<{ path: string | null; error?: string }> {
  try {
    assertSafeTaskSlug(taskSlug)
  } catch {
    return { path: null, error: 'Invalid task slug' }
  }

  const normalizedUrl = url.match(/^https?:\/\//) ? url : `https://${url}`

  let hostname: string
  try {
    hostname = new URL(normalizedUrl).hostname
  } catch {
    return { path: null, error: 'Invalid URL' }
  }

  const domainSlug = slugify(hostname)
  if (!domainSlug) return { path: null, error: 'Invalid URL' }

  // Derive page slug from unfurl title or URL pathname
  const title = unfurl?.title?.trim()
  let pageSlug = title ? slugify(title) : ''
  if (!pageSlug) {
    const pathname = new URL(normalizedUrl).pathname.replace(/\/$/, '')
    pageSlug = slugify(pathname) || 'page'
  }

  const relativePath = path.join('inputs', 'web', domainSlug, `${pageSlug}.md`)
  const filePath = path.join(taskPath(taskSlug), relativePath)

  // Build frontmatter-only file
  const lines = [
    '---',
    `url: ${normalizedUrl}`,
    `saved: ${new Date().toISOString()}`,
  ]
  const yamlEscape = (s: string) =>
    s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  if (title) lines.push(`title: "${yamlEscape(title)}"`)
  if (unfurl?.description)
    lines.push(`description: "${yamlEscape(unfurl.description)}"`)
  if (unfurl?.image) lines.push(`image: ${unfurl.image}`)
  if (unfurl?.favicon) lines.push(`favicon: ${unfurl.favicon}`)
  lines.push('---', '')

  await ensureDirectory(path.dirname(filePath))
  await writeTextFile(filePath, lines.join('\n'))

  log('task.web_input_added', { task: taskSlug, url: normalizedUrl })
  commitGitState(`[tasks/${taskSlug}] Add web input`)

  return { path: relativePath }
}
