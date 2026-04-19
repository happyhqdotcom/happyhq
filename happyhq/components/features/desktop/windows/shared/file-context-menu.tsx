'use client'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/common/ui/context-menu'
import { AppWindow, FolderOpen, Trash2 } from 'lucide-react'
import React, { useState } from 'react'

/**
 * Generic right-click context menu wrapper for file rows.
 *
 * Standard items (Open, Reveal in Finder, Delete) are rendered automatically
 * based on the props provided. Pass window-specific items via `extraContent`.
 */
export function FileContextMenu({
  children,
  filePath,
  onDelete,
  extraContent,
}: {
  children: React.ReactNode
  filePath: string
  onDelete?: () => Promise<void>
  extraContent?: React.ReactNode
}) {
  const [menuKey, setMenuKey] = useState(0)

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (!open) setMenuKey((k) => k + 1)
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="z-[1100]">
        <React.Fragment key={menuKey}>
          {extraContent}
          {extraContent && <ContextMenuSeparator />}
          <ContextMenuItem
            onSelect={() => {
              fetch('/api/fs/open', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath }),
              })
            }}
          >
            <AppWindow data-slot="icon" />
            Open on Desktop
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              fetch('/api/fs/reveal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: filePath }),
              })
            }}
          >
            <FolderOpen data-slot="icon" />
            Reveal in Finder
          </ContextMenuItem>
          {onDelete && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 data-slot="icon" />
                Delete
              </ContextMenuItem>
            </>
          )}
        </React.Fragment>
      </ContextMenuContent>
    </ContextMenu>
  )
}
