'use client'

import { useState } from 'react'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

import { Hash } from 'lucide-react'

import { DeleteAlert } from '@/components/common/shared/delete-alert'
import {
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/common/ui/sidebar'
import { ItemDropdownMenu } from '@/components/features/sidebar/atoms/dropdown-menu'
import { NameInputDialog } from '@/components/features/sidebar/molecules/name-dialog'
import { deleteStream, renameStream } from '@/lib/actions/streams'
import { displayTitle } from '@/lib/format'
import type { StreamEntry } from '@/lib/fs/types'
import { invalidateStream } from '@/lib/swr-helpers'
import { useStreamsMutate } from '@/stores/streamsStore'

interface StreamRowProps {
  stream: StreamEntry
  isActive: boolean
  attentionCount: number
}

export function StreamRow({
  stream,
  isActive,
  attentionCount,
}: StreamRowProps) {
  const router = useRouter()
  const pathname = usePathname()
  const mutateStreams = useStreamsMutate()
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const label = displayTitle(stream.title, stream.name)

  // Considered "viewing this stream" when the URL is on a tasks/<slug> path
  // or a legacy /<slug> path; covers both /tasks/<s>, /tasks/<s>/..., /<s>, /<s>/...
  const isViewingThisStream =
    pathname === `/tasks/${stream.name}` ||
    pathname.startsWith(`/tasks/${stream.name}/`) ||
    pathname === `/${stream.name}` ||
    pathname.startsWith(`/${stream.name}/`)

  const handleRenameSubmit = async (newName: string) => {
    const trimmed = newName.trim()
    if (trimmed === stream.name) {
      setRenameOpen(false)
      return
    }
    await renameStream(stream.name, trimmed)
    invalidateStream(stream.name)
    invalidateStream(trimmed)
    await mutateStreams()
    if (isViewingThisStream) {
      router.push(`/tasks/${encodeURIComponent(trimmed)}`)
    }
    setRenameOpen(false)
  }

  const handleDeleteConfirm = async () => {
    setDeleteOpen(false)
    await deleteStream(stream.name)
    invalidateStream(stream.name)
    await mutateStreams()
    if (isViewingThisStream) {
      router.push('/tasks')
    }
  }

  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={isActive}>
        <Link href={`/tasks/${stream.name}`}>
          <Hash className="size-4" />
          <span className="truncate">{label}</span>
        </Link>
      </SidebarMenuButton>
      {attentionCount > 0 && (
        <SidebarMenuBadge className="rounded-full bg-[#F95F7C] px-2.5 text-[11px] font-semibold text-white! group-focus-within/menu-item:opacity-0 group-hover/menu-item:opacity-0 dark:bg-zinc-100 dark:text-zinc-900!">
          {attentionCount}
        </SidebarMenuBadge>
      )}
      <div
        className="absolute top-1.5 right-1 z-10 opacity-0 transition-opacity group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100"
        data-role="stream-row-menu"
      >
        <ItemDropdownMenu
          ariaLabel={`Stream actions for ${label}`}
          onRename={() => setRenameOpen(true)}
          onDelete={() => setDeleteOpen(true)}
        />
      </div>
      <NameInputDialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename stream"
        defaultValue={stream.name}
        submitLabel="Rename"
        onSubmit={handleRenameSubmit}
      />
      <DeleteAlert
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete stream?"
        description={`Permanently delete "${label}" along with all its tasks, samples, and chats. This cannot be undone.`}
        onDelete={() => {
          handleDeleteConfirm().catch(() => {
            // surfaces in logs/ already; re-open delete dialog so user sees it failed
            setDeleteOpen(true)
          })
        }}
      />
    </SidebarMenuItem>
  )
}
