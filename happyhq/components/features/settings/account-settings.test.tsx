import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Mock dependencies
const mockUseCurrentUser = vi.hoisted(() => vi.fn())
const mockUseQuery = vi.hoisted(() => vi.fn())
const mockUpdateProfile = vi.hoisted(() => vi.fn())
const mockSignOut = vi.hoisted(() => vi.fn())
const mockRouter = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
}))

vi.mock('@/lib/accounts/hooks', () => ({
  useCurrentUser: mockUseCurrentUser,
}))

// Deep proxy that mimics InstantDB's tx chainable API:
// db.tx.$users[id].update({...}) / .link({...}) / .unlink({...})
const mockTxProxy = () => {
  const handler: ProxyHandler<object> = {
    get: () => new Proxy(() => new Proxy({}, handler), handler),
  }
  return new Proxy({}, handler)
}

vi.mock('@/lib/database/instant', () => ({
  db: {
    useQuery: mockUseQuery,
    auth: { signOut: mockSignOut },
    transact: vi.fn(),
    tx: mockTxProxy(),
  },
}))

vi.mock('@/lib/accounts/actions.server', () => ({
  updateProfile: mockUpdateProfile,
}))

vi.mock('@/lib/database/files/upload-avatar', () => ({
  uploadAvatar: vi.fn().mockResolvedValue(undefined),
}))

// Mock Catalyst Avatar to render inline without Next.js Image complexity
vi.mock('@/components/common/catalyst/avatar', () => ({
  Avatar: ({
    src,
    initials,
    alt,
    className,
  }: {
    src?: string | null
    initials?: string
    alt?: string
    className?: string
  }) => (
    <span data-slot="avatar" className={className}>
      {src?.startsWith('http') ? (
        <img src={src} alt={alt ?? ''} />
      ) : (
        initials && <span>{initials}</span>
      )}
    </span>
  ),
}))

vi.mock('lucide-react', () => ({
  Pencil: () => <span data-testid="icon-pencil" />,
}))

// Mock DeleteAlert to avoid headless UI complexity in tests.
// Uses data-testid attributes for reliable querying.
const mockOnClose = vi.hoisted(() => vi.fn())
const mockOnDelete = vi.hoisted(() => vi.fn())

vi.mock('@/components/common/shared/delete-alert', () => ({
  DeleteAlert: ({
    open,
    onClose,
    onDelete,
  }: {
    open: boolean
    onClose: () => void
    onDelete: () => void
    title: string
    description: string
  }) => {
    // Store callbacks so tests can invoke them directly
    mockOnClose.mockImplementation(onClose)
    mockOnDelete.mockImplementation(onDelete)
    return open ? <div data-testid="delete-alert" /> : null
  },
}))

