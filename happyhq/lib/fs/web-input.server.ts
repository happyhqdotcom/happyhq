import path from 'node:path'

import { writeTextFile } from './write.server'

/**
 * Slugify a string: lowercase, replace non-alphanumeric runs with hyphens, trim hyphens.
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Extract the first `# heading` from markdown content.
 * Returns null if no heading is found.
 */
function extractHeading(content: string): string | null {
  const match = content.match(/^#\s+(.+)$/m)
  return match ? match[1].trim() : null
}

/**
 * Derive a page slug from WebFetch content and URL.
 * Prefers the first `# heading`; falls back to URL pathname.
 */
function pageSlug(content: string, url: URL): string {
  const heading = extractHeading(content)
  if (heading) {
    const slug = slugify(heading)
    if (slug) return slug
  }

  // Fallback: slugify URL pathname (strip leading slash, take meaningful segments)
  const pathname = url.pathname.replace(/\/$/, '') // strip trailing slash
  const slug = slugify(pathname)
  return slug || 'page'
}

/**
 * Persist a WebFetch result as a markdown file in the task's inputs/web/ directory.
 *
 * File structure:
 *   {taskDir}/inputs/web/{domain-slug}/{page-slug}.md
 *
 * Returns the file path relative to taskDir, or null if content/url is invalid.
 * Idempotent: same URL + content heading produces the same file path (overwritten).
 */
export async function persistWebInput(
  taskDir: string,
  rawUrl: string,
  content: string,
): Promise<string | null> {
  if (!content?.trim() || !rawUrl?.trim()) return null

  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return null
  }

  const domainSlug = slugify(url.hostname)
  if (!domainSlug) return null

  const page = pageSlug(content, url)
  const relativePath = path.join('inputs', 'web', domainSlug, `${page}.md`)
  const filePath = path.join(taskDir, relativePath)

  const frontmatter = [
    '---',
    `url: ${rawUrl}`,
    `fetched: ${new Date().toISOString()}`,
    '---',
    '',
  ].join('\n')

  await writeTextFile(filePath, frontmatter + content)
  return relativePath
}
