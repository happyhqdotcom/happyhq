// Command Menu Shell
// Composable shell — container, search, keyboard nav, page stack, footer.
// Content is provided by each composition (palette, quick open, etc.).

'use client'

import { cn } from '@/lib/utils'
import {
  useCommandMenuPage,
  useCommandMenuStore,
} from '@/stores/commandMenuStore'
import { Command as CommandPrimitive, defaultFilter } from 'cmdk'
import { ReactNode, useCallback, useEffect, useRef } from 'react'
import {
  CommandMenuContainer,
  CommandMenuFooter,
  CommandMenuFooterHints,
  CommandMenuHeader,
  CommandMenuHeaderIcon,
} from './atoms'

/**
 * Custom filter that searches against keywords
 */
function keywordFilter(
  value: string,
  search: string,
  keywords?: string[],
): number {
  if (!keywords || keywords.length === 0) {
    return defaultFilter(value, search)
  }
  return defaultFilter(keywords.join(' '), search)
}

interface CommandMenuShellProps {
  /** Header content rendered after the search input (e.g., action button) */
  headerAction?: ReactNode
  /** Called on keyboard events — compositions can extend keyboard handling */
  onKeyDown?: (e: React.KeyboardEvent) => void
  children: ReactNode
}

export function CommandMenuShell({
  headerAction,
  onKeyDown,
  children,
}: CommandMenuShellProps) {
  const isOpen = useCommandMenuStore((s) => s.isOpen)
  const search = useCommandMenuStore((s) => s.search)
  const setSearch = useCommandMenuStore((s) => s.setSearch)
  const close = useCommandMenuStore((s) => s.close)
  const popPage = useCommandMenuStore((s) => s.popPage)
  const page = useCommandMenuPage()

  const inputRef = useRef<HTMLInputElement>(null)

  // Refocus input when page changes
  useEffect(() => {
    if (page) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [page])

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Let compositions handle first
      onKeyDown?.(e)
      if (e.defaultPrevented) return

      // Escape: go back if on subpage, close if on root
      if (e.key === 'Escape') {
        e.preventDefault()
        if (page) {
          popPage()
        } else {
          close()
        }
      }
      // Backspace on empty search: go back to previous page
      if (e.key === 'Backspace' && !search && page) {
        e.preventDefault()
        popPage()
      }
      // ArrowLeft: go back to previous page
      if (e.key === 'ArrowLeft' && page) {
        e.preventDefault()
        popPage()
      }
    },
    [page, search, popPage, close, onKeyDown],
  )

  // Placeholder based on page
  const placeholder = getPlaceholder(page)

  return (
    <CommandMenuContainer isOpen={isOpen} onClose={close}>
      <CommandPrimitive
        className="flex flex-col"
        filter={keywordFilter}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <CommandMenuHeader>
          <CommandMenuHeaderIcon showBack={!!page} onBack={popPage} />
          <CommandPrimitive.Input
            ref={inputRef}
            autoFocus
            placeholder={placeholder}
            value={search}
            onValueChange={setSearch}
            className="w-full flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          {headerAction}
        </CommandMenuHeader>

        {/* Content area - fixed height */}
        <div
          className={cn(
            'mx-2 overflow-hidden rounded-xl border',
            'border-zinc-400/10 bg-zinc-400/5',
          )}
        >
          <div className="no-scrollbar h-80 scroll-py-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
        </div>

        {/* Footer */}
        <CommandMenuFooter>
          <CommandMenuFooterHints />
        </CommandMenuFooter>
      </CommandPrimitive>
    </CommandMenuContainer>
  )
}

function getPlaceholder(page: ReturnType<typeof useCommandMenuPage>): string {
  if (!page) return 'Search...'
  if (page.type === 'streams') return 'Search streams...'
  if (page.type === 'tasks') return 'Search tasks...'
  if (page.type === 'web-sources') return 'Search web sources...'
  if (page.type === 'url-input') {
    if (page.source === 'research-topic') return 'Enter a topic...'
    return 'Paste link...'
  }
  return 'Search...'
}
