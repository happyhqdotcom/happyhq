// Streams Group
// Searchable list of all streams — reused in both palette (as page) and quick open (inline)

'use client'

import { displayTitle, formatRelativeTime } from '@/lib/format'
import { useCommandMenuStore } from '@/stores/commandMenuStore'
import { useStreams } from '@/stores/streamsStore'
import { Waves } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { CommandMenuGroup, CommandMenuItem } from '../atoms'

/**
 * Renders streams as a group with heading.
 * Used as a top-level group in quick open and as the streams page in the palette.
 */
export function StreamsGroup() {
  const streams = useStreams()
  const router = useRouter()
  const close = useCommandMenuStore((s) => s.close)

  return (
    <CommandMenuGroup heading="Streams">
      {streams.map((stream) => (
        <CommandMenuItem
          key={stream.name}
          id={`stream-${stream.name}`}
          label={displayTitle(stream.title, stream.name)}
          icon={Waves}
          action={formatRelativeTime(stream.createdAt)}
          iconColor="ghost"
          keywords={[stream.name, stream.title ?? ''].filter(Boolean)}
          onSelect={() => {
            router.push(`/${encodeURIComponent(stream.name)}`)
            close()
          }}
        />
      ))}
    </CommandMenuGroup>
  )
}
