'use client'

import { Button } from '@/components/common/catalyst/button'
import { ErrorMessage, Field } from '@/components/common/catalyst/fieldset'
import { Input } from '@/components/common/catalyst/input'
import { AccountsLogin } from '@/components/features/auth/accounts-login'
import { isAccountsEnabledClient } from '@/lib/accounts/config'
import { useRouter } from 'next/navigation'
import { useActionState, useEffect, useRef, useState } from 'react'
import { login } from './actions'

const initialState = { success: false } as {
  success: boolean
  error?: string
}

export function LoginPage({ hasPasswordGate }: { hasPasswordGate: boolean }) {
  const router = useRouter()
  const accountsEnabled = isAccountsEnabledClient()
  const [passwordCleared, setPasswordCleared] = useState(false)

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-[320px]">
        <div className="mb-8 flex justify-center">
          <img src="/brand/logo.png" alt="HappyHQ" className="h-12" />
        </div>

        {accountsEnabled && (!hasPasswordGate || passwordCleared) ? (
          <AccountsLogin />
        ) : (
          <PasswordLogin
            onSuccess={() => {
              if (accountsEnabled) {
                setPasswordCleared(true)
              } else {
                router.push('/')
              }
            }}
          />
        )}
      </div>
    </div>
  )
}

function PasswordLogin({ onSuccess }: { onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(login, initialState)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.success) {
      onSuccess()
    }
  }, [state.success, onSuccess])

  // Re-focus password input after a failed submission so the user can retry
  useEffect(() => {
    if (state.error && !pending) {
      inputRef.current?.focus()
    }
  }, [state.error, pending])

  return (
    <form action={formAction} className="space-y-4">
      <Field>
        <Input
          ref={inputRef}
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          autoFocus
          invalid={!!state.error}
          aria-describedby={state.error ? 'login-error' : undefined}
        />
        {state.error && (
          <ErrorMessage id="login-error" role="alert">
            {state.error}
          </ErrorMessage>
        )}
      </Field>

      <Button
        type="submit"
        color="dark/zinc"
        className="w-full"
        disabled={pending}
      >
        {pending ? 'Signing in\u2026' : 'Sign in'}
      </Button>
    </form>
  )
}
