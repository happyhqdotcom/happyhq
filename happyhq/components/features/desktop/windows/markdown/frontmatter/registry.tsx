'use client'

import React from 'react'

import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { FrontmatterRendererProps } from './types'

type FormatHint =
  | 'date'
  | 'relative-date'
  | 'slug-stream'
  | 'slug-task'
  | 'status'
  | 'url'
  | 'text'

const KEY_REGISTRY: Record<string, { label: string; format: FormatHint }> = {
  createdAt: { label: 'Created', format: 'relative-date' },
  completedAt: { label: 'Completed', format: 'relative-date' },
  startedAt: { label: 'Started', format: 'relative-date' },
  updatedAt: { label: 'Updated', format: 'relative-date' },
  fetched: { label: 'Fetched', format: 'relative-date' },
  streamSlug: { label: 'Stream', format: 'slug-stream' },
  taskSlug: { label: 'Task', format: 'slug-task' },
  stream: { label: 'Stream', format: 'slug-stream' },
  task: { label: 'Task', format: 'slug-task' },
  status: { label: 'Status', format: 'status' },
  pending: { label: 'Pending', format: 'status' },
  mode: { label: 'Mode', format: 'status' },
  url: { label: 'Source', format: 'url' },
  source: { label: 'Source', format: 'url' },
  title: { label: 'Title', format: 'text' },
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  working: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  planning: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  plan_ready: 'bg-violet-50 text-violet-700 ring-violet-600/20',
  stopped: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  true: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  false: 'bg-zinc-100 text-zinc-500 ring-zinc-500/20',
}

const DEFAULT_STATUS_STYLE = 'bg-zinc-100 text-zinc-600 ring-zinc-500/20'

function camelToTitle(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (s) => s.toUpperCase())
}

function formatAbsoluteDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function resolveFormat(key: string, value: string): FormatHint {
  const known = KEY_REGISTRY[key]?.format
  if (known) return known
  if (ISO_DATE_RE.test(value)) return 'relative-date'
  return 'text'
}

function StatusChip({ value }: { value: string }) {
  const style = STATUS_STYLES[value.toLowerCase()] ?? DEFAULT_STATUS_STYLE
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        style,
      )}
    >
      {value.replace(/_/g, ' ')}
    </span>
  )
}

function RelativeDate({ iso }: { iso: string }) {
  const absolute = formatAbsoluteDate(iso)
  const relative = (() => {
    try {
      return formatRelativeTime(iso)
    } catch {
      return null
    }
  })()
  return (
    <span title={iso}>
      {relative ? (
        <>
          <span className="text-zinc-700">{relative} ago</span>
          <span className="ml-1.5 text-zinc-400">· {absolute}</span>
        </>
      ) : (
        <span>{absolute}</span>
      )}
    </span>
  )
}

function SlugLink({ value, kind }: { value: string; kind: 'stream' | 'task' }) {
  const href = kind === 'stream' ? `/stream/${value}` : `/task/${value}`
  return (
    <a
      href={href}
      className="inline-flex max-w-full items-center gap-1 truncate text-zinc-700 hover:text-zinc-900 hover:underline"
    >
      <span className="text-zinc-400">{kind === 'stream' ? '#' : '›'}</span>
      <span className="truncate">{value}</span>
    </a>
  )
}

function ValueCell({ format, value }: { format: FormatHint; value: string }) {
  switch (format) {
    case 'url':
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 truncate text-blue-600 hover:underline"
        >
          {value}
        </a>
      )
    case 'relative-date':
      return <RelativeDate iso={value} />
    case 'date':
      return <span>{formatAbsoluteDate(value)}</span>
    case 'slug-stream':
      return <SlugLink value={value} kind="stream" />
    case 'slug-task':
      return <SlugLink value={value} kind="task" />
    case 'status':
      return <StatusChip value={value} />
    default:
      return <span className="min-w-0 truncate text-zinc-700">{value}</span>
  }
}

export function FrontmatterBlockRegistry({ fields }: FrontmatterRendererProps) {
  const entries = Object.entries(fields)
  if (entries.length === 0) return null

  return (
    <div className="not-prose mb-4 overflow-hidden rounded-lg border border-zinc-200 bg-white">
      <dl className="grid grid-cols-[7.5rem_1fr] gap-x-3 gap-y-2 px-4 py-3 text-xs">
        {entries.map(([key, value]) => {
          const label = KEY_REGISTRY[key]?.label ?? camelToTitle(key)
          const format = resolveFormat(key, value)
          return (
            <React.Fragment key={key}>
              <dt className="font-medium tracking-wide text-zinc-400 uppercase">
                {label}
              </dt>
              <dd className="min-w-0">
                <ValueCell format={format} value={value} />
              </dd>
            </React.Fragment>
          )
        })}
      </dl>
    </div>
  )
}
