'use client'

import { Button } from '@/components/common/catalyst/button'
import { ErrorMessage, Field } from '@/components/common/catalyst/fieldset'
import { Input } from '@/components/common/catalyst/input'

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/common/ui/input-otp'
import { db } from '@/lib/database/instant'
import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

type Step = 'email' | 'code'

export function AccountsLogin() {
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [nonce] = useState(() => crypto.randomUUID())

  // Redirect when InstantDB has authenticated the user (after magic code
  // verification or OAuth redirect where InstantDB auto-exchanges the code).
  const auth = db!.useAuth()
  useEffect(() => {
    if (!auth.isLoading && auth.user) {
      router.push('/')
    }
  }, [auth.isLoading, auth.user, router])

  const handleSendCode = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      if (!db || !email.trim()) return

      setLoading(true)
      setError(null)
      setStep('code')

      db.auth.sendMagicCode({ email: email.trim() }).catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to send code. Try again.',
        )
        setStep('email')
        setLoading(false)
      })

      setLoading(false)
    },
    [email],
  )

  const handleVerifyCode = useCallback(
    (verifyCode: string) => {
      if (!db || verifyCode.length !== 6) return

      setLoading(true)
      setError(null)

      // Don't redirect here — the useAuth() effect handles navigation
      // after the cookie sync completes. Keep loading=true so the user
      // sees the spinner until the redirect happens.
      db.auth
        .signInWithMagicCode({
          email: email.trim(),
          code: verifyCode,
        })
        .catch((err) => {
          setError(
            err instanceof Error ? err.message : 'Invalid code. Try again.',
          )
          setCode('')
          setLoading(false)
        })
    },
    [email],
  )

  const handleResend = useCallback(() => {
    if (!db) return

    setLoading(true)
    setError(null)
    setCode('')

    db.auth
      .sendMagicCode({ email: email.trim() })
      .catch((err) => {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to resend code. Try again.',
        )
      })
      .finally(() => setLoading(false))
  }, [email])

  const handleGoogleSuccess = useCallback(
    (credential: string | undefined) => {
      if (!db || !credential) return

      setLoading(true)
      setError(null)

      db.auth
        .signInWithIdToken({
          clientName: 'google-web',
          idToken: credential,
          nonce,
        })
        .catch((err: unknown) => {
          setError(
            err instanceof Error
              ? err.message
              : 'Failed to sign in with Google. Try again.',
          )
          setLoading(false)
        })
    },
    [nonce],
  )

  const handleBack = useCallback(() => {
    setStep('email')
    setCode('')
    setError(null)
  }, [])

  if (step === 'code') {
    return (
      <div className="space-y-4">
        <div className="text-center">
          <p className="text-sm text-zinc-500">
            Enter the 6-digit code sent to
          </p>
          <p className="text-sm font-medium">{email}</p>
        </div>

        <div className="flex justify-center">
          <InputOTP
            maxLength={6}
            value={code}
            onChange={setCode}
            onComplete={handleVerifyCode}
            disabled={loading}
            autoFocus
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {error && (
          <p className="text-center text-sm text-red-600" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={handleBack}
            disabled={loading}
            className="text-zinc-500 transition-colors hover:text-zinc-950 disabled:opacity-50"
          >
            Use a different email
          </button>
          <button
            type="button"
            onClick={handleResend}
            disabled={loading}
            className="text-zinc-500 transition-colors hover:text-zinc-950 disabled:opacity-50"
          >
            Resend code
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSendCode} className="space-y-4">
        <Field>
          <Input
            type="email"
            name="email"
            placeholder="Email address"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEmail(e.target.value)
            }
            disabled={loading}
            invalid={!!error}
            aria-describedby={error ? 'login-error' : undefined}
          />
          {error && (
            <ErrorMessage id="login-error" role="alert">
              {error}
            </ErrorMessage>
          )}
        </Field>

        <Button
          type="submit"
          color="dark/zinc"
          className="w-full"
          disabled={loading || !email.trim()}
        >
          {loading ? 'Sending code\u2026' : 'Continue with email'}
        </Button>
      </form>

      {googleClientId && (
        <>
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-950/10" />
            <span className="text-xs text-zinc-500">or</span>
            <div className="h-px flex-1 bg-zinc-950/10" />
          </div>

          <GoogleButton
            googleClientId={googleClientId}
            nonce={nonce}
            onError={() =>
              setError('Failed to sign in with Google. Try again.')
            }
            onSuccess={(credential) => handleGoogleSuccess(credential)}
          />
        </>
      )}
    </div>
  )
}

function GoogleButton({
  googleClientId,
  nonce,
  onError,
  onSuccess,
}: {
  googleClientId: string
  nonce: string
  onError: () => void
  onSuccess: (credential: string | undefined) => void
}) {
  const [ready, setReady] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const observer = new MutationObserver(() => {
      const iframe = containerRef.current?.querySelector('iframe')
      if (iframe) {
        setReady(true)
        observer.disconnect()
      }
    })
    observer.observe(containerRef.current, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="relative h-[40px]">
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center rounded-sm border border-zinc-200 bg-white">
          <svg
            className="h-5 w-5 animate-spin text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
        </div>
      )}
      <div ref={containerRef} className={ready ? '' : 'invisible'}>
        <GoogleOAuthProvider clientId={googleClientId}>
          <GoogleLogin
            nonce={nonce}
            width="320"
            size="large"
            text="continue_with"
            onError={onError}
            onSuccess={({ credential }) => onSuccess(credential)}
          />
        </GoogleOAuthProvider>
      </div>
    </div>
  )
}
