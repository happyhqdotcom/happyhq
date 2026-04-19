'use client'

import type { GitLogEntry } from '@/lib/git/log.server'
import type { GitStatusEntry } from '@/lib/git/status.server'
import { fetcher } from '@/lib/swr'
import { useStreamSlug } from '@/stores/desktopStore'
import { useParams } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import useSWR from 'swr'

type Scope = 'task' | 'stream' | 'all'

export function GitLogContent() {
  const streamSlug = useStreamSlug()
  const activeTaskSlug = useParams<{ task?: string }>().task

  // Determine the deepest available scope based on navigation context
  const maxScope: Scope = activeTaskSlug
    ? 'task'
    : streamSlug
      ? 'stream'
      : 'all'

  const [scopeOverride, setScopeOverride] = useState<Scope | null>(null)

  // Reset override when navigation context changes to something narrower
  const scope = scopeOverride ?? maxScope

  const cycleScope = useCallback(() => {
    const order: Scope[] =
      maxScope === 'task'
        ? ['task', 'stream', 'all']
        : maxScope === 'stream'
          ? ['stream', 'all']
          : ['all']
    const current = scope
    const idx = order.indexOf(current)
    const next = order[(idx + 1) % order.length]
    setScopeOverride(next)
  }, [maxScope, scope])

  const params = useMemo(() => {
    const p = new URLSearchParams()
    if (scope === 'task' && streamSlug && activeTaskSlug) {
      p.set('stream', streamSlug)
      p.set('task', activeTaskSlug)
    } else if (scope === 'stream' && streamSlug) {
      p.set('stream', streamSlug)
    }
    return p.toString()
  }, [scope, streamSlug, activeTaskSlug])

  const { data, isLoading } = useSWR<GitLogEntry[]>(
    `/api/git/log?${params}`,
    fetcher,
    { refreshInterval: 10_000 },
  )

  const { data: statusData } = useSWR<GitStatusEntry[]>(
    '/api/git/status',
    fetcher,
    { refreshInterval: 10_000 },
  )

  const dirtyFiles = statusData ?? []
  const [showDirty, setShowDirty] = useState(false)

  const entries = data ?? []

  const scopeLabel =
    scope === 'task'
      ? `[${streamSlug}/${activeTaskSlug}]`
      : scope === 'stream'
        ? `[${streamSlug}]`
        : 'all'

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-900">
      {/* Status bar */}
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] text-white/40">
            Commits: {entries.length}
          </span>
          {dirtyFiles.length > 0 && (
            <button
              type="button"
              onClick={() => setShowDirty((v) => !v)}
              className="cursor-pointer font-mono text-[10px] text-amber-400/60 underline decoration-amber-400/20 underline-offset-2 hover:text-amber-400/80"
            >
              {dirtyFiles.length} dirty
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={cycleScope}
          className="cursor-pointer font-mono text-[10px] text-white/40 underline decoration-white/20 underline-offset-2 hover:text-white/60"
        >
          {scopeLabel}
        </button>
      </div>

      {/* Dirty files */}
      {showDirty && dirtyFiles.length > 0 && (
        <div className="border-b border-white/10 px-3 py-2 font-mono text-xs">
          {dirtyFiles.map((f) => (
            <div
              key={f.path}
              className="flex items-baseline gap-2 py-0.5 text-white/60"
            >
              <span className="shrink-0 text-[10px] text-red-400/70">
                {f.status}
              </span>
              <span className="min-w-0 truncate">{f.path}</span>
            </div>
          ))}
        </div>
      )}

      {/* Log list */}
      <div className="flex-1 overflow-y-auto p-3 font-mono text-xs text-white/90">
        {isLoading ? (
          <div className="py-2 text-center text-white/30">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="py-2 text-center text-white/30">No commits yet</div>
        ) : (
          <div className="space-y-0.5">
            {entries.map((entry) => (
              <div
                key={entry.hash}
                className="flex items-baseline gap-2 rounded px-1.5 py-1 hover:bg-white/5"
              >
                <span className="shrink-0 text-[10px] text-amber-400/60">
                  {entry.hash}
                </span>
                <span className="min-w-0 truncate text-white/70">
                  <CommitSubject subject={entry.subject} scope={scope} />
                </span>
                <span className="ml-auto shrink-0 text-[10px] text-white/25">
                  {entry.date}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** Highlights [stream/task] prefixes as tags — hidden when scoped (redundant). */
function CommitSubject({ subject, scope }: { subject: string; scope: Scope }) {
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
        <span className="rounded bg-emerald-500/20 px-1 py-0.5 text-[10px] text-emerald-400">
          done
        </span>
      )}{' '}
      {scope === 'all' && (
        <>
          <span className="rounded bg-white/10 px-1 py-0.5 text-[10px] text-white/50">
            {prefix}
          </span>{' '}
        </>
      )}
      {rest}
    </>
  )
}
