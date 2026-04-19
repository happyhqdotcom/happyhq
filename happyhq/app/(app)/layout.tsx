import { WorkspaceInitializer } from '@/app/providers/workspace-initializer'
import { PreventZoom } from '@/components/common/prevent-zoom'
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from '@/components/common/ui/sidebar'
import { AuthGuard } from '@/components/features/auth/auth-guard'
import { GlobalSidebar } from '@/components/features/sidebar/sidebar'
import { readConfig } from '@/lib/config/config.server'
import { resolveConfig } from '@/lib/config/defaults'
import { readStreams } from '@/lib/fs/read.server'
import { cookies } from 'next/headers'

export default async function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get('sidebar_state')
  // Cookie (user's explicit toggle) takes precedence; config is the factory default
  const config = resolveConfig(await readConfig())
  const defaultOpen = sidebarCookie
    ? sidebarCookie.value === 'true'
    : config.general.sidebarDefault === 'open'
  const streams = await readStreams()

  return (
    <AuthGuard>
      <PreventZoom />
      <SidebarProvider defaultOpen={defaultOpen}>
        <WorkspaceInitializer initialStreams={streams} />
        <Sidebar side="left" collapsible="icon">
          <GlobalSidebar initialStreams={streams} />
        </Sidebar>
        <SidebarInset>{children}</SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  )
}
