'use client'

import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

export function PlaybookSection({
  playbookBody,
  onOpen,
}: {
  playbookBody: string | null
  onOpen: () => void
}) {
  if (!playbookBody) {
    return (
      <div className="px-2 pt-1 pb-3">
        <button
          type="button"
          onClick={onOpen}
          className="w-full px-2 text-left text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          + Write playbook...
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-0 px-2 pt-1 pb-3">
      <button
        type="button"
        onClick={onOpen}
        className="group relative block w-full cursor-pointer rounded-md px-2 py-1 text-left transition-colors hover:bg-zinc-950/5"
      >
        <div className="max-h-[12rem] overflow-hidden">
          <div
            className="prose prose-slate prose-q"
            style={
              {
                '--pq-px': '0px',
                '--pq-max-width': 'none',
                '--pq-font-size': '13px',
                '--pq-p-my': '0.5em',
              } as React.CSSProperties
            }
          >
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw, rehypeSanitize]}
            >
              {playbookBody}
            </Markdown>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-md bg-gradient-to-t from-white to-transparent transition-opacity group-hover:from-zinc-100 group-hover:opacity-90" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 shadow-sm ring-1 ring-zinc-950/5">
            Open Playbook
          </span>
        </div>
      </button>
    </div>
  )
}
