import { afterEach, describe, expect, it, vi } from 'vitest'

describe('isBillingEnabled', () => {
  const originalBilling = process.env.NEXT_PUBLIC_BILLING_ENABLED
  const originalAccounts = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED

  afterEach(() => {
    if (originalBilling !== undefined) {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = originalBilling
    } else {
      delete process.env.NEXT_PUBLIC_BILLING_ENABLED
    }
    if (originalAccounts !== undefined) {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = originalAccounts
    } else {
      delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    }
    vi.resetModules()
  })

  it('returns true when both NEXT_PUBLIC_BILLING_ENABLED and NEXT_PUBLIC_ACCOUNTS_ENABLED are "true"', async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true'
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    const { isBillingEnabled } = await import('./config')
    expect(isBillingEnabled()).toBe(true)
  })

  it('returns false when NEXT_PUBLIC_BILLING_ENABLED is "true" but NEXT_PUBLIC_ACCOUNTS_ENABLED is unset', async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'true'
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    const { isBillingEnabled } = await import('./config')
    expect(isBillingEnabled()).toBe(false)
  })

  it('returns false when NEXT_PUBLIC_ACCOUNTS_ENABLED is "true" but NEXT_PUBLIC_BILLING_ENABLED is unset', async () => {
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    const { isBillingEnabled } = await import('./config')
    expect(isBillingEnabled()).toBe(false)
  })

  it('returns false when both are unset', async () => {
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    const { isBillingEnabled } = await import('./config')
    expect(isBillingEnabled()).toBe(false)
  })

  it('returns false when NEXT_PUBLIC_BILLING_ENABLED is "false"', async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = 'false'
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    const { isBillingEnabled } = await import('./config')
    expect(isBillingEnabled()).toBe(false)
  })

  it('returns false when NEXT_PUBLIC_BILLING_ENABLED is empty string', async () => {
    process.env.NEXT_PUBLIC_BILLING_ENABLED = ''
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    const { isBillingEnabled } = await import('./config')
    expect(isBillingEnabled()).toBe(false)
  })
})
