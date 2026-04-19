'use client'

import { useEffect, useRef } from 'react'

import { usePlaygroundStore } from './playground-store'

function formatTimestamp(ts: number): string {
  const d = new Date(ts)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${h}:${m}:${s}.${ms}`
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return ''
  const str = args.map((a) => JSON.stringify(a)).join(', ')
  return str.length > 120 ? str.slice(0, 117) + '...' : str
}

export function EventLog() {
  const events = usePlaygroundStore((s) => s.events)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-400">
        No events yet
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto px-3 py-1.5 font-mono text-xs">
      {events.map((event, i) => (
        <div key={i} className="flex gap-2 py-px leading-5">
          <span className="shrink-0 text-zinc-300">
            {formatTimestamp(event.timestamp)}
          </span>
          <span className="text-zinc-700">{event.name}</span>
          {event.args.length > 0 && (
            <span className="truncate text-zinc-400">
              {formatArgs(event.args)}
            </span>
          )}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  )
}
