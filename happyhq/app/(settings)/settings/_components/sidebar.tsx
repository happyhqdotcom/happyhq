'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback } from 'react'

import { Avatar } from '@/components/common/catalyst/avatar'
import {
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/common/ui/sidebar'
import { isAccountsEnabledClient } from '@/lib/accounts/config'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { db } from '@/lib/database/instant'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowLeft,
  BarChart3,
  Clock,
  Compass,
  CreditCard,
  LogOut,
  Settings2,
  Wrench,
} from 'lucide-react'

// --- Types ---

type SettingsItem = {
  href: string
  label: string
  icon: LucideIcon
  requiresAccounts: boolean
  requiresBilling: boolean
}

// --- Navigation structure ---

const SETTINGS_ITEMS: SettingsItem[] = [
  {
    href: '/settings/general',
    label: 'General',
    icon: Settings2,
    requiresAccounts: false,
    requiresBilling: false,
  },
  {
    href: '/settings/models',
    label: 'Models & Limits',
    icon: Compass,
    requiresAccounts: false,
    requiresBilling: false,
  },
  {
    href: '/settings/usage',
    label: 'Usage',
    icon: BarChart3,
    requiresAccounts: true,
    requiresBilling: true,
  },
  {
    href: '/settings/billing',
    label: 'Billing',
    icon: CreditCard,
    requiresAccounts: true,
    requiresBilling: true,
  },
  {
    href: '/settings/history',
    label: 'History',
    icon: Clock,
    requiresAccounts: false,
    requiresBilling: false,
  },
  {
    href: '/settings/advanced',
    label: 'Advanced',
    icon: Wrench,
    requiresAccounts: false,
    requiresBilling: false,
  },
]

// --- Helpers ---

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
  return email[0]?.toUpperCase() ?? '?'
}

function isItemVisible(
  item: SettingsItem,
  accountsEnabled: boolean,
  billingEnabled: boolean,
): boolean {
  if (item.requiresBilling && (!accountsEnabled || !billingEnabled))
    return false
  if (item.requiresAccounts && !accountsEnabled) return false
  return true
}

// --- Component ---

export function SettingsSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const accountsEnabled = isAccountsEnabledClient()
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'

  const { user, isLoading } = useCurrentUser()

  // Fetch full profile for name/avatar (same pattern as AccountFooter)
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

  const handleSignOut = useCallback(() => {
    if (!db) return
    db.auth.signOut()
    router.push('/login')
  }, [router])

  const showProfile = accountsEnabled && !isLoading && user

  return (
    <div className="flex h-full flex-col">
      <SidebarHeader className="px-2 py-1.5">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to app">
              <Link href="/">
                <ArrowLeft />
                <span>Back to app</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        {/* Profile card — only when accounts enabled and user is loaded */}
        {showProfile && (
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                size="lg"
                tooltip={displayName as string}
                className="mt-1"
              >
                <Link
                  href="/settings/account"
                  className="flex items-center gap-3"
                >
                  <Avatar
                    src={displayAvatar}
                    initials={initials}
                    alt={displayName as string}
                    square
                    className="size-8"
                  />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">
                      {displayName as string}
                    </span>
                    {displayName !== displayEmail && (
                      <span className="text-muted-foreground truncate text-xs">
                        {displayEmail}
                      </span>
                    )}
                  </div>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarMenu>
            {SETTINGS_ITEMS.filter((item) =>
              isItemVisible(item, accountsEnabled, billingEnabled),
            ).map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={pathname === href}>
                  <Link href={href}>
                    <Icon />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Sign-out button — only when accounts enabled */}
      {accountsEnabled && (
        <SidebarFooter className="group-data-[collapsible=icon]:hidden">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton onClick={handleSignOut} tooltip="Sign out">
                <LogOut />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      )}
    </div>
  )
}
