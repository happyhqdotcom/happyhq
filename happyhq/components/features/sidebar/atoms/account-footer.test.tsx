import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockUseCurrentUser = vi.hoisted(() => vi.fn())
const mockUseQuery = vi.hoisted(() => vi.fn())
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

vi.mock('@/lib/database/instant', () => ({
  db: { useQuery: mockUseQuery },
}))

vi.mock('@/components/common/ui/sidebar', () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu">{children}</div>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sidebar-menu-item">{children}</div>
  ),
}))

// Mock Catalyst Popover to render inline (no portals) for jsdom.
vi.mock('@/components/common/catalyst/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover">{children}</div>
  ),
  PopoverButton: ({
    children,
    ...props
  }: {
    children: React.ReactNode
    className?: string
  }) => (
    <button data-testid="popover-button" {...props}>
      {children}
    </button>
  ),
  PopoverPanel: ({
    children,
  }: {
    children: React.ReactNode
    anchor?: string
    className?: string
  }) => <div data-testid="popover-panel">{children}</div>,
}))

// Mock Catalyst Avatar to render inline
vi.mock('@/components/common/catalyst/avatar', () => ({
  Avatar: ({
    initials,
    src,
    alt,
  }: {
    initials?: string
    src?: string | null
    alt?: string
    square?: boolean
    className?: string
  }) => (
    <div data-slot="avatar" data-initials={initials} data-alt={alt}>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element -- mock renders plain img for test simplicity
        <img data-slot="avatar-image" src={src} alt={alt ?? ''} />
      )}
      {!src && initials && <span data-slot="avatar-fallback">{initials}</span>}
    </div>
  ),
}))

// Mock HeadlessUI CloseButton to render as a plain button
vi.mock('@headlessui/react', () => ({
  CloseButton: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode
    as?: string
    onClick?: () => void
    className?: string
  }) => (
    <button data-testid="menu-item" onClick={onClick} className={className}>
      {children}
    </button>
  ),
}))

// Mock lucide-react icons to simple spans
vi.mock('lucide-react', () => ({
  ChevronsUpDown: () => <span data-testid="icon-chevrons" />,
  Settings: () => <span data-testid="icon-settings" />,
}))

describe('AccountFooter', () => {
  beforeEach(() => {
    mockUseCurrentUser.mockReturnValue({
      user: { id: 'user-1', email: 'alice@example.com', createdAt: 0 },
      isLoading: false,
      isAuthenticated: true,
    })
    mockUseQuery.mockImplementation((query: Record<string, unknown> | null) => {
      if (!query) return { data: null }
      if ('$users' in query) {
        return {
          data: {
            $users: [
              {
                id: 'user-1',
                email: 'alice@example.com',
                name: 'Alice Smith',
                avatar: null,
              },
            ],
          },
        }
      }
      return { data: { subscriptions: [], usage: [] } }
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders nothing when user is loading', async () => {
    mockUseCurrentUser.mockReturnValue({
      user: null,
      isLoading: true,
      isAuthenticated: false,
    })
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing when user is not authenticated', async () => {
    mockUseCurrentUser.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    })
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    expect(container.innerHTML).toBe('')
  })

  it('renders user initials as avatar fallback when no avatar URL', async () => {
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    // "Alice Smith" → "AS"
    const fallbacks = container.querySelectorAll(
      '[data-slot="avatar-fallback"]',
    )
    const hasInitials = Array.from(fallbacks).some(
      (el) => el.textContent === 'AS',
    )
    expect(hasInitials).toBe(true)
  })

  it('renders first letter of email when no name is available', async () => {
    mockUseQuery.mockImplementation((query: Record<string, unknown> | null) => {
      if (!query) return { data: null }
      if ('$users' in query) {
        return {
          data: {
            $users: [
              {
                id: 'user-1',
                email: 'alice@example.com',
                name: null,
                avatar: null,
              },
            ],
          },
        }
      }
      return { data: { subscriptions: [], usage: [] } }
    })
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    const fallbacks = container.querySelectorAll(
      '[data-slot="avatar-fallback"]',
    )
    const hasInitial = Array.from(fallbacks).some(
      (el) => el.textContent === 'A',
    )
    expect(hasInitial).toBe(true)
  })

  it('displays user email in the footer', async () => {
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    expect(container.textContent).toContain('alice@example.com')
  })

  it('displays user name in the footer', async () => {
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    expect(container.textContent).toContain('Alice Smith')
  })

  it('renders avatar image when user has an avatar URL', async () => {
    mockUseQuery.mockImplementation((query: Record<string, unknown> | null) => {
      if (!query) return { data: null }
      if ('$users' in query) {
        return {
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
        }
      }
      return { data: { subscriptions: [], usage: [] } }
    })
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    const avatarImages = container.querySelectorAll(
      '[data-slot="avatar-image"]',
    )
    const hasAvatar = Array.from(avatarImages).some(
      (el) => el.getAttribute('src') === 'https://example.com/avatar.jpg',
    )
    expect(hasAvatar).toBe(true)
  })

  it('has a Settings menu item that navigates to settings', async () => {
    const { AccountFooter } = await import('./account-footer')
    const { container } = render(<AccountFooter />)
    const items = container.querySelectorAll('[data-testid="menu-item"]')
    const settingsItem = Array.from(items).find((el) =>
      el.textContent?.includes('Settings'),
    ) as HTMLElement | undefined
    expect(settingsItem).toBeDefined()

    settingsItem!.click()
    expect(mockRouter.push).toHaveBeenCalledWith('/settings')
  })
})
