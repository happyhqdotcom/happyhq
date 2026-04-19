import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockReadFile = vi.hoisted(() => vi.fn())
const mockWriteFile = vi.hoisted(() => vi.fn())
const mockMkdir = vi.hoisted(() => vi.fn())
const mockExecFile = vi.hoisted(() => vi.fn())
const mockFetch = vi.hoisted(() => vi.fn())

vi.mock('node:fs/promises', () => ({
  default: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
  readFile: mockReadFile,
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
}))

vi.mock('node:child_process', () => ({
  default: { execFile: mockExecFile },
  execFile: mockExecFile,
}))

vi.mock('@/lib/fs/paths', () => ({
  qPath: () => '/data/happyhq/.q',
}))

vi.mock('@/lib/auth/oauth-constants', () => ({
  CLIENT_ID: 'test-client-id',
  TOKEN_URL: 'https://platform.claude.com/v1/oauth/token',
}))

vi.stubGlobal('fetch', mockFetch)

import {
  checkAuthStatus,
  clearCredentials,
  getAuthEnv,
  isAuthError,
  storeApiKey,
  storeOAuthToken,
} from './auth.server'

afterEach(() => {
  vi.clearAllMocks()
})

describe('getAuthEnv', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalAccountsEnabled = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
  const originalGatewayUrl = process.env.CLOUDFLARE_AI_GATEWAY_URL

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey
    } else {
      delete process.env.ANTHROPIC_API_KEY
    }
    if (originalAccountsEnabled !== undefined) {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = originalAccountsEnabled
    } else {
      delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    }
    if (originalGatewayUrl !== undefined) {
      process.env.CLOUDFLARE_AI_GATEWAY_URL = originalGatewayUrl
    } else {
      delete process.env.CLOUDFLARE_AI_GATEWAY_URL
    }
  })

  it('returns undefined when ANTHROPIC_API_KEY env var is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-key'

    const result = await getAuthEnv()

    expect(result).toBeUndefined()
  })

  it('returns env with stored API key when no env var is set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockResolvedValue(JSON.stringify({ apiKey: 'sk-stored-key' }))

    const result = await getAuthEnv()

    expect(result).not.toBeUndefined()
    expect(result!.ANTHROPIC_API_KEY).toBe('sk-stored-key')
  })

  it('returns undefined when no env var and no stored key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const result = await getAuthEnv()

    expect(result).toBeUndefined()
  })

  it('returns undefined when config file exists but has no apiKey', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockResolvedValue(JSON.stringify({ otherField: 'value' }))

    const result = await getAuthEnv()

    expect(result).toBeUndefined()
  })

  it('returns undefined when config file contains invalid JSON', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockResolvedValue('not valid json')

    const result = await getAuthEnv()

    expect(result).toBeUndefined()
  })

  it('env var takes priority over stored key', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-key'
    mockReadFile.mockResolvedValue(JSON.stringify({ apiKey: 'sk-stored-key' }))

    const result = await getAuthEnv()

    // env var wins — SDK reads from process.env, no override needed
    expect(result).toBeUndefined()
  })

  it('routes through AI gateway when accounts enabled with gateway URL', async () => {
    delete process.env.ANTHROPIC_API_KEY
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    process.env.CLOUDFLARE_AI_GATEWAY_URL = 'https://gateway.example.com/v1'

    const result = await getAuthEnv()

    expect(result).not.toBeUndefined()
    expect(result!.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com/v1')
  })

  it('falls through when accounts enabled but no gateway URL', async () => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLOUDFLARE_AI_GATEWAY_URL
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    const result = await getAuthEnv()

    expect(result).toBeUndefined()
  })

  it('env var takes priority over accounts gateway', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-key'
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    process.env.CLOUDFLARE_AI_GATEWAY_URL = 'https://gateway.example.com/v1'

    const result = await getAuthEnv()

    expect(result).toBeUndefined()
  })

  it('accounts gateway takes priority over stored key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    process.env.CLOUDFLARE_AI_GATEWAY_URL = 'https://gateway.example.com/v1'
    mockReadFile.mockResolvedValue(JSON.stringify({ apiKey: 'sk-stored-key' }))

    const result = await getAuthEnv()

    expect(result!.ANTHROPIC_BASE_URL).toBe('https://gateway.example.com/v1')
    // Should not have read the config file — accounts short-circuits
    expect(mockReadFile).not.toHaveBeenCalled()
  })

  it('returns OAuth token when not expired', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        oauthToken: 'oauth-access',
        oauthRefreshToken: 'oauth-refresh',
        oauthExpiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
      }),
    )

    const result = await getAuthEnv()

    expect(result!.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-access')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('auto-refreshes OAuth token when near expiry', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        oauthToken: 'old-access',
        oauthRefreshToken: 'old-refresh',
        oauthExpiresAt: Date.now() + 60 * 1000, // 1 minute from now (< 5 min threshold)
      }),
    )
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }),
    })

    const result = await getAuthEnv()

    expect(result!.CLAUDE_CODE_OAUTH_TOKEN).toBe('new-access')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://platform.claude.com/v1/oauth/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('refresh_token'),
      }),
    )
  })

  it('clears credentials and returns undefined when refresh fails', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockWriteFile.mockResolvedValue(undefined)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        oauthToken: 'old-access',
        oauthRefreshToken: 'old-refresh',
        oauthExpiresAt: Date.now() - 1000, // already expired
      }),
    )
    mockFetch.mockResolvedValue({ ok: false })

    const result = await getAuthEnv()

    expect(result).toBeUndefined()
    // Should have cleared credentials
    expect(mockWriteFile).toHaveBeenCalled()
  })

  it('skips refresh when no refresh token is stored', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        oauthToken: 'oauth-access',
        // no oauthRefreshToken or oauthExpiresAt — legacy token
      }),
    )

    const result = await getAuthEnv()

    expect(result!.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-access')
    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('storeApiKey', () => {
  beforeEach(() => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('writes the API key to config.json', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await storeApiKey('sk-new-key')

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/data/happyhq/.q/config.json',
      expect.any(String),
      'utf-8',
    )
    const written = JSON.parse(mockWriteFile.mock.calls[0][1])
    expect(written.apiKey).toBe('sk-new-key')
  })

  it('preserves existing config fields when storing a key', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ existingField: 'preserved' }),
    )

    await storeApiKey('sk-new-key')

    const written = JSON.parse(mockWriteFile.mock.calls[0][1])
    expect(written.apiKey).toBe('sk-new-key')
    expect(written.existingField).toBe('preserved')
  })

  it('creates the .q directory if it does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await storeApiKey('sk-new-key')

    expect(mockMkdir).toHaveBeenCalledWith('/data/happyhq/.q', {
      recursive: true,
    })
  })
})

