'use client'

import { useState } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

export function ReadOnlyDescription({
  description,
  className,
}: {
  description: string
  className?: string
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={`mt-[0.5px] ${className ?? ''}`}>
      <div className="relative">
        <div className={`overflow-hidden ${!expanded ? 'max-h-[10rem]' : ''}`}>
          <div
            className="prose prose-slate prose-q"
            style={
              {
                '--pq-px': '0px',
                '--pq-max-width': 'none',
                '--pq-font-size': '14px',
                '--pq-p-my': '0.5em',
              } as React.CSSProperties
            }
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
            >
              {description}
            </Markdown>
          </div>
        </div>
        {!expanded && description.length > 300 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-transparent" />
        )}
      </div>
      {description.length > 300 && (
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-1 cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}
