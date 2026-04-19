import { AuthConnection } from '@/components/features/settings/auth-connection'
import { checkAuthStatus } from '@/lib/agents/auth.server'
import { SettingsPage, SettingsSection } from '../_components/settings-section'

export default async function AdvancedPage() {
  const authStatus = await checkAuthStatus()

  return (
    <SettingsPage title="Advanced">
      <SettingsSection title="Bring Your Own AI">
        <AuthConnection initialData={authStatus} />
      </SettingsSection>
    </SettingsPage>
  )
}
