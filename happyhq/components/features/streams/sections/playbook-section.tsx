'use client'

import { writePlaybookBody } from '@/lib/actions'
import { invalidateStream } from '@/lib/swr-helpers'
import { useEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'

export function PlaybookSection({
  playbookBody,
  streamSlug,
  onOpen,
}: {
  playbookBody: string | null
  streamSlug: string
  onOpen: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(playbookBody ?? '')
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Flush pending save on unmount
  useEffect(() => {
    return () => clearTimeout(timerRef.current)
  }, [])

  // Auto-focus textarea when entering edit mode
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus()
      // Place cursor at end
      const len = textareaRef.current.value.length
      textareaRef.current.setSelectionRange(len, len)
    }
  }, [editing])

  const handleChange = (value: string) => {
    setBody(value)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      await writePlaybookBody(streamSlug, value)
      invalidateStream(streamSlug)
    }, 500)
  }

  const handleBlur = () => {
    setEditing(false)
    // Flush any pending save immediately
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = undefined
      writePlaybookBody(streamSlug, body).then(() =>
        invalidateStream(streamSlug),
      )
    }
  }

  // Empty state — show textarea with placeholder
  if (!playbookBody && !editing) {
    return (
      <div className="px-2 pt-1 pb-3">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full px-2 text-left text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          + Write playbook...
        </button>
      </div>
    )
  }

  // Editing mode — textarea
  if (editing) {
    return (
      <div className="px-2 pt-1 pb-3">
        <div className="px-2">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => handleChange(e.target.value)}
            onBlur={handleBlur}
            rows={8}
            className="w-full resize-none rounded-lg bg-transparent text-[13px] leading-relaxed text-zinc-600 outline-none placeholder:text-zinc-400"
            placeholder="Write your playbook..."
          />
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full px-2 pt-2"
        >
          <span className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600">
            Open Playbook
          </span>
        </button>
      </div>
    )
  }

  // Read mode — rendered preview, click to edit
  return (
    <div className="px-2 pt-1 pb-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="relative w-full cursor-pointer px-2 text-left"
      >
        <div className="max-h-[12rem] overflow-hidden rounded-lg">
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
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent" />
      </button>
      <button type="button" onClick={onOpen} className="flex w-full px-2 pt-2">
        <span className="text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-600">
          Open Playbook
        </span>
      </button>
    </div>
  )
}
