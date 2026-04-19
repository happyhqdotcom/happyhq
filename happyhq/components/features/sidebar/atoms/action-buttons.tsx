'use client'

import { Home, MessageCircle, Plus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/common/ui/sidebar'

export function ActionButtons({ onNewClick }: { onNewClick: () => void }) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton tooltip="New task" onClick={onNewClick}>
            <span className="flex size-4 items-center justify-center rounded-full bg-current/10 ring-3 ring-current/10">
              <Plus className="size-4!" />
            </span>
            <span>New task</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            tooltip="Home"
            isActive={
              pathname === '/tasks' || pathname.startsWith('/tasks/inbox/')
            }
          >
            <Link href="/tasks">
              <Home className="size-4" />
              <span>Home</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton
            asChild
            tooltip="Chat"
            isActive={pathname === '/chat' || pathname.startsWith('/chat/')}
          >
            <Link href="/chat">
              <MessageCircle className="size-4" />
              <span>Chat</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroup>
  )
}
