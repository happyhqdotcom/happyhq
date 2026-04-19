import matter from 'gray-matter'
import path from 'node:path'

import { readTextFile } from './read.server'
import { writeTextFile } from './write.server'

export interface PlaybookFrontmatter {
  title: string
  createdAt?: string
  updatedAt?: string
}

/**
 * Parse raw playbook.md content into frontmatter + body.
 * Returns null if the content is missing, has no frontmatter, or lacks a title.
 */
export function parsePlaybookMd(
  raw: string,
): { frontmatter: PlaybookFrontmatter; body: string } | null {
  try {
    const { data, content } = matter(raw)

    if (!data.title || typeof data.title !== 'string') return null

    const frontmatter: PlaybookFrontmatter = {
      title: data.title,
    }

    if (data.createdAt) {
      frontmatter.createdAt =
        typeof data.createdAt === 'string'
          ? data.createdAt
          : new Date(data.createdAt).toISOString()
    }

    if (data.updatedAt) {
      frontmatter.updatedAt =
        typeof data.updatedAt === 'string'
          ? data.updatedAt
          : new Date(data.updatedAt).toISOString()
    }

    return { frontmatter, body: content.trim() }
  } catch {
    return null
  }
}

/**
 * Read playbook.md from a stream directory.
 * Returns null if the file is missing or has no parseable frontmatter.
 */
export async function readPlaybookMd(
  streamDir: string,
): Promise<{ frontmatter: PlaybookFrontmatter; body: string } | null> {
  const filePath = path.join(streamDir, 'playbook.md')
  const raw = await readTextFile(filePath)
  if (!raw) return null
  return parsePlaybookMd(raw)
}

/**
 * Write playbook.md to a stream directory.
 * Serializes frontmatter as YAML and body as markdown content.
 */
export async function writePlaybookMd(
  streamDir: string,
  frontmatter: PlaybookFrontmatter,
  body: string = '',
): Promise<void> {
  const filePath = path.join(streamDir, 'playbook.md')
  const content = matter.stringify(body ? `\n${body}\n` : '\n', frontmatter)
  await writeTextFile(filePath, content)
}
