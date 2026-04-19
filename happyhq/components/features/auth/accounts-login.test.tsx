import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockPush = vi.hoisted(() => vi.fn())
const mockSendMagicCode = vi.hoisted(() => vi.fn())
const mockSignInWithMagicCode = vi.hoisted(() => vi.fn())
const mockSignInWithIdToken = vi.hoisted(() => vi.fn())
const mockUseAuth = vi.hoisted(() =>
  vi.fn(
    () =>
      ({ isLoading: false, user: null, error: null }) as {
        isLoading: boolean
        user: { id: string; email: string } | null
        error: { message: string } | null
      },
  ),
)

let mockGoogleLoginOnSuccess: ((resp: { credential: string }) => void) | null =
  null
let mockGoogleLoginOnError: (() => void) | null = null

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@/lib/database/instant', () => ({
  db: {
    auth: {
      sendMagicCode: mockSendMagicCode,
      signInWithMagicCode: mockSignInWithMagicCode,
      signInWithIdToken: mockSignInWithIdToken,
    },
    useAuth: mockUseAuth,
  },
}))

vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="google-oauth-provider">{children}</div>
  ),
  GoogleLogin: ({
    onSuccess,
    onError,
  }: {
    nonce: string
    onSuccess: (resp: { credential: string }) => void
    onError: () => void
  }) => {
    mockGoogleLoginOnSuccess = onSuccess
    mockGoogleLoginOnError = onError
    return (
      <button type="button" data-testid="google-login-button">
        Sign in with Google
      </button>
    )
  },
}))

// Mock input-otp to avoid jsdom's missing ResizeObserver.
// The OTP input is a third-party component — we test the flow, not the widget.
let capturedOnComplete: ((value: string) => void) | undefined

vi.mock('@/components/common/ui/input-otp', () => ({
  InputOTP: ({
    onComplete,
    disabled,
    value,
    children,
  }: {
    onChange?: (value: string) => void
    onComplete?: (value: string) => void
    disabled?: boolean
    value?: string
    maxLength?: number
    autoFocus?: boolean
    children?: React.ReactNode
  }) => {
    capturedOnComplete = onComplete
    return (
      <div data-testid="otp-input" data-disabled={disabled} data-value={value}>
        {children}
      </div>
    )
  },
  InputOTPGroup: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
  InputOTPSlot: ({ index }: { index: number }) => (
    <div data-slot="otp-slot" data-index={index} />
  ),
}))

import { AccountsLogin } from './accounts-login'

