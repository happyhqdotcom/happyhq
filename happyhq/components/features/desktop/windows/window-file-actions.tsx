'use client'

import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from '@/components/common/catalyst/dropdown'
import { Copy, Download, Ellipsis, FileText, FolderOpen } from 'lucide-react'
import { useCallback } from 'react'

export function WindowFileActions({
  filePath,
  content,
  rawPath,
  onViewRaw,
  showingRaw,
}: {
  filePath: string
  content?: string
  rawPath?: string
  onViewRaw?: (rawPath: string) => void
  showingRaw?: boolean
}) {
  const handleCopy = useCallback(async () => {
    if (content) await navigator.clipboard.writeText(content)
  }, [content])

  const handleDownload = useCallback(() => {
    window.open(
      `/api/fs/download?path=${encodeURIComponent(filePath)}`,
      '_blank',
    )
  }, [filePath])

  const handleReveal = useCallback(async () => {
    await fetch('/api/fs/reveal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: filePath }),
    })
  }, [filePath])

  return (
    <Dropdown>
      <DropdownButton
        as="button"
        className="flex h-5 w-5 items-center justify-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
        aria-label="File actions"
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <Ellipsis className="h-3.5 w-3.5" />
      </DropdownButton>
      <DropdownMenu anchor="bottom end" className="z-100">
        {content != null && (
          <DropdownItem onClick={handleCopy}>
            <Copy data-slot="icon" />
            <DropdownLabel>Copy</DropdownLabel>
          </DropdownItem>
        )}
        <DropdownItem onClick={handleDownload}>
          <Download data-slot="icon" />
          <DropdownLabel>Download</DropdownLabel>
        </DropdownItem>
        <DropdownItem onClick={handleReveal}>
          <FolderOpen data-slot="icon" />
          <DropdownLabel>Reveal in Finder</DropdownLabel>
        </DropdownItem>
        {rawPath && onViewRaw && (
          <DropdownItem onClick={() => onViewRaw(rawPath)}>
            <FileText data-slot="icon" />
            <DropdownLabel>
              {showingRaw ? 'View PDF' : 'View Raw Text'}
            </DropdownLabel>
          </DropdownItem>
        )}
      </DropdownMenu>
    </Dropdown>
  )
}
