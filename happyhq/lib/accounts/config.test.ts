import { afterEach, describe, expect, it, vi } from 'vitest'

describe('isAccountsEnabled (server-side)', () => {
  const originalValue = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED

  afterEach(() => {
    if (originalValue !== undefined) {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = originalValue
    } else {
      delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    }
    vi.resetModules()
  })

  it('returns true when NEXT_PUBLIC_ACCOUNTS_ENABLED is "true"', async () => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    const { isAccountsEnabled } = await import('./config')
    expect(isAccountsEnabled()).toBe(true)
  })

  it('returns false when NEXT_PUBLIC_ACCOUNTS_ENABLED is unset', async () => {
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    const { isAccountsEnabled } = await import('./config')
    expect(isAccountsEnabled()).toBe(false)
  })

  it('returns false when NEXT_PUBLIC_ACCOUNTS_ENABLED is empty string', async () => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = ''
    const { isAccountsEnabled } = await import('./config')
    expect(isAccountsEnabled()).toBe(false)
  })

  it('returns false when NEXT_PUBLIC_ACCOUNTS_ENABLED is "false"', async () => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'false'
    const { isAccountsEnabled } = await import('./config')
    expect(isAccountsEnabled()).toBe(false)
  })
})

describe('isAccountsEnabledClient (client-side)', () => {
  const originalValue = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED

  afterEach(() => {
    if (originalValue !== undefined) {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = originalValue
    } else {
      delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    }
    vi.resetModules()
  })

  it('returns true when NEXT_PUBLIC_ACCOUNTS_ENABLED is "true"', async () => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    const { isAccountsEnabledClient } = await import('./config')
    expect(isAccountsEnabledClient()).toBe(true)
  })

  it('returns false when NEXT_PUBLIC_ACCOUNTS_ENABLED is unset', async () => {
    delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    const { isAccountsEnabledClient } = await import('./config')
    expect(isAccountsEnabledClient()).toBe(false)
  })

  it('returns false when NEXT_PUBLIC_ACCOUNTS_ENABLED is empty string', async () => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = ''
    const { isAccountsEnabledClient } = await import('./config')
    expect(isAccountsEnabledClient()).toBe(false)
  })

  it('returns false when NEXT_PUBLIC_ACCOUNTS_ENABLED is "false"', async () => {
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'false'
    const { isAccountsEnabledClient } = await import('./config')
    expect(isAccountsEnabledClient()).toBe(false)
  })
})

describe('isEmailAllowed', () => {
  const originalValue = process.env.ALLOWED_EMAILS

  afterEach(() => {
    if (originalValue !== undefined) {
      process.env.ALLOWED_EMAILS = originalValue
    } else {
      delete process.env.ALLOWED_EMAILS
    }
    vi.resetModules()
  })

  it('allows all emails when ALLOWED_EMAILS is unset', async () => {
    delete process.env.ALLOWED_EMAILS
    const { isEmailAllowed } = await import('./config')
    expect(isEmailAllowed('anyone@example.com')).toBe(true)
  })

  it('allows listed emails', async () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com,bob@example.com'
    const { isEmailAllowed } = await import('./config')
    expect(isEmailAllowed('alice@example.com')).toBe(true)
    expect(isEmailAllowed('bob@example.com')).toBe(true)
  })

  it('rejects unlisted emails', async () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com'
    const { isEmailAllowed } = await import('./config')
    expect(isEmailAllowed('eve@example.com')).toBe(false)
  })

  it('is case-insensitive', async () => {
    process.env.ALLOWED_EMAILS = 'Alice@Example.COM'
    const { isEmailAllowed } = await import('./config')
    expect(isEmailAllowed('alice@example.com')).toBe(true)
    expect(isEmailAllowed('ALICE@EXAMPLE.COM')).toBe(true)
  })

  it('trims whitespace around emails', async () => {
    process.env.ALLOWED_EMAILS = ' alice@example.com , bob@example.com '
    const { isEmailAllowed } = await import('./config')
    expect(isEmailAllowed('alice@example.com')).toBe(true)
    expect(isEmailAllowed('bob@example.com')).toBe(true)
  })

  it('ignores empty entries from trailing commas', async () => {
    process.env.ALLOWED_EMAILS = 'alice@example.com,,'
    const { isEmailAllowed } = await import('./config')
    expect(isEmailAllowed('alice@example.com')).toBe(true)
    expect(isEmailAllowed('')).toBe(false)
  })
})
