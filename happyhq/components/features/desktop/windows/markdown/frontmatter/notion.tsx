'use client'

import {
  AtSign,
  Calendar,
  CheckSquare,
  Globe,
  Hash,
  ListTodo,
  Sparkles,
  Tag,
  Type,
  type LucideIcon,
} from 'lucide-react'

import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

import type { FrontmatterRendererProps } from './types'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

const KNOWN_LABELS: Record<string, string> = {
  createdAt: 'Created',
  completedAt: 'Completed',
  startedAt: 'Started',
  updatedAt: 'Updated',
  fetched: 'Fetched',
  streamSlug: 'Stream',
  stream: 'Stream',
  taskSlug: 'Task',
  task: 'Task',
  status: 'Status',
  pending: 'Pending',
  mode: 'Mode',
  url: 'Source',
  source: 'Source',
  title: 'Title',
  owner: 'Owner',
  priority: 'Priority',
  attachments: 'Attachments',
  sourceCount: 'Sources',
  language: 'Language',
}

const SLUG_KIND: Record<string, 'stream' | 'task'> = {
  streamSlug: 'stream',
  stream: 'stream',
  taskSlug: 'task',
  task: 'task',
}

const ICON_FOR_KEY: Record<string, LucideIcon> = {
  createdAt: Calendar,
  completedAt: Calendar,
  startedAt: Calendar,
  updatedAt: Calendar,
  fetched: Calendar,
  streamSlug: Hash,
  stream: Hash,
  taskSlug: ListTodo,
  task: ListTodo,
  status: Tag,
  pending: CheckSquare,
  mode: Sparkles,
  url: Globe,
  source: Globe,
  title: Type,
  owner: AtSign,
  priority: Tag,
}

const NUMBER_KEYS = new Set(['attachments', 'sourceCount'])
const PERSON_KEYS = new Set(['owner', 'assignee'])
const TAG_KEYS = new Set(['status', 'pending', 'mode', 'priority'])

// Status / tag colour: pill bg, pill text, and the leading dot (saturated).
interface TagStyle {
  pill: string
  dot: string
}

const TAG_STYLES: Record<string, TagStyle> = {
  completed: { pill: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
  working: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  planning: { pill: 'bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  plan_ready: { pill: 'bg-violet-50 text-violet-700', dot: 'bg-violet-500' },
  stopped: { pill: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' },
  pending: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  high: { pill: 'bg-rose-50 text-rose-700', dot: 'bg-rose-500' },
  medium: { pill: 'bg-amber-50 text-amber-700', dot: 'bg-amber-500' },
  low: { pill: 'bg-zinc-100 text-zinc-600', dot: 'bg-zinc-400' },
}

const DEFAULT_TAG_STYLE: TagStyle = {
  pill: 'bg-zinc-100 text-zinc-700',
  dot: 'bg-zinc-400',
}

// Six muted accent palettes for the person initial badge, deterministically
// picked from the value so the same name always gets the same colour.
const PERSON_PALETTES = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
]

function camelToTitle(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (s) => s.toUpperCase())
}

function relativeOrIso(iso: string): string {
  try {
    return `${formatRelativeTime(iso)} ago`
  } catch {
    return iso
  }
}

function formatAbsoluteDate(iso: string): string {
  try {
    const d = new Date(iso)
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
  } catch {
    return iso
  }
}

function paletteFor(seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return PERSON_PALETTES[Math.abs(hash) % PERSON_PALETTES.length]
}

function ValueOf({ keyName, value }: { keyName: string; value: string }) {
  if (keyName === 'url' || keyName === 'source') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-zinc-700 hover:underline"
      >
        {value.replace(/^https?:\/\/(www\.)?/, '')}
      </a>
    )
  }
  if (keyName in SLUG_KIND) {
    const kind = SLUG_KIND[keyName]
    return (
      <a
        href={`/${kind}/${value}`}
        className="-mx-1 truncate rounded px-1 text-zinc-700 transition-colors hover:bg-white"
      >
        {value}
      </a>
    )
  }
  if (ISO_DATE_RE.test(value)) {
    return (
      <span title={formatAbsoluteDate(value)} className="text-zinc-700">
        {relativeOrIso(value)}
      </span>
    )
  }
  if (TAG_KEYS.has(keyName)) {
    const style = TAG_STYLES[value.toLowerCase()] ?? DEFAULT_TAG_STYLE
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] font-medium',
          style.pill,
        )}
      >
        <span className={cn('size-1.5 rounded-full', style.dot)} />
        {value.replace(/_/g, ' ')}
      </span>
    )
  }
  if (PERSON_KEYS.has(keyName)) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
            paletteFor(value),
          )}
        >
          {value.charAt(0).toUpperCase()}
        </span>
        <span className="text-zinc-700">{value}</span>
      </span>
    )
  }
  if (NUMBER_KEYS.has(keyName)) {
    return (
      <span className="font-medium text-zinc-700 tabular-nums">{value}</span>
    )
  }
  return <span className="truncate text-zinc-700">{value}</span>
}

export function FrontmatterBlockNotion({ fields }: FrontmatterRendererProps) {
  const entries = Object.entries(fields)
  if (entries.length === 0) return null

  return (
    <div className="not-prose flex flex-col">
      {entries.map(([key, value]) => {
        const Icon =
          ICON_FOR_KEY[key] ?? (ISO_DATE_RE.test(value) ? Calendar : Tag)
        const label = KNOWN_LABELS[key] ?? camelToTitle(key)
        return (
          <div
            key={key}
            className="group -mx-1.5 grid items-center gap-x-2 rounded px-1.5 py-1.5 text-[13px] transition-colors duration-100 hover:bg-zinc-100"
            style={{ gridTemplateColumns: '8.5rem minmax(0, 1fr)' }}
          >
            <div className="flex min-w-0 items-center gap-2">
              <Icon
                className="size-4 shrink-0 text-zinc-400"
                strokeWidth={1.75}
              />
              <span className="truncate text-zinc-500">{label}</span>
            </div>
            <div className="flex min-w-0 items-center">
              <ValueOf keyName={key} value={value} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
