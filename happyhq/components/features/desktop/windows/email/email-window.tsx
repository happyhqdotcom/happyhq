'use client'

import type { EmailMetadata } from '@/lib/eml/types'
import { useWindowStore } from '@/stores/windowStore'
import { Loader2, Paperclip } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { WindowComponentProps } from '../types'
import { useFrameProps } from '../use-frame-props'
import { WindowFileActions } from '../window-file-actions'
import { WindowFrame } from '../window-frame'

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

function HeaderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline border-b border-zinc-100 last:border-b-0">
      <span className="w-14 shrink-0 px-4 py-2 text-xs text-zinc-400">
        {label}
      </span>
      <span className="py-2 text-sm text-zinc-700">{value}</span>
    </div>
  )
}

/** Render body text with [text](url) markdown links and bare URLs as clickable. */
function LinkedBody({ body }: { body: string }) {
  // Match markdown links [text](url) or bare URLs
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|(https?:\/\/[^\s]+)/g
  const elements: React.ReactNode[] = []
  let lastIndex = 0
  let match

  while ((match = pattern.exec(body)) !== null) {
    if (match.index > lastIndex) {
      elements.push(body.slice(lastIndex, match.index))
    }
    const text = match[1] || match[3]
    const url = match[2] || match[3]
    elements.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline hover:text-blue-800"
      >
        {text}
      </a>,
    )
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < body.length) {
    elements.push(body.slice(lastIndex))
  }

  return <>{elements}</>
}

export function EmailWindow({
  id,
  canvasRef,
  openFileWindow,
}: WindowComponentProps) {
  const result = useFrameProps(id, canvasRef)
  const [email, setEmail] = useState<EmailMetadata | null>(null)
  const [loading, setLoading] = useState(true)

  const w = result?.window
  const jsonPath = w?.contentType === 'email' ? w.meta.jsonPath : undefined
  const dirPath = w?.contentType === 'email' ? w.meta.dirPath : undefined

  useEffect(() => {
    if (!jsonPath) return
    // Show the spinner immediately while the new fetch resolves — the
    // canonical fetch-then-update shape.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch(`/api/fs/file?path=${encodeURIComponent(jsonPath)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<{ content: string }>
      })
      .then(({ content }) => {
        const data = JSON.parse(content) as EmailMetadata
        setEmail(data)
        // Update window title to the subject line
        useWindowStore.getState().windows.find((win) => win.id === id)
          ?.title !== data.subject &&
          useWindowStore.setState((s) => ({
            windows: s.windows.map((win) =>
              win.id === id ? { ...win, title: data.subject } : win,
            ),
          }))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [jsonPath, id])

  if (!result) return null
  const { frameProps } = result
  if (!w || w.contentType !== 'email') return null

  return (
    <WindowFrame
      title={w.title}
      {...frameProps}
      actions={<WindowFileActions filePath={w.meta.jsonPath} />}
    >
      {loading || !email ? (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-zinc-300" />
        </div>
      ) : (
        <div className="flex h-full flex-col overflow-hidden">
          {/* Header — minimal like Claude's email view */}
          <div className="shrink-0 border-b border-zinc-200">
            {email.from && <HeaderRow label="From" value={email.from} />}
            {email.to && <HeaderRow label="To" value={email.to} />}
            {email.cc && <HeaderRow label="CC" value={email.cc} />}
            {email.date && (
              <HeaderRow label="Date" value={formatDate(email.date)} />
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-zinc-700">
              <LinkedBody body={email.body} />
            </pre>
          </div>

          {/* Attachments */}
          {email.attachments.length > 0 && (
            <div className="shrink-0 border-t border-zinc-200 px-4 py-2.5">
              <div className="flex flex-wrap gap-1.5">
                {email.attachments.map((filename) => (
                  <button
                    key={filename}
                    type="button"
                    onClick={() => {
                      if (!dirPath) return
                      const filePath = `${dirPath}/${filename}`
                      openFileWindow({
                        name: filename,
                        path: filePath,
                      })
                    }}
                    className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-2.5 py-1.5 text-xs text-zinc-600 transition-colors hover:bg-zinc-200"
                  >
                    <Paperclip className="h-3 w-3 text-zinc-400" />
                    {filename}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </WindowFrame>
  )
}
