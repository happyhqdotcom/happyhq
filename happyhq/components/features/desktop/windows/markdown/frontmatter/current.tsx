'use client'

import React from 'react'

import type { FrontmatterRendererProps } from './types'

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

export function FrontmatterBlockCurrent({ fields }: FrontmatterRendererProps) {
  const url = fields.url
  const fetched = fields.fetched

  const otherFields = Object.entries(fields).filter(
    ([k]) => k !== 'url' && k !== 'fetched',
  )
  if (!url && !fetched && otherFields.length === 0) return null

  return (
    <div className="not-prose border-zinc-150 mb-3 grid grid-cols-[4rem_1fr] gap-x-2 gap-y-1 rounded-lg border bg-zinc-50/80 px-3 py-2.5 text-xs text-zinc-500">
      {url && (
        <>
          <span className="font-medium text-zinc-400">Source</span>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-w-0 truncate text-blue-600 hover:underline"
          >
            {url}
          </a>
        </>
      )}
      {fetched && (
        <>
          <span className="font-medium text-zinc-400">Fetched</span>
          <span>{formatDate(fetched)}</span>
        </>
      )}
      {otherFields.map(([key, value]) => (
        <React.Fragment key={key}>
          <span className="font-medium text-zinc-400">{key}</span>
          <span className="min-w-0 truncate">{value}</span>
        </React.Fragment>
      ))}
    </div>
  )
}
