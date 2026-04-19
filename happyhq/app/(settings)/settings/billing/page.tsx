import { isAccountsEnabled } from '@/lib/accounts/config'
import { redirect } from 'next/navigation'

import { BillingSettingsPage } from './_page'

export default function BillingPage() {
  const billingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true'
  if (!isAccountsEnabled() || !billingEnabled) {
    redirect('/settings/general')
  }
  return <BillingSettingsPage />
}
