import { isAccountsEnabled } from '@/lib/accounts/config'
import { redirect } from 'next/navigation'

import { AccountSettingsPage } from './_page'

export default function AccountPage() {
  if (!isAccountsEnabled()) {
    redirect('/settings/general')
  }
  return <AccountSettingsPage />
}
