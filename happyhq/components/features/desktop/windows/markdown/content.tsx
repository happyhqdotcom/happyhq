'use client'

import { Loader2 } from 'lucide-react'
import React, { memo } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

interface MarkdownWindowContentProps {
  markdown: string
  loading?: boolean
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

/** Format an ISO timestamp to a short readable date. */
function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

/** Render frontmatter fields as a styled metadata block. */
function FrontmatterBlock({ fields }: { fields: Record<string, string> }) {
  const url = fields.url
  const fetched = fields.fetched

  // Skip rendering if no meaningful fields
  const otherFields = Object.entries(fields).filter(
    ([k]) => k !== 'url' && k !== 'fetched',
  )
  if (!url && !fetched && otherFields.length === 0) return null

  return (
    <div className="not-prose border-zinc-150 mb-3 grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 rounded-lg border bg-zinc-50/80 px-3 py-2.5 text-xs text-zinc-500">
      {url && (
        <>
          <span className="font-medium text-zinc-400">Source</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-blue-600 hover:underline"
          >
            {url}
          </a>
        </>
      )}
      {fetched && (
        <>
          <span className="font-medium text-zinc-400">Fetched</span>
          <span>{formatDate(fetched)}</span>
        </>
      )}
      {otherFields.map(([key, value]) => (
        <React.Fragment key={key}>
          <span className="font-medium text-zinc-400">{key}</span>
          <span className="min-w-0 truncate">{value}</span>
        </React.Fragment>
      ))}
    </div>
  )
}

export const MarkdownWindowContent = memo(function MarkdownWindowContent({
  markdown,
  loading,
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
          className="prose prose-slate prose-q py-8"
          style={{ '--pq-px': '28px' } as React.CSSProperties}
        >
          {parsed && <FrontmatterBlock fields={parsed.fields} />}
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