describe('storeOAuthToken', () => {
  beforeEach(() => {
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('writes the OAuth token to config.json under oauthToken key', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await storeOAuthToken('oauth-token-abc')

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/data/happyhq/.q/config.json',
      expect.any(String),
      'utf-8',
    )
    const written = JSON.parse(mockWriteFile.mock.calls[0][1])
    expect(written.oauthToken).toBe('oauth-token-abc')
  })

  it('stores refresh token and expiry when provided', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    const before = Date.now()

    await storeOAuthToken('oauth-token-abc', 'refresh-token-xyz', 3600)

    const written = JSON.parse(mockWriteFile.mock.calls[0][1])
    expect(written.oauthToken).toBe('oauth-token-abc')
    expect(written.oauthRefreshToken).toBe('refresh-token-xyz')
    // expires_in=3600s → expiresAt should be ~1 hour from now
    expect(written.oauthExpiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(written.oauthExpiresAt).toBeLessThanOrEqual(Date.now() + 3600 * 1000)
  })

  it('preserves existing config fields when storing token', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({ apiKey: 'sk-existing', otherField: 'preserved' }),
    )

    await storeOAuthToken('oauth-token-abc')

    const written = JSON.parse(mockWriteFile.mock.calls[0][1])
    expect(written.oauthToken).toBe('oauth-token-abc')
    expect(written.apiKey).toBe('sk-existing')
    expect(written.otherField).toBe('preserved')
  })

  it('creates the .q directory if it does not exist', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await storeOAuthToken('oauth-token-abc')

    expect(mockMkdir).toHaveBeenCalledWith('/data/happyhq/.q', {
      recursive: true,
    })
  })
})

