import { isAccountsEnabled } from '@/lib/accounts/config'

/**
 * Server-side billing flag. Returns true only when both BILLING_ENABLED
 * and ACCOUNTS_ENABLED are set — billing requires user identity.
 */
export function isBillingEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true' && isAccountsEnabled()
  )
}
