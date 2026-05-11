'use client'

import { Loader2 } from 'lucide-react'
import React, { memo, useCallback, useState } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

import { PanelToggleIcon } from '@/components/common/icons/panel-toggle-icon'

import { FrontmatterBlock } from './frontmatter/block'

const FRONTMATTER_COLLAPSE_THRESHOLD = 4

interface ParsedFrontmatter {
  fields: Record<string, string>
  body: string
}

/** Parse YAML frontmatter into key-value pairs. Returns null if no frontmatter. */
export function parseFrontmatter(markdown: string): ParsedFrontmatter | null {
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

export interface FrontmatterState {
  fields: Record<string, string> | null
  body: string
  collapsed: boolean
  collapsible: boolean
  toggle: () => void
}

/** Owns frontmatter parsing + collapse state. Called by window parents so the
 *  collapse toggle can live in WindowFrame's actions slot (chrome) while the
 *  block renders in the content slot (children). */
export function useFrontmatter(markdown: string): FrontmatterState {
  const parsed = parseFrontmatter(markdown)
  const [collapsed, setCollapsed] = useState(false)
  const toggle = useCallback(() => setCollapsed((c) => !c), [])
  const fields = parsed?.fields ?? null
  const body = parsed?.body ?? markdown
  const collapsible =
    !!fields && Object.keys(fields).length >= FRONTMATTER_COLLAPSE_THRESHOLD
  return { fields, body, collapsed, collapsible, toggle }
}

/** Icon button for the window header chrome that toggles frontmatter
 *  visibility. Render conditionally on `collapsible`. */
/** Reuses the playground's `PanelToggleIcon` (bounding rect + animated inner
 *  panel rect) rotated 90° clockwise so the inner panel reads as a top strip
 *  rather than a left rail — mirroring where the frontmatter sits in the
 *  document. Slides in/out when toggled. */
export function FrontmatterToggleAction({
  collapsed,
  onClick,
}: {
  collapsed: boolean
  onClick: () => void
}) {
  const [isHovered, setIsHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label={collapsed ? 'Show properties' : 'Hide properties'}
      className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600"
    >
      <span className="inline-flex rotate-90">
        <PanelToggleIcon
          isLocked={!collapsed}
          isHovered={isHovered}
          side="left"
        />
      </span>
    </button>
  )
}

interface MarkdownWindowContentProps {
  markdown: string
  loading?: boolean
  /** Optional frontmatter state from useFrontmatter. When omitted, the
   *  component parses + manages collapse internally (back-compat for callers
   *  that don't render a chrome toggle). */
  frontmatter?: FrontmatterState
}

export const MarkdownWindowContent = memo(function MarkdownWindowContent({
  markdown,
  loading,
  frontmatter,
}: MarkdownWindowContentProps) {
  // Always call the hook so React's hook count stays stable. The hook is
  // cheap (parse + useState) and only its result is used when `frontmatter`
  // isn't supplied externally.
  const internal = useFrontmatter(markdown)
  const fm = frontmatter ?? internal

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

  const showFrontmatter = fm.fields && !fm.collapsed

  return (
    <div className="relative h-full">
      <div className="absolute top-0 bottom-0 left-4 z-10 w-px bg-zinc-200/60" />
      <div
        className="h-full overflow-y-auto overscroll-none"
        style={{ contain: 'paint' }}
      >
        <div
          className={
            showFrontmatter
              ? 'prose prose-slate prose-q pb-5'
              : 'prose prose-slate prose-q py-5'
          }
          style={{ '--pq-px': '28px' } as React.CSSProperties}
        >
          {showFrontmatter && fm.fields && (
            <FrontmatterBlock fields={fm.fields} />
          )}
          {showFrontmatter && (
            <div
              className="not-prose mt-0 mb-5 border-t border-zinc-200/70"
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
            {fm.body}
          </Markdown>
        </div>
      </div>
    </div>
  )
})