describe('checkAuthStatus', () => {
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalAccountsEnabled = process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
  const originalGatewayUrl = process.env.CLOUDFLARE_AI_GATEWAY_URL

  afterEach(() => {
    if (originalApiKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalApiKey
    } else {
      delete process.env.ANTHROPIC_API_KEY
    }
    if (originalAccountsEnabled !== undefined) {
      process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = originalAccountsEnabled
    } else {
      delete process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED
    }
    if (originalGatewayUrl !== undefined) {
      process.env.CLOUDFLARE_AI_GATEWAY_URL = originalGatewayUrl
    } else {
      delete process.env.CLOUDFLARE_AI_GATEWAY_URL
    }
  })

  it('returns api_key_env when ANTHROPIC_API_KEY env var is set', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-key'

    const status = await checkAuthStatus()

    expect(status.authenticated).toBe(true)
    expect(status.method).toBe('api_key_env')
  })

  it('returns api_key_stored when stored key exists', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockResolvedValue(JSON.stringify({ apiKey: 'sk-stored' }))

    const status = await checkAuthStatus()

    expect(status.authenticated).toBe(true)
    expect(status.method).toBe('api_key_stored')
  })

  it('falls through to CLI when no env var or stored key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    // readConfig returns null (no stored key)
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(
          null,
          JSON.stringify({
            loggedIn: true,
            email: 'user@example.com',
            authMethod: 'claude.ai',
          }),
          '',
        )
      },
    )

    const status = await checkAuthStatus()

    expect(status.authenticated).toBe(true)
    expect(status.method).toBe('claude_login')
    expect(status.email).toBe('user@example.com')
  })

  it('returns unauthenticated when all methods fail', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error('Command not found'), '', '')
      },
    )

    const status = await checkAuthStatus()

    expect(status.authenticated).toBe(false)
    expect(status.method).toBeUndefined()
  })

  it('extracts email from CLI output', async () => {
    delete process.env.ANTHROPIC_API_KEY
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(
          null,
          JSON.stringify({
            loggedIn: true,
            email: 'test@anthropic.com',
            authMethod: 'claude.ai',
          }),
          '',
        )
      },
    )

    const status = await checkAuthStatus()

    expect(status.email).toBe('test@anthropic.com')
  })

  it('returns accounts method when accounts enabled with gateway URL', async () => {
    delete process.env.ANTHROPIC_API_KEY
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    process.env.CLOUDFLARE_AI_GATEWAY_URL = 'https://gateway.example.com/v1'

    const status = await checkAuthStatus()

    expect(status.authenticated).toBe(true)
    expect(status.method).toBe('accounts')
  })

  it('does not return accounts when gateway URL is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.CLOUDFLARE_AI_GATEWAY_URL
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    mockReadFile.mockRejectedValue(new Error('ENOENT'))
    mockExecFile.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: Record<string, unknown>,
        cb: (err: Error | null, stdout: string, stderr: string) => void,
      ) => {
        cb(new Error('Command not found'), '', '')
      },
    )

    const status = await checkAuthStatus()

    expect(status.authenticated).toBe(false)
  })

  it('env var takes priority over accounts in checkAuthStatus', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-env-key'
    process.env.NEXT_PUBLIC_ACCOUNTS_ENABLED = 'true'
    process.env.CLOUDFLARE_AI_GATEWAY_URL = 'https://gateway.example.com/v1'

    const status = await checkAuthStatus()

    expect(status.method).toBe('api_key_env')
  })
})

describe('clearCredentials', () => {
  beforeEach(() => {
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('removes all auth fields from config while preserving other fields', async () => {
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        apiKey: 'sk-old',
        oauthToken: 'old-token',
        oauthRefreshToken: 'old-refresh',
        oauthExpiresAt: 12345,
        otherField: 'kept',
      }),
    )

    await clearCredentials()

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/data/happyhq/.q/config.json',
      expect.any(String),
      'utf-8',
    )
    const written = JSON.parse(mockWriteFile.mock.calls[0][1])
    expect(written.apiKey).toBeUndefined()
    expect(written.oauthToken).toBeUndefined()
    expect(written.oauthRefreshToken).toBeUndefined()
    expect(written.oauthExpiresAt).toBeUndefined()
    expect(written.otherField).toBe('kept')
  })

  it('is a no-op when no config file exists', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'))

    await clearCredentials()

    expect(mockWriteFile).not.toHaveBeenCalled()
  })
})

describe('isAuthError', () => {
  it('detects 401 status in error message', () => {
    expect(isAuthError(new Error('Request failed with status 401'))).toBe(true)
  })

  it('detects "unauthorized" in error message', () => {
    expect(isAuthError(new Error('Unauthorized'))).toBe(true)
  })

  it('detects "invalid x-api-key" in error message', () => {
    expect(isAuthError(new Error('invalid x-api-key'))).toBe(true)
  })

  it('detects "invalid api key" in error message', () => {
    expect(isAuthError(new Error('Invalid API Key'))).toBe(true)
  })

  it('detects "authentication_error" in error message', () => {
    expect(isAuthError(new Error('authentication_error: invalid key'))).toBe(
      true,
    )
  })

  it('returns false for non-auth errors', () => {
    expect(isAuthError(new Error('Connection timeout'))).toBe(false)
    expect(isAuthError(new Error('Rate limit exceeded'))).toBe(false)
    expect(isAuthError(new Error('Internal server error'))).toBe(false)
  })

  it('handles non-Error values', () => {
    expect(isAuthError('401 Unauthorized')).toBe(true)
    expect(isAuthError('some other error')).toBe(false)
  })
})
