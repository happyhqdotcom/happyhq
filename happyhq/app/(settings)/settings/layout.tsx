import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
} from '@/components/common/ui/sidebar'
import { AuthGuard } from '@/components/features/auth/auth-guard'

import { SettingsSidebar } from './_components/sidebar'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard>
      <SidebarProvider defaultOpen>
        <Sidebar side="left" collapsible="icon">
          <SettingsSidebar />
        </Sidebar>
        <SidebarInset>
          <div className="h-svh overflow-y-auto border-l border-black/10 bg-[--desktop-bg]">
            <div className="mx-auto max-w-2xl px-8 py-12">{children}</div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  )
}
