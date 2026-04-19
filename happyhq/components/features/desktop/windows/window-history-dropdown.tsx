'use client'

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from '@/components/common/catalyst/dropdown'
import type { GitLogEntry } from '@/lib/git/log.server'
import { Check, Loader2 } from 'lucide-react'
import { useCallback, useState } from 'react'

export function WindowHistoryDropdown({
  filePath,
  activeLabel,
  activeHash,
  highlighted,
  onSelectVersion,
  onSelectCurrent,
}: {
  filePath: string
  activeLabel: string | null
  activeHash: string | null
  highlighted?: boolean
  onSelectVersion: (markdown: string, entry: GitLogEntry) => void
  onSelectCurrent: () => void
}) {
  const [entries, setEntries] = useState<GitLogEntry[]>([])
  const [dirty, setDirty] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const fetchHistory = useCallback(() => {
    if (loaded) return
    fetch(`/api/fs/file-history?path=${encodeURIComponent(filePath)}`)
      .then(
        (res) =>
          res.json() as Promise<{ entries: GitLogEntry[]; dirty: boolean }>,
      )
      .then(({ entries, dirty }) => {
        setEntries(entries)
        setDirty(dirty)
        setLoaded(true)
      })
      .catch(() => {
        setEntries([])
        setLoaded(true)
      })
  }, [filePath, loaded])

  // Reset when filePath changes
  const [prevPath, setPrevPath] = useState(filePath)
  if (filePath !== prevPath) {
    setPrevPath(filePath)
    setLoaded(false)
    setEntries([])
  }

  const handleSelect = useCallback(
    (entry: GitLogEntry) => {
      fetch(
        `/api/fs/file?path=${encodeURIComponent(filePath)}&ref=${encodeURIComponent(entry.hash)}`,
      )
        .then((res) => res.json() as Promise<{ content: string }>)
        .then(({ content }) => onSelectVersion(content, entry))
        .catch(() => {})
    },
    [filePath, onSelectVersion],
  )

  const isViewingHistory = activeHash != null
  const total = entries.length
  const activeIndex = isViewingHistory
    ? entries.findIndex((e) => e.hash === activeHash)
    : -1

  // When not viewing history and not dirty, the latest commit (index 0) is effectively active
  const effectiveActiveIndex =
    !isViewingHistory && loaded && !dirty ? 0 : activeIndex

  let label: string
  if (!isViewingHistory) {
    label = 'Current'
  } else if (loaded && activeIndex === 0) {
    label = 'Current'
  } else if (loaded && activeIndex > 0) {
    label = `Version ${total - activeIndex}`
  } else {
    label = activeLabel ?? 'Current'
  }

  /** Strip leading [scope/tag] prefix from commit subjects */
  const stripPrefix = (s: string) => s.replace(/^\[.*?\]\s*/, '')

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        className={`cursor-pointer rounded-sm px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 transition-colors duration-700 hover:bg-zinc-200 hover:text-zinc-700 ${highlighted ? 'bg-zinc-300/80' : 'bg-zinc-200/60'}`}
        aria-label="File version history"
        onClick={(e: React.MouseEvent) => {
          e.stopPropagation()
          fetchHistory()
        }}
      >
        {label}
      </DropdownButton>
      <DropdownMenu
        anchor="bottom start"
        className="z-100 w-100! [--anchor-max-height:14rem]"
      >
        {!loaded && (
          <DropdownItem disabled>
            <div className="col-span-full flex items-center gap-2 text-xs text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading versions...
            </div>
          </DropdownItem>
        )}
        {isViewingHistory && dirty && (
          <DropdownItem onClick={onSelectCurrent}>
            <div className="col-span-full flex w-full items-baseline justify-between gap-3 text-xs font-medium text-zinc-900">
              <span>Current</span>
              <span className="shrink-0 text-[10px] text-zinc-400">now</span>
            </div>
          </DropdownItem>
        )}
        {entries.map((entry, i) => {
          const isActive = i === effectiveActiveIndex
          const version = total - i
          return (
            <DropdownItem key={entry.hash} onClick={() => handleSelect(entry)}>
              <div
                className={`col-span-full flex w-full items-center justify-between gap-3 text-xs ${
                  isActive ? 'font-medium text-zinc-900' : 'text-zinc-700'
                }`}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0 text-zinc-400">v{version}</span>
                  <span className="truncate">{stripPrefix(entry.subject)}</span>
                </span>
                {isActive ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-zinc-900" />
                ) : (
                  <span className="shrink-0 text-[10px] text-zinc-400">
                    {entry.date}
                  </span>
                )}
              </div>
            </DropdownItem>
          )
        })}
      </DropdownMenu>
    </Dropdown>
  )
}
