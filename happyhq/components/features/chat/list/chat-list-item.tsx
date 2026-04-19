'use client'

import Link from 'next/link'

import { formatRelativeTime, formatSlug } from '@/lib/format'
import type { ChatItem } from '@/lib/fs/types'
import { MessageCircle } from 'lucide-react'

export function ChatListItem({ item }: { item: ChatItem }) {
  const title = item.title ?? 'Untitled chat'
  const time = formatRelativeTime(item.createdAt)
  const streamLabel = item.streamName ? formatSlug(item.streamName) : null

  return (
    <Link
      href={`/chat/${item.sessionId}`}
      className="group hover:bg-sidebar-accent flex items-center gap-3 rounded-lg p-2 transition-colors"
    >
      {/* Icon */}
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white ring ring-zinc-950/10">
        <MessageCircle className="size-3.5 fill-[oklch(0.9_0.058_28/.6)] stroke-[oklch(0.795_0.115_28)]" />
      </span>

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-sm font-normal text-zinc-900">
        {title}
      </span>

      {/* Stream label + time */}
      <div className="flex shrink-0 items-center gap-2">
        {streamLabel && (
          <span className="rounded bg-zinc-500/8 px-1.5 py-0.5 text-[10px]/3 font-medium text-zinc-500">
            {streamLabel}
          </span>
        )}
        <span className="text-muted-foreground/60 text-xs tabular-nums">
          {time}
        </span>
      </div>
    </Link>
  )
}
