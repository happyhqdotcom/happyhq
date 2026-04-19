import { WorkspaceInitializer } from '@/app/providers/workspace-initializer'
import { PreventZoom } from '@/components/common/prevent-zoom'
import { AuthGuard } from '@/components/features/auth/auth-guard'
import { HappyDesktop } from '@/components/features/desktop/happy-desktop'
import { listAllTaskItems, readStreams } from '@/lib/fs/read.server'

export default async function DesktopLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [streams, taskItems] = await Promise.all([
    readStreams(),
    listAllTaskItems(),
  ])

  return (
    <AuthGuard>
      <PreventZoom />
      <WorkspaceInitializer initialStreams={streams} />
      <HappyDesktop initialTaskItems={taskItems}>{children}</HappyDesktop>
    </AuthGuard>
  )
}
