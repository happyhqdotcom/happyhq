'use client'

import {
  Calendar,
  CheckSquare,
  ExternalLink,
  Flag,
  GitBranch,
  Globe,
  Hash,
  ListChecks,
  Paperclip,
  Tag,
  User,
  Users,
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
  assignees: 'Assignees',
  progress: 'Progress',
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
  assignees: Users,
  progress: ListChecks,
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

// ISO 639-1 → display name. Falls back to the raw value if not listed.
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  fr: 'French',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  zh: 'Chinese',
  ko: 'Korean',
  ru: 'Russian',
  nl: 'Dutch',
  ar: 'Arabic',
}

// Catalyst-style tag colours: tinted bg at /15 opacity + 700-weight text.
// Mirrors the archive's Badge palette so frontmatter pills feel native to HQ.
const TAG_STYLES: Record<string, string> = {
  completed: 'bg-emerald-500/15 text-emerald-700 inset-ring-emerald-700/10',
  working: 'bg-amber-500/15 text-amber-700 inset-ring-amber-700/10',
  planning: 'bg-sky-500/15 text-sky-700 inset-ring-sky-700/10',
  plan_ready: 'bg-violet-500/15 text-violet-700 inset-ring-violet-700/10',
  stopped: 'bg-zinc-500/15 text-zinc-700 inset-ring-zinc-700/10',
  pending: 'bg-amber-500/15 text-amber-700 inset-ring-amber-700/10',
  high: 'bg-rose-500/15 text-rose-700 inset-ring-rose-700/10',
  medium: 'bg-amber-500/15 text-amber-700 inset-ring-amber-700/10',
  low: 'bg-zinc-500/15 text-zinc-700 inset-ring-zinc-700/10',
}

const DEFAULT_TAG_STYLE = 'bg-zinc-500/15 text-zinc-700 inset-ring-zinc-700/10'

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

function slugHref(keyName: string, value: string): string {
  return SLUG_KIND[keyName] === 'stream' ? `/${value}` : `/task/${value}`
}

function ValueOf({ keyName, value }: { keyName: string; value: string }) {
  if (keyName === 'url' || keyName === 'source') {
    return (
      <a
        href={value}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-w-0 items-center gap-1 text-blue-600 hover:underline"
      >
        <span className="truncate">
          {value.replace(/^https?:\/\/(www\.)?/, '')}
        </span>
        <ExternalLink
          className="size-3 shrink-0 text-blue-400"
          strokeWidth={1.75}
        />
      </a>
    )
  }
  if (keyName in SLUG_KIND) {
    return (
      <a
        href={slugHref(keyName, value)}
        className="inline-flex max-w-full items-center rounded-md bg-indigo-50 px-1.5 py-0.5 font-medium text-indigo-700 shadow-xs inset-ring-1 inset-ring-indigo-700/15 transition-all hover:bg-indigo-100 hover:text-indigo-800 hover:inset-ring-indigo-700/25"
      >
        <span className="truncate">{value}</span>
      </a>
    )
  }
  if (ISO_DATE_RE.test(value)) {
    return (
      <span
        className="inline-flex min-w-0 items-center gap-1.5"
        title={formatAbsoluteDate(value)}
      >
        <span className="shrink-0">{formatAbsoluteDate(value)}</span>
        <span
          className="size-[3px] shrink-0 rounded-full bg-zinc-300"
          aria-hidden="true"
        />
        <span className="truncate text-zinc-400">{relativeOrIso(value)}</span>
      </span>
    )
  }
  if (TAG_KEYS.has(keyName)) {
    const style = TAG_STYLES[value.toLowerCase()] ?? DEFAULT_TAG_STYLE
    return (
      <span
        className={cn(
          'inline-flex items-center rounded-md px-1.5 py-0.5 text-[12px] leading-5 font-medium inset-ring-1',
          style,
        )}
      >
        {value.replace(/_/g, ' ')}
      </span>
    )
  }
  if (PERSON_KEYS.has(keyName)) {
    // Avatar flush inside the pill (archive's scheduled-digest recipient
    // pattern): the circle sits at the pill's rounded-full left edge with
    // just 2px of inner padding, reading as one unified chip.
    return (
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white py-0.5 pr-2 pl-0.5 font-medium text-zinc-800 shadow-xs inset-ring-1 inset-ring-zinc-950/10">
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
  if (keyName === 'language') {
    const label = LANGUAGE_NAMES[value.toLowerCase()] ?? value
    return (
      <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[12px] leading-5 font-medium text-zinc-700 inset-ring-1 inset-ring-zinc-950/6">
        {label}
      </span>
    )
  }
  if (keyName === 'assignees') {
    const names = value
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean)
    return (
      <span className="inline-flex min-w-0 items-center">
        <span className="flex">
          {names.map((name, idx) => (
            <span
              key={name}
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white',
                paletteFor(name),
                idx > 0 && '-ml-1.5',
              )}
            >
              {initials(name)}
            </span>
          ))}
        </span>
        <span className="ml-2 truncate text-zinc-500">{names.join(', ')}</span>
      </span>
    )
  }
  if (keyName === 'progress') {
    const m = value.match(/^(\d+)\s*\/\s*(\d+)$/)
    if (m) {
      const done = parseInt(m[1], 10)
      const total = parseInt(m[2], 10)
      const pct = total > 0 ? Math.min(100, (done / total) * 100) : 0
      return (
        <span className="inline-flex items-center gap-2.5">
          <span className="relative h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200/70 inset-ring-1 inset-ring-zinc-950/5">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
              style={{ width: `${pct}%` }}
            />
          </span>
          <span className="text-[12px] text-zinc-500 tabular-nums">
            {done}/{total}
          </span>
        </span>
      )
    }
  }
  if (NUMBER_KEYS.has(keyName)) {
    return <span className="tabular-nums">{value}</span>
  }
  return <span className="truncate">{value}</span>
}

function LabelCell({ Icon, label }: { Icon: LucideIcon; label: string }) {
  // Inline-block icon + vertical-align middle aligns the icon's geometric
  // center to the text's baseline + x-height/2 (true optical center). The
  // text span gets a 1px translateY because the eye reads x-height midline
  // as slightly higher than what `vertical-align: middle` computes.
  return (
    <div className="flex h-full items-center border-x border-zinc-100 bg-zinc-50 px-3 py-2 font-medium text-zinc-500">
      <div className="algin-middle flex items-center truncate leading-5">
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
    <div className="not-prose">
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
            <div className="flex min-w-0 items-center border-r border-zinc-100 px-3 py-2 leading-5 text-zinc-900">
              <div className="min-w-0 translate-y-px truncate">
                <ValueOf keyName={key} value={value} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
