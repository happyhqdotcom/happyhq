'use client'

import { SettingsRow } from '@/app/(settings)/settings/_components/settings-row'
import { Button } from '@/components/common/catalyst/button'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import useSWR from 'swr'

export function AuthConnection({
  initialData,
}: {
  initialData?: { authenticated: boolean; method?: string; email?: string }
}) {
  const router = useRouter()
  const { data } = useSWR(
    '/api/auth/status',
    (url: string) => fetch(url).then((r) => r.json()),
    { fallbackData: initialData },
  )
  const [disconnecting, setDisconnecting] = useState(false)

  const handleDisconnect = useCallback(async () => {
    setDisconnecting(true)
    try {
      await fetch('/api/auth/disconnect', { method: 'POST' })
      router.push('/setup')
    } catch {
      setDisconnecting(false)
    }
  }, [router])

  const method = data?.method

  return (
    <>
      <SettingsRow
        label="Claude login"
        description={
          method === 'claude_login'
            ? `Logged in as ${data?.email ?? 'unknown'}`
            : 'Not logged in'
        }
      >
        {method === 'claude_login' ? (
          <Button plain onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? 'Logging out...' : 'Log out'}
          </Button>
        ) : (
          !method && (
            <Button plain href="/setup">
              Log in
            </Button>
          )
        )}
      </SettingsRow>

      <SettingsRow
        label="Anthropic API key"
        description={
          method === 'api_key_stored'
            ? 'Key configured'
            : method === 'api_key_env'
              ? 'Set via environment variable'
              : 'Not set'
        }
      >
        {method === 'api_key_stored' && (
          <Button plain onClick={handleDisconnect} disabled={disconnecting}>
            {disconnecting ? 'Removing...' : 'Remove'}
          </Button>
        )}
        {!method && (
          <Button plain href="/setup">
            Add
          </Button>
        )}
      </SettingsRow>

      {method === 'accounts' && (
        <SettingsRow
          label="Managed (AI Gateway)"
          description="Configured by your organization"
        >
          {null}
        </SettingsRow>
      )}
    </>
  )
}