beforeEach(() => {
  capturedOnComplete = undefined
  mockGoogleLoginOnSuccess = null
  mockGoogleLoginOnError = null
  vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', 'test-google-client-id')
  mockUseAuth.mockReturnValue({ isLoading: false, user: null, error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AccountsLogin', () => {
  describe('email step', () => {
    it('renders email input and submit button', () => {
      const { container } = render(<AccountsLogin />)

      const emailInput = container.querySelector('input[type="email"]')
      expect(emailInput).not.toBeNull()

      const button = container.querySelector('button[type="submit"]')
      expect(button).not.toBeNull()
      expect(button!.textContent).toContain('Continue with email')
    })

    it('renders Google OAuth button when client ID is set', () => {
      const { container } = render(<AccountsLogin />)

      const googleButton = container.querySelector(
        '[data-testid="google-login-button"]',
      )
      expect(googleButton).not.toBeNull()
    })

    it('disables submit when email is empty', () => {
      const { container } = render(<AccountsLogin />)

      const button = container.querySelector(
        'button[type="submit"]',
      ) as HTMLButtonElement
      expect(button.disabled).toBe(true)
    })

    it('sends magic code and transitions to code step on success', async () => {
      mockSendMagicCode.mockResolvedValue({ sent: true })

      const { container } = render(<AccountsLogin />)

      const emailInput = container.querySelector(
        'input[type="email"]',
      ) as HTMLInputElement
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

      const form = container.querySelector('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(mockSendMagicCode).toHaveBeenCalledWith({
          email: 'test@example.com',
        })
      })

      // Should transition to the code step
      await waitFor(() => {
        expect(container.textContent).toContain('Enter the 6-digit code')
        expect(container.textContent).toContain('test@example.com')
      })
    })

    it('shows error when sendMagicCode fails', async () => {
      mockSendMagicCode.mockRejectedValue(new Error('Rate limited'))

      const { container } = render(<AccountsLogin />)

      const emailInput = container.querySelector(
        'input[type="email"]',
      ) as HTMLInputElement
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

      const form = container.querySelector('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        const alert = container.querySelector('[role="alert"]')
        expect(alert).not.toBeNull()
        expect(alert!.textContent).toBe('Rate limited')
      })
    })
  })

  describe('code step', () => {
    async function goToCodeStep(container: HTMLElement) {
      mockSendMagicCode.mockResolvedValue({ sent: true })

      const emailInput = container.querySelector(
        'input[type="email"]',
      ) as HTMLInputElement
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })

      const form = container.querySelector('form')!
      fireEvent.submit(form)

      await waitFor(() => {
        expect(container.textContent).toContain('Enter the 6-digit code')
      })
    }

    it('renders OTP input with 6 slots', async () => {
      const { container } = render(<AccountsLogin />)
      await goToCodeStep(container)

      const otpSlots = container.querySelectorAll('[data-slot="otp-slot"]')
      expect(otpSlots.length).toBe(6)
    })

    it('shows resend and back options', async () => {
      const { container } = render(<AccountsLogin />)
      await goToCodeStep(container)

      const buttons = container.querySelectorAll('button[type="button"]')
      const texts = Array.from(buttons).map((b) => b.textContent)

      expect(texts).toContain('Use a different email')
      expect(texts).toContain('Resend code')
    })

    it('goes back to email step when clicking back', async () => {
      const { container } = render(<AccountsLogin />)
      await goToCodeStep(container)

      const backButton = Array.from(
        container.querySelectorAll('button[type="button"]'),
      ).find((b) => b.textContent === 'Use a different email')!

      fireEvent.click(backButton)

      await waitFor(() => {
        expect(container.querySelector('input[type="email"]')).not.toBeNull()
      })
    })

    it('resends code when clicking resend', async () => {
      const { container } = render(<AccountsLogin />)
      await goToCodeStep(container)

      mockSendMagicCode.mockClear()
      mockSendMagicCode.mockResolvedValue({ sent: true })

      const resendButton = Array.from(
        container.querySelectorAll('button[type="button"]'),
      ).find((b) => b.textContent === 'Resend code')!

      fireEvent.click(resendButton)

      await waitFor(() => {
        expect(mockSendMagicCode).toHaveBeenCalledWith({
          email: 'test@example.com',
        })
      })
    })

    it('verifies code and redirects on success', async () => {
      mockSignInWithMagicCode.mockResolvedValue({
        user: { id: 'u1', email: 'test@example.com' },
      })

      const { container, rerender } = render(<AccountsLogin />)
      await goToCodeStep(container)

      // Simulate OTP completion via the captured callback
      expect(capturedOnComplete).not.toBeUndefined()
      await act(async () => {
        capturedOnComplete!('123456')
        await Promise.resolve()
      })

      expect(mockSignInWithMagicCode).toHaveBeenCalledWith({
        email: 'test@example.com',
        code: '123456',
      })

      // Redirect happens via useAuth() effect, not signInWithMagicCode return.
      // Simulate InstantDB reactively updating auth state.
      mockUseAuth.mockReturnValue({
        isLoading: false,
        user: { id: 'u1', email: 'test@example.com' },
        error: null,
      })
      await act(() => {
        rerender(<AccountsLogin />)
      })

      expect(mockPush).toHaveBeenCalledWith('/')
    })

    it('shows error and clears code when verification fails', async () => {
      mockSignInWithMagicCode.mockRejectedValue(new Error('Invalid code'))

      const { container } = render(<AccountsLogin />)
      await goToCodeStep(container)

      expect(capturedOnComplete).not.toBeUndefined()
      await act(async () => {
        capturedOnComplete!('999999')
        // Flush the .catch() microtask from the rejected promise
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      await waitFor(() => {
        const alert = container.querySelector('[role="alert"]')
        expect(alert).not.toBeNull()
        expect(alert!.textContent).toBe('Invalid code')
      })

      // Code should be cleared (OTP input value reset)
      const otpInput = container.querySelector('[data-testid="otp-input"]')
      expect(otpInput?.getAttribute('data-value')).toBe('')
    })
  })

  describe('Google OAuth', () => {
    it('calls signInWithIdToken on Google login success', async () => {
      mockSignInWithIdToken.mockResolvedValue({
        user: { id: 'u1', email: 'test@example.com' },
      })

      render(<AccountsLogin />)

      expect(mockGoogleLoginOnSuccess).not.toBeNull()
      await act(async () => {
        mockGoogleLoginOnSuccess!({ credential: 'mock-id-token' })
        await Promise.resolve()
      })

      expect(mockSignInWithIdToken).toHaveBeenCalledWith(
        expect.objectContaining({
          clientName: 'google-web',
          idToken: 'mock-id-token',
        }),
      )
    })

    it('shows error when Google login fails', async () => {
      const { container } = render(<AccountsLogin />)

      expect(mockGoogleLoginOnError).not.toBeNull()
      await act(async () => {
        mockGoogleLoginOnError!()
      })

      const alert = container.querySelector('[role="alert"]')
      expect(alert).not.toBeNull()
      expect(alert!.textContent).toBe(
        'Failed to sign in with Google. Try again.',
      )
    })

    it('shows error when signInWithIdToken rejects', async () => {
      mockSignInWithIdToken.mockRejectedValue(new Error('Token expired'))

      const { container } = render(<AccountsLogin />)

      await act(async () => {
        mockGoogleLoginOnSuccess!({ credential: 'mock-id-token' })
        await new Promise((resolve) => setTimeout(resolve, 0))
      })

      await waitFor(() => {
        const alert = container.querySelector('[role="alert"]')
        expect(alert).not.toBeNull()
        expect(alert!.textContent).toBe('Token expired')
      })
    })

    it('hides Google button when client ID is not set', () => {
      vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '')

      const { container } = render(<AccountsLogin />)

      const googleButton = container.querySelector(
        '[data-testid="google-login-button"]',
      )
      expect(googleButton).toBeNull()
    })

    it('transitions to code step on email submit', async () => {
      mockSendMagicCode.mockResolvedValue({ sent: true })

      const { container } = render(<AccountsLogin />)

      const emailInput = container.querySelector(
        'input[type="email"]',
      ) as HTMLInputElement
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } })
      const form = container.querySelector('form')!
      fireEvent.submit(form)

      // Component moves to code step immediately — Google button is gone
      await waitFor(() => {
        expect(container.textContent).toContain('Enter the 6-digit code')
        const googleButton = container.querySelector(
          '[data-testid="google-login-button"]',
        )
        expect(googleButton).toBeNull()
      })
    })

    it('redirects to home when useAuth returns authenticated user', () => {
      mockUseAuth.mockReturnValue({
        isLoading: false,
        user: { id: 'u1', email: 'test@example.com' },
        error: null,
      })

      render(<AccountsLogin />)

      expect(mockPush).toHaveBeenCalledWith('/')
    })

    it('does not redirect while auth is loading', () => {
      mockUseAuth.mockReturnValue({
        isLoading: true,
        user: null,
        error: null,
      })

      render(<AccountsLogin />)

      expect(mockPush).not.toHaveBeenCalled()
    })
  })
})
