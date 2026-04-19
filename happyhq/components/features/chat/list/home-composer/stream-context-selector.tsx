'use client'

import {
  Dropdown,
  DropdownButton,
  DropdownDivider,
  DropdownHeading,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
  DropdownSection,
} from '@/components/common/catalyst/dropdown'
import { displayTitle } from '@/lib/format'
import type { StreamEntry } from '@/lib/fs/types'
import { Check, ChevronDown } from 'lucide-react'

interface StreamContextSelectorProps {
  streams: StreamEntry[]
  selectedStream: string | null
  onSelect: (slug: string | null) => void
  disabled?: boolean
}

export function StreamContextSelector({
  streams,
  selectedStream,
  onSelect,
  disabled = false,
}: StreamContextSelectorProps) {
  const selected = streams.find((s) => s.name === selectedStream)
  const tail = selected
    ? displayTitle(selected.title, selected.name)
    : selectedStream
      ? displayTitle(null, selectedStream)
      : 'something new'

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        disabled={disabled}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        className="inline-flex h-9 items-center gap-1 rounded-full px-2.5 text-[13px] text-zinc-400 transition-colors select-none focus:outline-none disabled:pointer-events-none disabled:opacity-50 data-hover:bg-black/5 data-hover:text-zinc-600"
      >
        Work on <span className="text-zinc-600">{tail}</span>
        <ChevronDown className="h-3 w-3 opacity-50" />
      </DropdownButton>
      <DropdownMenu anchor="bottom start" className="z-1010 min-w-48">
        {streams.length > 0 && (
          <DropdownSection>
            <DropdownHeading>Recents</DropdownHeading>
            {streams.map((stream) => (
              <DropdownItem
                key={stream.name}
                onClick={() => onSelect(stream.name)}
              >
                {selectedStream === stream.name ? (
                  <Check data-slot="icon" />
                ) : (
                  <span data-slot="icon" />
                )}
                <DropdownLabel>
                  {displayTitle(stream.title, stream.name)}
                </DropdownLabel>
              </DropdownItem>
            ))}
          </DropdownSection>
        )}

        {streams.length > 0 && <DropdownDivider />}

        <DropdownItem onClick={() => onSelect(null)}>
          {selectedStream === null ? (
            <Check data-slot="icon" />
          ) : (
            <span data-slot="icon" />
          )}
          <DropdownLabel>Something new</DropdownLabel>
        </DropdownItem>
      </DropdownMenu>
    </Dropdown>
  )
}
