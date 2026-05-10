'use client'

import React from 'react'

import { formatRelativeTime } from '@/lib/format'

import type { FrontmatterRendererProps } from './types'

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/

const DATE_KEYS = new Set([
  'createdAt',
  'completedAt',
  'startedAt',
  'updatedAt',
  'fetched',
])

const SLUG_KEYS: Record<
  string,
  { label: string; href: (slug: string) => string }
> = {
  streamSlug: { label: 'Stream', href: (s) => `/stream/${s}` },
  stream: { label: 'Stream', href: (s) => `/stream/${s}` },
  taskSlug: { label: 'Task', href: (s) => `/task/${s}` },
  task: { label: 'Task', href: (s) => `/task/${s}` },
}

const URL_KEYS = new Set(['url', 'source'])

const STATUS_KEYS = new Set(['status', 'pending', 'mode'])

const DATE_LABELS: Record<string, string> = {
  createdAt: 'Created',
  completedAt: 'Completed',
  startedAt: 'Started',
  updatedAt: 'Updated',
  fetched: 'Fetched',
}

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

function isDate(key: string, value: string): boolean {
  return DATE_KEYS.has(key) || ISO_DATE_RE.test(value)
}

interface Fact {
  key: string
  node: React.ReactNode
}

export function FrontmatterBlockMinimal({ fields }: FrontmatterRendererProps) {
  const entries = Object.entries(fields)
  if (entries.length === 0) return null

  // Source/URL is given its own dedicated line above the byline.
  const sourceEntry = entries.find(([k]) => URL_KEYS.has(k))

  const facts: Fact[] = []
  for (const [key, value] of entries) {
    if (URL_KEYS.has(key)) continue

    if (isDate(key, value)) {
      const label = DATE_LABELS[key] ?? camelToTitle(key)
      facts.push({
        key,
        node: (
          <span title={value}>
            <span className="text-zinc-400">{label}</span>{' '}
            <span>{relativeOrIso(value)}</span>
          </span>
        ),
      })
      continue
    }

    if (key in SLUG_KEYS) {
      const meta = SLUG_KEYS[key]
      facts.push({
        key,
        node: (
          <span>
            <span className="text-zinc-400">{meta.label}</span>{' '}
            <a
              href={meta.href(value)}
              className="text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
            >
              {value}
            </a>
          </span>
        ),
      })
      continue
    }

    if (STATUS_KEYS.has(key)) {
      facts.push({
        key,
        node: (
          <span>
            <span className="text-zinc-400">{camelToTitle(key)}</span>{' '}
            <span className="font-medium text-zinc-700">
              {value.replace(/_/g, ' ')}
            </span>
          </span>
        ),
      })
      continue
    }

    facts.push({
      key,
      node: (
        <span>
          <span className="text-zinc-400">{camelToTitle(key)}</span>{' '}
          <span>{value}</span>
        </span>
      ),
    })
  }

  if (!sourceEntry && facts.length === 0) return null

  return (
    <div className="not-prose mb-5 space-y-1 text-xs text-zinc-500">
      {sourceEntry && (
        <div className="truncate">
          <span className="text-zinc-400">Source </span>
          <a
            href={sourceEntry[1]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-700 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-500"
          >
            {sourceEntry[1]}
          </a>
        </div>
      )}
      {facts.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {facts.map((fact, i) => (
            <React.Fragment key={fact.key}>
              {i > 0 && <span className="text-zinc-300">·</span>}
              {fact.node}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
