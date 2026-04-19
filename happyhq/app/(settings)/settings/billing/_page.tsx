'use client'

import { BillingSettings } from '@/components/features/settings/billing-settings'
import { SettingsPage } from '../_components/settings-section'

export function BillingSettingsPage() {
  return (
    <SettingsPage title="Billing">
      <BillingSettings />
    </SettingsPage>
  )
}
