'use client'

import { RuntimeHistory } from '@/components/features/settings/runtime-history'
import { UsageSettings } from '@/components/features/settings/usage-settings'
import { SettingsPanel } from '../_components/settings-panel'
import { SettingsPage, SettingsSection } from '../_components/settings-section'

export function UsageSettingsPage() {
  return (
    <SettingsPage title="Usage">
      <SettingsPanel className="mt-4">
        <UsageSettings />
      </SettingsPanel>

      <SettingsSection title="Runtime History">
        <RuntimeHistory />
      </SettingsSection>
    </SettingsPage>
  )
}
