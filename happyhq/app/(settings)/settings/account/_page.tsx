'use client'

import { AccountSettings } from '@/components/features/settings/account-settings'
import { SettingsPage } from '../_components/settings-section'

export function AccountSettingsPage() {
  return (
    <SettingsPage title="Account">
      <AccountSettings />
    </SettingsPage>
  )
}
