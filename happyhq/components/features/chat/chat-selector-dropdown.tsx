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
import { Check, ChevronDown, Trash2 } from 'lucide-react'

export interface ChatSelectorChat {
  sessionId: string
  label: string
  group?: string
}

interface ChatSelectorDropdownProps {
  chats: ChatSelectorChat[]
  currentSessionId: string | null
  label: string
  onSelect: (sessionId: string) => void
  onDelete: (sessionId: string) => void
}

function ChatItem({
  chat,
  isCurrent,
  onSelect,
  onDelete,
}: {
  chat: ChatSelectorChat
  isCurrent: boolean
  onSelect: () => void
  onDelete: () => void
}) {
  return (
    <DropdownItem onClick={onSelect} className="group/item">
      {isCurrent ? (
        <Check data-slot="icon" className="text-zinc-400" />
      ) : (
        <span data-slot="icon" />
      )}
      <DropdownLabel className="min-w-0 truncate">{chat.label}</DropdownLabel>
      <div
        role="button"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="col-start-5 flex aspect-square w-5 items-center justify-center rounded-md text-zinc-400 opacity-0 transition-colors group-data-focus/item:opacity-100 hover:bg-zinc-300/60 hover:text-zinc-600 [&>svg]:size-3.5"
        aria-label="Delete chat"
      >
        <Trash2 />
      </div>
    </DropdownItem>
  )
}

export function ChatSelectorDropdown({
  chats,
  currentSessionId,
  label,
  onSelect,
  onDelete,
}: ChatSelectorDropdownProps) {
  const hasGroups = chats.some((c) => c.group)
  const ungrouped = chats.filter((c) => !c.group)
  const grouped = chats.filter((c) => c.group)

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-zinc-800 transition-colors select-none focus:outline-none data-hover:bg-black/5 data-hover:text-black"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="h-3 w-3 shrink-0 text-black/30" />
      </DropdownButton>
      <DropdownMenu
        anchor="bottom start"
        className="z-1010 max-h-72! max-w-80! min-w-48"
      >
        {hasGroups ? (
          <>
            {ungrouped.length > 0 && (
              <DropdownSection>
                <DropdownHeading>This stream</DropdownHeading>
                {ungrouped.map((c) => (
                  <ChatItem
                    key={c.sessionId}
                    chat={c}
                    isCurrent={c.sessionId === currentSessionId}
                    onSelect={() => onSelect(c.sessionId)}
                    onDelete={() => onDelete(c.sessionId)}
                  />
                ))}
              </DropdownSection>
            )}
            {ungrouped.length > 0 && grouped.length > 0 && <DropdownDivider />}
            {grouped.length > 0 && (
              <DropdownSection>
                <DropdownHeading>All chats</DropdownHeading>
                {grouped.map((c) => (
                  <ChatItem
                    key={c.sessionId}
                    chat={c}
                    isCurrent={c.sessionId === currentSessionId}
                    onSelect={() => onSelect(c.sessionId)}
                    onDelete={() => onDelete(c.sessionId)}
                  />
                ))}
              </DropdownSection>
            )}
          </>
        ) : (
          chats.map((c) => (
            <ChatItem
              key={c.sessionId}
              chat={c}
              isCurrent={c.sessionId === currentSessionId}
              onSelect={() => onSelect(c.sessionId)}
              onDelete={() => onDelete(c.sessionId)}
            />
          ))
        )}
      </DropdownMenu>
    </Dropdown>
  )
}