describe('AccountSettings', () => {
  const originalBillingEnabled = process.env.NEXT_PUBLIC_BILLING_ENABLED

  beforeEach(() => {
    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'alice@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })
    mockUseQuery.mockReturnValue({
      data: {
        $users: [
          {
            id: 'user-1',
            email: 'alice@example.com',
            name: 'Alice',
            avatar: null,
          },
        ],
      },
    })
    mockUpdateProfile.mockResolvedValue({ success: true })
    mockSignOut.mockReturnValue(undefined)
    mockOnClose.mockReset()
    mockOnDelete.mockReset()
    delete process.env.NEXT_PUBLIC_BILLING_ENABLED
    // Reset fetch mock
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        }),
      ),
    )
  })

  afterEach(() => {
    if (originalBillingEnabled !== undefined) {
      process.env.NEXT_PUBLIC_BILLING_ENABLED = originalBillingEnabled
    } else {
      delete process.env.NEXT_PUBLIC_BILLING_ENABLED
    }
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders nothing when user is not authenticated', async () => {
    mockUseCurrentUser.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    })
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    expect(container.innerHTML).toBe('')
  })

  it('shows loading state while auth is loading', async () => {
    mockUseCurrentUser.mockReturnValue({
      user: null,
      isLoading: true,
      isAuthenticated: false,
    })
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    expect(container.textContent).toContain('Loading')
  })

  it('displays user email as read-only', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    // Email is displayed as text (not an input) in compact row layout
    expect(container.textContent).toContain('alice@example.com')
  })

  it('displays user name as editable', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const nameInput = container.querySelector(
      '#settings-name',
    ) as HTMLInputElement
    expect(nameInput).not.toBeNull()
    expect(nameInput.value).toBe('Alice')
    expect(nameInput.disabled).toBe(false)
  })

  it('save button is hidden when name has not changed', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const saveButton = container.querySelector('button[type="submit"]')
    expect(saveButton).toBeNull()
  })

  it('save button is enabled after editing name', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const nameInput = container.querySelector(
      '#settings-name',
    ) as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Bob' } })
    const saveButton = container.querySelector(
      'button[type="submit"]',
    ) as HTMLButtonElement
    expect(saveButton.disabled).toBe(false)
  })

  it('calls updateProfile on form submit with edited name', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const nameInput = container.querySelector(
      '#settings-name',
    ) as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement

    fireEvent.change(nameInput, { target: { value: 'Bob' } })
    await act(async () => {
      fireEvent.submit(form)
    })

    const { db } = await import('@/lib/database/instant')
    expect(db!.transact).toHaveBeenCalled()
  })

  it('shows success message immediately on save (fire-and-forget)', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const nameInput = container.querySelector(
      '#settings-name',
    ) as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement

    fireEvent.change(nameInput, { target: { value: 'Bob' } })
    await act(async () => {
      fireEvent.submit(form)
    })

    // Save is fire-and-forget — success shown immediately, no error state
    const alert = container.querySelector('[role="alert"]')
    expect(alert).toBeNull()
  })

  it('shows success message after saving', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const nameInput = container.querySelector(
      '#settings-name',
    ) as HTMLInputElement
    const form = container.querySelector('form') as HTMLFormElement

    fireEvent.change(nameInput, { target: { value: 'Bob' } })
    await act(async () => {
      fireEvent.submit(form)
    })

    const status = container.querySelector('[role="status"]')
    expect(status).not.toBeNull()
    expect(status!.textContent).toBe('Saved')
  })

  it('does not show billing link (billing moved to sidebar)', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const billingLink = container.querySelector('a[href="/settings/billing"]')
    expect(billingLink).toBeNull()
  })

  it('shows avatar when user has one', async () => {
    mockUseQuery.mockReturnValue({
      data: {
        $users: [
          {
            id: 'user-1',
            email: 'alice@example.com',
            name: 'Alice',
            avatar: {
              url: 'https://example.com/avatar.jpg',
              path: 'user-1/avatar',
            },
          },
        ],
      },
    })
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img).not.toBeNull()
    expect(img.src).toBe('https://example.com/avatar.jpg')
  })

  it('does not render a log out button (sign-out moved to settings sidebar)', async () => {
    const { AccountSettings } = await import('./account-settings')
    render(<AccountSettings />)
    expect(screen.queryByRole('button', { name: /log out/i })).toBeNull()
  })

  // --- Delete account tests ---

  it('renders a way to delete the account', async () => {
    const { AccountSettings } = await import('./account-settings')
    render(<AccountSettings />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('shows confirmation dialog when delete is clicked', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)

    // Confirmation dialog should not be visible initially
    expect(container.querySelector('[data-testid="delete-alert"]')).toBeNull()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    })

    // Confirmation dialog should now be visible
    expect(
      container.querySelector('[data-testid="delete-alert"]'),
    ).not.toBeNull()
  })

  it('calls delete API and redirects on confirmation', async () => {
    const { AccountSettings } = await import('./account-settings')
    render(<AccountSettings />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    })

    // Invoke the onDelete callback captured by the mock
    await act(async () => {
      mockOnDelete()
    })

    expect(global.fetch).toHaveBeenCalledWith('/api/accounts/delete', {
      method: 'POST',
      headers: {},
    })
    expect(mockSignOut).toHaveBeenCalled()
    expect(mockRouter.push).toHaveBeenCalledWith('/login')
  })

  it('shows error when delete API fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Failed to delete account' }),
        }),
      ),
    )

    const { AccountSettings } = await import('./account-settings')
    render(<AccountSettings />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    })

    // Invoke the onDelete callback captured by the mock
    await act(async () => {
      mockOnDelete()
    })

    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('dismisses confirmation dialog on cancel', async () => {
    const { AccountSettings } = await import('./account-settings')
    const { container } = render(<AccountSettings />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    })

    expect(
      container.querySelector('[data-testid="delete-alert"]'),
    ).not.toBeNull()

    // Invoke the onClose callback captured by the mock
    await act(async () => {
      mockOnClose()
    })

    expect(container.querySelector('[data-testid="delete-alert"]')).toBeNull()
  })
})
