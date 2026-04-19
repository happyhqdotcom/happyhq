'use client'

import type { GitLogEntry } from '@/lib/git/log.server'
import { Search } from 'lucide-react'
import { useState } from 'react'

const PAGE_SIZE = 10

export function ActivityTimeline({ entries }: { entries: GitLogEntry[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [search, setSearch] = useState('')

  // Client-side search filter
  const filtered = search.trim()
    ? entries.filter((e) =>
        e.subject.toLowerCase().includes(search.trim().toLowerCase()),
      )
    : entries

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  return (
    <div>
      {/* Search input */}
      <div className="py-3">
        <div className="-mx-2 flex items-center rounded-lg bg-zinc-100 px-3 py-2 ring-1 ring-transparent transition-shadow focus-within:ring-zinc-300 dark:bg-white/10 dark:focus-within:ring-white/20">
          <Search className="mr-2 size-4 shrink-0 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history..."
            className="min-w-0 grow bg-transparent py-0 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-200"
          />
        </div>
      </div>

      {/* Timeline entries */}
      {filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">
          {search.trim() ? 'No matching activity' : 'No activity yet'}
        </p>
      ) : (
        <div className="divide-y divide-zinc-950/5">
          {shown.map((entry) => (
            <div
              key={entry.hash}
              className="flex items-baseline gap-2 py-2 text-sm"
            >
              <span className="shrink-0 font-mono text-xs text-zinc-400">
                {entry.hash}
              </span>
              <span className="min-w-0 truncate text-zinc-700">
                <CommitSubject subject={entry.subject} />
              </span>
              <span className="ml-auto shrink-0 text-xs text-zinc-400">
                {entry.date}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <div className="border-t border-zinc-950/5 py-3 text-center">
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE_SIZE)}
            className="cursor-pointer text-sm font-medium text-zinc-500 hover:text-zinc-700"
          >
            Show more
          </button>
        </div>
      )}
    </div>
  )
}

/** Highlights [stream/task] prefixes as badges and [done] in green. */
function CommitSubject({ subject }: { subject: string }) {
  const match = subject.match(/^(\[.*?\])\s*(.*)$/)
  if (!match) return <>{subject}</>

  const prefix = match[1]
  let rest = match[2]

  // Detect and extract [done] from anywhere in the remaining text
  const isDone = rest.includes('[done]')
  if (isDone) rest = rest.replace(/\s*\[done\]\s*/, ' ').trim()

  return (
    <>
      {isDone && (
        <span className="rounded bg-emerald-100 px-1 py-0.5 text-xs text-emerald-700">
          done
        </span>
      )}{' '}
      <span className="rounded bg-zinc-100 px-1 py-0.5 text-xs text-zinc-500">
        {prefix}
      </span>{' '}
      {rest}
    </>
  )
}
