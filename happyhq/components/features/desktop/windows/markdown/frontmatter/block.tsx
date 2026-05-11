'use client'

import {
  Calendar,
  CheckSquare,
  Flag,
  GitBranch,
  Globe,
  Hash,
  Paperclip,
  Tag,
  User,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { formatRelativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface FrontmatterBlockProps {
  fields: Record<string, string>
}

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
  assignee: 'Assignee',
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
  status: CheckSquare,
  pending: CheckSquare,
  priority: Flag,
  mode: Workflow,
  owner: User,
  assignee: User,
  stream: GitBranch,
  streamSlug: GitBranch,
  task: CheckSquare,
  taskSlug: CheckSquare,
  source: Globe,
  url: Globe,
  language: Globe,
  attachments: Paperclip,
  sourceCount: Hash,
  createdAt: Calendar,
  completedAt: Calendar,
  startedAt: Calendar,
  updatedAt: Calendar,
  fetched: Calendar,
}

const NUMBER_KEYS = new Set(['attachments', 'sourceCount'])
const PERSON_KEYS = new Set(['owner', 'assignee'])
const TAG_KEYS = new Set(['status', 'pending', 'mode', 'priority'])

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

const PERSON_PALETTES = [
  'bg-emerald-100 text-emerald-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-pink-100 text-pink-700',
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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase() || name.charAt(0).toUpperCase()
}

function ValueOf({ keyName, value }: { keyName: string; value: string }) {
  if (keyName === 'url' || keyName === 'source') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="truncate text-blue-700 hover:underline"
      >
        {value.replace(/^https?:\/\/(www\.)?/, '')}
      </a>
    )
  }
  if (keyName in SLUG_KIND) {
    return <span className="truncate font-mono text-[12.5px]">{value}</span>
  }
  if (ISO_DATE_RE.test(value)) {
    return (
      <span className="truncate" title={formatAbsoluteDate(value)}>
        {formatAbsoluteDate(value)}
        <span className="ml-2 text-zinc-400">· {relativeOrIso(value)}</span>
      </span>
    )
  }
  if (TAG_KEYS.has(keyName)) {
    const style = TAG_STYLES[value.toLowerCase()] ?? DEFAULT_TAG_STYLE
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] leading-none font-medium',
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
      <span className="inline-flex items-center gap-2">
        <span
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
            paletteFor(value),
          )}
        >
          {initials(value)}
        </span>
        <span className="truncate">{value}</span>
      </span>
    )
  }
  if (NUMBER_KEYS.has(keyName)) {
    return <span className="font-medium tabular-nums">{value}</span>
  }
  return <span className="truncate">{value}</span>
}

function LabelCell({ Icon, label }: { Icon: LucideIcon; label: string }) {
  // Inline-block icon + vertical-align middle aligns the icon's geometric
  // center to the text's baseline + x-height/2 (true optical center). The
  // text span gets a 1px translateY because the eye reads x-height midline
  // as slightly higher than what `vertical-align: middle` computes.
  return (
    <div className="flex h-full items-center border-r border-zinc-100 bg-zinc-50 px-3 py-2 font-medium text-zinc-500">
      <div className="truncate leading-none">
        <Icon
          className="mr-2 inline-block size-3.5 align-middle"
          strokeWidth={1.5}
        />
        <span className="inline-block translate-y-px align-middle">
          {label}
        </span>
      </div>
    </div>
  )
}

export function FrontmatterBlock({ fields }: FrontmatterBlockProps) {
  const entries = Object.entries(fields).filter(([k]) => k !== 'title')
  if (entries.length === 0) return null

  return (
    <div
      className="not-prose"
      style={{
        marginLeft: 'calc(1rem - var(--pq-px))',
        marginRight: 'calc(-1 * var(--pq-px))',
      }}
    >
      {entries.map(([key, value], i) => {
        const Icon =
          ICON_FOR_KEY[key] ?? (ISO_DATE_RE.test(value) ? Calendar : Tag)
        const label = KNOWN_LABELS[key] ?? camelToTitle(key)
        return (
          <div
            key={key}
            className={cn(
              'group grid min-h-[36px] items-stretch text-[13px] transition-colors hover:bg-zinc-50/50',
              i > 0 && 'border-t border-zinc-100',
            )}
            style={{ gridTemplateColumns: '180px minmax(0, 1fr)' }}
          >
            <LabelCell Icon={Icon} label={label} />
            <div className="flex min-w-0 items-center truncate px-3 py-2 text-zinc-900">
              <ValueOf keyName={key} value={value} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
