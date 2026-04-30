'use client'

import { Button } from '@/components/common/catalyst/button'
import { ErrorMessage, Field } from '@/components/common/catalyst/fieldset'
import { Input } from '@/components/common/catalyst/input'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { mutate } from 'swr'

type SetupMode = 'choice' | 'oauth' | 'apikey'

export default function SetupPage() {
  const router = useRouter()
  const [mode, setMode] = useState<SetupMode>('choice')
  const [oauthUrl, setOauthUrl] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [authCode, setAuthCode] = useState('')
  const [submittingCode, setSubmittingCode] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleClaudeLogin = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer')
        setOauthUrl(data.url)
        setSessionId(data.sessionId ?? null)
        setMode('oauth')
      } else {
        setError(data.error || 'Failed to start login')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleApiKeySubmit = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/api-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey }),
      })
      const data = await res.json()
      if (data.success) {
        await mutate('/api/auth/status', undefined, { revalidate: false })
        router.push('/')
      } else {
        setError(data.error || 'Failed to store API key')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }, [router, apiKey])

  const handleCodeSubmit = useCallback(async () => {
    if (!sessionId || !authCode.trim()) return
    setSubmittingCode(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, code: authCode }),
      })
      const data = await res.json()
      if (data.success) {
        await mutate('/api/auth/status', undefined, { revalidate: false })
        router.push('/')
      } else {
        setError(data.error || 'Failed to complete sign-in')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setSubmittingCode(false)
    }
  }, [router, sessionId, authCode])

  const checkAuthComplete = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/status')
      const data = await res.json()
      if (data.authenticated) {
        await mutate('/api/auth/status', undefined, { revalidate: false })
        router.push('/')
      }
    } catch {
      // Silently ignore — user can retry manually
    }
  }, [router])

  // Auto-poll for OAuth completion every 3 seconds
  useEffect(() => {
    if (mode !== 'oauth') return
    const interval = setInterval(checkAuthComplete, 3000)
    return () => clearInterval(interval)
  }, [mode, checkAuthComplete])

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[320px]">
        <div className="mb-8 flex justify-center">
          <Image
            src="/brand/logo.svg"
            alt="HappyHQ"
            width={235}
            height={48}
            priority
            unoptimized
            className="h-12 w-auto"
          />
        </div>

        {mode === 'choice' && (
          <div className="space-y-4">
            <h1 className="text-center text-lg font-medium">
              Set up your Anthropic account
            </h1>
            <Button
              color="dark/zinc"
              className="w-full"
              onClick={handleClaudeLogin}
              disabled={loading}
            >
              {loading ? 'Connecting\u2026' : 'Sign in with Claude'}
            </Button>
            <Button
              outline
              className="w-full"
              onClick={() => {
                setError(null)
                setMode('apikey')
              }}
              disabled={loading}
            >
              Use an API key
            </Button>
            {error && <ErrorMessage role="alert">{error}</ErrorMessage>}
          </div>
        )}

        {mode === 'oauth' && (
          <div className="space-y-4">
            <h1 className="text-center text-lg font-medium">
              Sign in with Claude
            </h1>
            <p className="text-center text-sm text-zinc-500">
              Open the link below to sign in. After authenticating, copy the
              code shown and paste it here.
            </p>
            {oauthUrl && (
              <a
                href={oauthUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-center text-sm break-all text-zinc-950 underline"
              >
                Open sign-in page
              </a>
            )}
            <Field>
              <Input
                type="text"
                placeholder="Paste your code here"
                value={authCode}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setAuthCode(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && authCode.trim() && !submittingCode) {
                    handleCodeSubmit()
                  }
                }}
                disabled={submittingCode}
                invalid={!!error}
                aria-describedby={error ? 'oauth-error' : undefined}
              />
              {error && (
                <ErrorMessage id="oauth-error" role="alert">
                  {error}
                </ErrorMessage>
              )}
            </Field>
            <Button
              color="dark/zinc"
              className="w-full"
              onClick={handleCodeSubmit}
              disabled={submittingCode || !authCode.trim()}
            >
              {submittingCode ? 'Signing in\u2026' : 'Submit code'}
            </Button>
            <Button
              outline
              className="w-full"
              onClick={() => {
                setError(null)
                setOauthUrl(null)
                setSessionId(null)
                setAuthCode('')
                setMode('choice')
              }}
              disabled={submittingCode}
            >
              Back
            </Button>
          </div>
        )}

        {mode === 'apikey' && (
          <div className="space-y-4">
            <h1 className="text-center text-lg font-medium">
              Enter your API key
            </h1>
            <Field>
              <Input
                type="password"
                placeholder="sk-ant-..."
                value={apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setApiKey(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === 'Enter' && apiKey.trim()) {
                    handleApiKeySubmit()
                  }
                }}
                invalid={!!error}
                aria-describedby={error ? 'apikey-error' : undefined}
                autoFocus
              />
              {error && (
                <ErrorMessage id="apikey-error" role="alert">
                  {error}
                </ErrorMessage>
              )}
            </Field>
            <Button
              color="dark/zinc"
              className="w-full"
              onClick={handleApiKeySubmit}
              disabled={loading || !apiKey.trim()}
            >
              {loading ? 'Saving\u2026' : 'Save API key'}
            </Button>
            <Button
              outline
              className="w-full"
              onClick={() => {
                setError(null)
                setApiKey('')
                setMode('choice')
              }}
              disabled={loading}
            >
              Back
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
