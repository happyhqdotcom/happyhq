'use client'

import { Loader2 } from 'lucide-react'
import React, { memo } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import { FrontmatterBlockCurrent } from './frontmatter/current'
import type { FrontmatterRenderer } from './frontmatter/types'

interface MarkdownWindowContentProps {
  markdown: string
  loading?: boolean
  /** Override the frontmatter renderer (used by the playground for variation previews). */
  frontmatterRenderer?: FrontmatterRenderer
}

/** Parse YAML frontmatter into key-value pairs. Returns null if no frontmatter. */
function parseFrontmatter(
  markdown: string,
): { fields: Record<string, string>; body: string } | null {
  if (!markdown.startsWith('---\n')) return null
  const endIdx = markdown.indexOf('\n---', 4)
  if (endIdx === -1) return null

  const yaml = markdown.slice(4, endIdx)
  const fields: Record<string, string> = {}
  for (const line of yaml.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue
    const key = line.slice(0, colonIdx).trim()
    const value = line.slice(colonIdx + 1).trim()
    if (key && value) fields[key] = value
  }
  const body = markdown.slice(endIdx + 4).replace(/^\n+/, '')
  return { fields, body }
}

export const MarkdownWindowContent = memo(function MarkdownWindowContent({
  markdown,
  loading,
  frontmatterRenderer: FrontmatterRendererImpl = FrontmatterBlockCurrent,
}: MarkdownWindowContentProps) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-black/30" />
      </div>
    )
  }

  if (!markdown) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-medium text-zinc-400">Nothing here</p>
      </div>
    )
  }

  const parsed = parseFrontmatter(markdown)
  const body = parsed ? parsed.body : markdown

  return (
    <div className="relative h-full">
      <div className="absolute top-0 bottom-0 left-4 z-10 w-px bg-zinc-200/60" />
      <div className="h-full overflow-y-auto" style={{ contain: 'paint' }}>
        <div
          className="prose prose-slate prose-q py-5"
          style={{ '--pq-px': '28px' } as React.CSSProperties}
        >
          {parsed && <FrontmatterRendererImpl fields={parsed.fields} />}
          {parsed && (
            <div
              className="not-prose mt-5 mb-6 border-t border-zinc-200/70"
              style={{
                marginLeft: 'calc(1rem - var(--pq-px))',
                marginRight: 'calc(-1 * var(--pq-px))',
              }}
            />
          )}
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw, rehypeSanitize]}
          >
            {body}
          </Markdown>
        </div>
      </div>
    </div>
  )
})
