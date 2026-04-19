'use client'

import { displayTitle } from '@/lib/format'
import type { SampleEntry, SampleType } from '@/lib/fs/types'
import { FolderOpen } from 'lucide-react'

export function SamplesSection({
  sampleTypes,
  samples,
  onBrowse,
}: {
  sampleTypes: SampleType[]
  samples: SampleEntry[]
  onBrowse: () => void
}) {
  const totalCount = samples.length

  return (
    <div className="flex flex-col gap-0.5 px-2 py-3">
      <div className="mb-1 flex items-center px-2">
        <h3 className="flex-1 text-sm font-medium text-zinc-500">
          Samples
          {totalCount > 0 && (
            <span className="ml-1.5 text-xs font-normal text-zinc-400">
              {totalCount}
            </span>
          )}
        </h3>
        <button
          type="button"
          onClick={onBrowse}
          className="text-xs text-zinc-400 transition-colors hover:text-zinc-600"
        >
          Browse all
        </button>
      </div>

      {sampleTypes.map((type) => {
        const count = samples.filter((s) => s.category === type.slug).length
        return (
          <button
            key={type.slug}
            type="button"
            onClick={onBrowse}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-950/5"
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            <span className="min-w-0 flex-1 truncate">
              {displayTitle(type.title, type.slug)}
            </span>
            <span className="text-xs text-zinc-400">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
