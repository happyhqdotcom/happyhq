import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/common/catalyst/dropdown'
import { displayTitle } from '@/lib/format'
import type { StreamEntry } from '@/lib/fs/types'
import { ChevronDown, Waves } from 'lucide-react'

const defaultClass =
  'inline-flex items-center gap-1.5 rounded border border-zinc-950/10 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-950/2.5 disabled:opacity-50'

const ghostClass =
  'flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-black/40 transition-colors hover:bg-black/5 hover:text-black/60 cursor-pointer disabled:opacity-50'

export function StreamPicker({
  streams,
  selected,
  onSelect,
  disabled,
  variant = 'default',
  label: labelOverride,
}: {
  streams: StreamEntry[]
  selected: string | null
  onSelect: (slug: string | null) => void
  disabled: boolean
  variant?: 'default' | 'ghost'
  label?: string
}) {
  const selectedEntry = streams.find((s) => s.name === selected)
  const label = labelOverride
    ? labelOverride
    : selectedEntry
      ? displayTitle(selectedEntry.title, selectedEntry.name)
      : 'Assign to'

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        disabled={disabled}
        className={variant === 'ghost' ? ghostClass : defaultClass}
      >
        <Waves className="size-3" />
        {label}
        <ChevronDown className="size-2.5 opacity-50" />
      </DropdownButton>
      <DropdownMenu anchor="bottom start" className="min-w-40">
        {selected && (
          <DropdownItem onClick={() => onSelect(null)}>
            <DropdownLabel>None</DropdownLabel>
          </DropdownItem>
        )}
        {streams.map((stream) => (
          <DropdownItem key={stream.name} onClick={() => onSelect(stream.name)}>
            <DropdownLabel>
              {displayTitle(stream.title, stream.name)}
            </DropdownLabel>
          </DropdownItem>
        ))}
      </DropdownMenu>
    </Dropdown>
  )
}
