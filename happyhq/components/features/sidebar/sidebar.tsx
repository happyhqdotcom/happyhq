'use client'

import { useEffect, useMemo, useState } from 'react'

import useSWR from 'swr'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/common/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/common/ui/tooltip'
import { AccountFooter } from '@/components/features/sidebar/atoms/account-footer'
import { ActionButtons } from '@/components/features/sidebar/atoms/action-buttons'
import {
  CreateStreamDialog,
  subscribeOpenCreateStreamDialog,
} from '@/components/features/streams/create/create-stream-dialog'
import { TaskCreateDialog } from '@/components/features/tasks/create/dialog'
import { displayTitle } from '@/lib/format'
import type { StreamEntry, TaskItem } from '@/lib/fs/types'
import { fetcher } from '@/lib/swr'
import { taskItemsKey } from '@/lib/swr-keys'
import { useStreams } from '@/stores/streamsStore'
import {
  FerrisWheel,
  Hash,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
} from 'lucide-react'

export function GlobalSidebar({
  initialStreams,
}: {
  initialStreams: StreamEntry[]
}) {
  const { toggleSidebar } = useSidebar()
  const pathname = usePathname()
  const [createOpen, setCreateOpen] = useState(false)
  const [streamCreateOpen, setStreamCreateOpen] = useState(false)

  // Listen for "open create stream" events from elsewhere in the app
  // (command menu, quick-open panel, etc.) so the dialog has a single owner.
  useEffect(
    () => subscribeOpenCreateStreamDialog(() => setStreamCreateOpen(true)),
    [],
  )
  const storeStreams = useStreams()
  const streams = storeStreams.length > 0 ? storeStreams : initialStreams
  const { data: taskItems = [] } = useSWR<TaskItem[]>(taskItemsKey(), fetcher)
  const attentionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const item of taskItems) {
      const stream = item.frontmatter.stream ?? null
      if (stream && item.frontmatter.pending) {
        counts.set(stream, (counts.get(stream) ?? 0) + 1)
      }
    }
    return counts
  }, [taskItems])

  return (
    <div className="flex h-full flex-col">
      {/* Header — logo + collapse toggle */}
      <SidebarHeader className="px-2 py-1.5">
        <SidebarMenu>
          {/* Expanded: logo + collapse button */}
          <SidebarMenuItem className="group-data-[collapsible=icon]:hidden">
            <div className="flex h-8 items-center justify-between pl-1">
              <Link href="/tasks">
                <Image
                  src="/brand/logo.svg"
                  alt="HappyHQ"
                  width={128}
                  height={26}
                  priority
                  className="h-[20px] w-[97px] max-w-none cursor-pointer select-none"
                />
              </Link>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={toggleSidebar}
                    className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex size-7 items-center justify-center rounded-md transition-colors"
                  >
                    <PanelLeftClose className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Collapse sidebar</TooltipContent>
              </Tooltip>
            </div>
          </SidebarMenuItem>
          {/* Collapsed: expand button */}
          <SidebarMenuItem className="hidden group-data-[collapsible=icon]:flex">
            <SidebarMenuButton tooltip="Expand" onClick={toggleSidebar}>
              <PanelLeftOpen />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <ActionButtons onNewClick={() => setCreateOpen(true)} />
      <TaskCreateDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <CreateStreamDialog
        open={streamCreateOpen}
        onClose={() => setStreamCreateOpen(false)}
      />
      <SidebarContent className="mt-2.5">
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>Streams</SidebarGroupLabel>
          <SidebarGroupAction onClick={() => setStreamCreateOpen(true)}>
            <Plus />
          </SidebarGroupAction>
          <SidebarMenu>
            {streams.map((s) => {
              const isActive =
                pathname === `/tasks/${s.name}` ||
                pathname.startsWith(`/tasks/${s.name}/`) ||
                pathname === `/${s.name}` ||
                pathname.startsWith(`/${s.name}/`)
              return (
                <SidebarMenuItem key={s.name}>
                  <SidebarMenuButton asChild isActive={isActive}>
                    <Link href={`/tasks/${s.name}`}>
                      <Hash className="size-4" />
                      <span className="truncate">
                        {displayTitle(s.title, s.name)}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                  {(attentionCounts.get(s.name) ?? 0) > 0 && (
                    <SidebarMenuBadge className="rounded-full bg-[#F95F7C] px-2.5 text-[11px] font-semibold text-white! dark:bg-zinc-100 dark:text-zinc-900!">
                      {attentionCounts.get(s.name)}
                    </SidebarMenuBadge>
                  )}
                </SidebarMenuItem>
              )
            })}
            {streams.length === 0 && (
              <SidebarMenuItem>
                <SidebarMenuButton disabled className="pointer-events-none">
                  <span className="text-current/80">No streams</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="gap-1">
        {process.env.NODE_ENV === 'development' && (
          <SidebarMenu className="[&_svg]:text-sidebar-foreground/50 flex-row gap-1">
            <SidebarMenuItem>
              <Tooltip>
                <TooltipTrigger asChild>
                  <SidebarMenuButton
                    asChild
                    className="size-8 w-auto rounded-lg p-2 [&>span]:hidden"
                  >
                    <Link href="/playground">
                      <FerrisWheel />
                      <span>Playground</span>
                    </Link>
                  </SidebarMenuButton>
                </TooltipTrigger>
                <TooltipContent side="top" align="start">
                  Playground
                </TooltipContent>
              </Tooltip>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <SidebarSeparator />
        {process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED === 'true' ? (
          <AccountFooter />
        ) : (
          <SidebarMenu className="[&_svg]:text-sidebar-foreground/50">
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Settings">
                <Link href="/settings">
                  <Settings />
                  <span>Settings</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarFooter>
    </div>
  )
}
