'use client'

import { Avatar } from '@/components/common/catalyst/avatar'
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from '@/components/common/catalyst/popover'
import { SidebarMenu, SidebarMenuItem } from '@/components/common/ui/sidebar'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'
import { CloseButton } from '@headlessui/react'
import { ChevronsUpDown, Settings } from 'lucide-react'
import { useRouter } from 'next/navigation'

function getInitials(email: string, name?: string): string {
  if (name) {
    return name
      .split(' ')
      .map((part) => part[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase()
  }
  // Fall back to first character of email
  return email[0]?.toUpperCase() ?? '?'
}

const menuItemClass =
  'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-zinc-700 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-700/50'
const menuIconClass = 'size-4 text-zinc-400 dark:text-zinc-500'

export function AccountFooter() {
  const { user, isLoading } = useCurrentUser()
  const router = useRouter()

  // Fetch full profile from InstantDB for name/avatar
  const profileQuery = db?.useQuery(
    user ? { $users: { $: { where: { id: user.id } }, avatar: {} } } : null,
  )
  const profile = profileQuery?.data?.$users?.[0]

  const displayName = profile?.name ?? user?.email ?? ''
  const displayEmail = user?.email ?? ''
  const displayAvatar = profile?.avatar?.url ?? null
  const initials = getInitials(
    displayEmail,
    profile?.name as string | undefined,
  )

  if (isLoading || !user) {
    return null
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Popover>
          <PopoverButton className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground flex h-12 w-full items-center gap-3 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden transition-[width,height,padding] group-data-[collapsible=icon]:h-8! group-data-[collapsible=icon]:w-8! group-data-[collapsible=icon]:p-0!">
            <Avatar
              src={displayAvatar}
              initials={initials}
              alt={displayName}
              square
              className="size-8"
            />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{displayName}</span>
              {displayName !== displayEmail && (
                <span className="text-muted-foreground truncate text-xs">
                  {displayEmail}
                </span>
              )}
            </div>
            <ChevronsUpDown className="ml-auto size-4" />
          </PopoverButton>
          <PopoverPanel
            anchor="top start"
            className="w-64! bg-white! [--anchor-gap:6px] dark:bg-zinc-800!"
          >
            {/* Inset card header */}
            <div className="p-1 pb-0">
              <div className="rounded-lg border border-zinc-950/5 bg-zinc-50 px-2.5 pt-2.5 pb-2 dark:border-white/5 dark:bg-zinc-700/40">
                <div className="flex items-center gap-2.5">
                  <Avatar
                    src={displayAvatar}
                    initials={initials}
                    alt={displayName}
                    square
                    className="size-8"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                      {displayName}
                    </div>
                    {displayName !== displayEmail && (
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {displayEmail}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-1.5">
              <CloseButton
                as="button"
                onClick={() => router.push('/settings')}
                className={menuItemClass}
              >
                <Settings className={menuIconClass} />
                Settings
              </CloseButton>
            </div>
          </PopoverPanel>
        </Popover>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
