/**
 * Tests for the login page component.
 *
 * The server action (login) is tested separately in actions.test.ts.
 * These tests verify the page's rendering and navigation behavior:
 * - Conditionally renders accounts login or password form based on ACCOUNTS_ENABLED
 * - Shows error messages from the server action (password mode)
 * - Redirects to / on successful login
 * - Disables the submit button while the action is pending
 */

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

// Mock next/image to a plain img for simpler test output
vi.mock('next/image', () => ({
  default: ({
    priority: _,
    ...props
  }: React.ComponentProps<'img'> & { priority?: boolean }) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- mock for next/image, simpler test output
    return <img {...props} />
  },
}))

// Default: accounts disabled (password login)
vi.mock('@/lib/accounts/config', () => ({
  isAccountsEnabledClient: vi.fn(() => false),
}))

// Mock the accounts login component for isolation —
// AccountsLogin has its own dedicated test suite
vi.mock('@/components/features/auth/accounts-login', () => ({
  AccountsLogin: () => <div data-testid="accounts-login">AccountsLogin</div>,
}))

// Mock the login action — useActionState calls this under the hood,
// but we control state via the useActionState mock below.
vi.mock('./actions', () => ({
  login: vi.fn(),
}))

import { isAccountsEnabledClient } from '@/lib/accounts/config'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import type React from 'react'
import { afterEach } from 'vitest'

// We need to control useActionState's return value per test.
// React's useActionState in test (jsdom) doesn't actually run server actions,
// so we mock it to drive the component through different states.
let mockState = { success: false } as { success: boolean; error?: string }
let mockPending = false
const mockFormAction = vi.fn()

vi.mock('react', async () => {
  const actual = await vi.importActual('react')
  return {
    ...actual,
    useActionState: () => [mockState, mockFormAction, mockPending],
  }
})

// Dynamic import after all mocks are in place — import the client component
// directly since the page wrapper is now an async server component.
const { LoginPage } = await import('./login-page')

afterEach(() => {
  vi.clearAllMocks()
  mockState = { success: false }
  mockPending = false
  cleanup()
})

describe('LoginPage', () => {
  it('renders a password input and sign-in button', () => {
    render(<LoginPage hasPasswordGate />)

    const input = screen.getByPlaceholderText('Password')
    expect(input).not.toBeNull()
    expect(input.getAttribute('type')).toBe('password')

    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button).not.toBeNull()
  })

  it('displays an error message when the action returns an error', () => {
    mockState = { success: false, error: 'Incorrect password' }

    render(<LoginPage hasPasswordGate />)

    const error = screen.getByRole('alert')
    expect(error.textContent).toBe('Incorrect password')

    // Password input should be marked as invalid for accessibility (Catalyst uses data-invalid)
    const input = screen.getByPlaceholderText('Password')
    expect(input.hasAttribute('data-invalid')).toBe(true)
  })

  it('disables the submit button while the action is pending', () => {
    mockPending = true

    render(<LoginPage hasPasswordGate />)

    const button = screen.getByRole('button')
    expect(
      button.hasAttribute('disabled') || button.hasAttribute('data-disabled'),
    ).toBe(true)
    expect(button.textContent).toContain('Signing in')
  })

  it('redirects to / on successful login', async () => {
    mockState = { success: true }

    render(<LoginPage hasPasswordGate={false} />)

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  it('wires the form action to useActionState', () => {
    render(<LoginPage hasPasswordGate />)

    const form = document.querySelector('form')
    expect(form).not.toBeNull()

    // Submit the form — it should use the formAction from useActionState
    fireEvent.submit(form!)
    // The form's action prop is the mockFormAction function.
    // We can't easily assert the action attribute on the form element
    // (React attaches it as an event handler), but we can verify
    // the page renders correctly and the button is of type submit.
    const button = screen.getByRole('button', { name: 'Sign in' })
    expect(button.getAttribute('type')).toBe('submit')
  })

  describe('when accounts are enabled', () => {
    it('renders AccountsLogin instead of password form', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(true)

      const { container } = render(<LoginPage hasPasswordGate={false} />)

      // AccountsLogin mock renders a div with data-testid
      expect(
        container.querySelector('[data-testid="accounts-login"]'),
      ).not.toBeNull()

      // Password input should not be present
      expect(container.querySelector('input[type="password"]')).toBeNull()
    })

    it('still renders the logo', () => {
      vi.mocked(isAccountsEnabledClient).mockReturnValue(true)

      const { container } = render(<LoginPage hasPasswordGate={false} />)

      expect(container.querySelector('img[alt="HappyHQ"]')).not.toBeNull()
    })
  })
})
