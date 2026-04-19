'use client'

import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'
import { formatRelativeTime, formatSlug } from '@/lib/format'
import { CheckCircle2, CircleDot, Loader2, Search, XCircle } from 'lucide-react'
import { useMemo, useState } from 'react'

const PAGE_SIZE = 10

const STATUS_ICON: Record<string, React.ReactNode> = {
  completed: <CheckCircle2 className="size-4 text-emerald-400" />,
  running: <Loader2 className="size-4 animate-spin text-blue-400" />,
  failed: <XCircle className="size-4 text-red-400" />,
  aborted: <CircleDot className="size-4 text-zinc-300" />,
}

/** Format minutes as "9m 12s" for run-level precision. */
function formatDuration(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60)
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  if (m === 0) return `${s}s`
  if (s === 0) return `${m}m`
  return `${m}m ${s}s`
}

type TaskRun = {
  id: string
  stream: string
  task: string
  startedAt: string | number
  endedAt?: string | number
  minutes: number
  costUsd?: number
  status: string
}

export function RuntimeHistory() {
  const { user } = useCurrentUser()
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [search, setSearch] = useState('')

  const query = db?.useQuery(
    user
      ? {
          usage: {
            $: { where: { 'user.id': user.id } },
            taskRuns: {},
          },
        }
      : null,
  )

  const isLoading = query?.isLoading ?? true

  const allRuns = useMemo(() => {
    const usageRecords = query?.data?.usage ?? []
    const seen = new Set<string>()
    const runs: TaskRun[] = []

    for (const period of usageRecords) {
      const taskRuns = (period as unknown as { taskRuns: TaskRun[] }).taskRuns
      if (!taskRuns) continue
      for (const run of taskRuns) {
        if (!seen.has(run.id)) {
          seen.add(run.id)
          runs.push(run)
        }
      }
    }

    return runs.sort((a, b) => Number(b.startedAt) - Number(a.startedAt))
  }, [query?.data])

  const filtered = search.trim()
    ? allRuns.filter((run) => {
        const term = search.trim().toLowerCase()
        return (
          run.stream.toLowerCase().includes(term) ||
          run.task.toLowerCase().includes(term) ||
          run.status.toLowerCase().includes(term)
        )
      })
    : allRuns

  const shown = filtered.slice(0, visible)
  const hasMore = visible < filtered.length

  if (!db || !user) return null

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
            placeholder="Search runs..."
            className="min-w-0 grow bg-transparent py-0 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-200"
          />
        </div>
      </div>

      {/* Task run entries */}
      {isLoading ? (
        <div className="flex min-h-[200px] items-center justify-center">
          <Loader2 className="size-4 animate-spin text-zinc-300" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-4 text-center text-sm text-zinc-400">
          {search.trim() ? 'No matching runs' : 'No runtime history yet'}
        </p>
      ) : (
        <div className="divide-y divide-zinc-950/5">
          {shown.map((run) => (
            <div key={run.id} className="flex gap-2.5 py-3">
              <span className="mt-0.5 shrink-0">
                {STATUS_ICON[run.status] ?? (
                  <CircleDot className="size-4 text-zinc-300" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 items-baseline justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-950">
                    {run.task}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {formatSlug(run.stream)}
                    <span className="mx-1.5">·</span>
                    {formatRelativeTime(
                      new Date(Number(run.startedAt)).toISOString(),
                    )}{' '}
                    ago
                  </p>
                </div>
                <span className="ml-4 shrink-0 text-sm text-zinc-400 tabular-nums">
                  {run.endedAt ? formatDuration(run.minutes) : 'Running...'}
                </span>
              </div>
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
