import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { UpgradePrompt } from './upgrade-prompt'

// Mock fetch globally
const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('UpgradePrompt', () => {
  describe('inline variant (default)', () => {
    it('renders title and upgrade button', () => {
      const { container } = render(<UpgradePrompt title="Runtime exhausted" />)
      expect(container.textContent).toContain('Runtime exhausted')
      const btn = container.querySelector('button')
      expect(btn).not.toBeNull()
      expect(btn!.textContent).toContain('Upgrade')
    })

    it('renders description when provided', () => {
      const { container } = render(
        <UpgradePrompt
          title="Runtime exhausted"
          description="Get more hours"
        />,
      )
      expect(container.textContent).toContain('Get more hours')
    })

    it('posts to checkout API and redirects on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'https://checkout.stripe.com/test' }),
      })

      const originalHref = window.location.href
      // Mock location assignment
      const hrefSetter = vi.fn()
      Object.defineProperty(window, 'location', {
        value: {
          ...window.location,
          get href() {
            return originalHref
          },
          set href(v: string) {
            hrefSetter(v)
          },
        },
        writable: true,
        configurable: true,
      })

      const { container } = render(<UpgradePrompt title="Upgrade" />)
      const btn = container.querySelector('button')!
      fireEvent.click(btn)

      // Wait for async operation
      await vi.waitFor(() => {
        expect(mockFetch).toHaveBeenCalledWith('/api/billing/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: 'starter' }),
        })
      })

      await vi.waitFor(() => {
        expect(hrefSetter).toHaveBeenCalledWith(
          'https://checkout.stripe.com/test',
        )
      })
    })

    it('shows error when checkout fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'No active session' }),
      })

      const { container } = render(<UpgradePrompt title="Upgrade" />)
      fireEvent.click(container.querySelector('button')!)

      await vi.waitFor(() => {
        expect(container.textContent).toContain('No active session')
      })
    })
  })

  describe('overlay variant', () => {
    it('renders centered layout with title and description', () => {
      const { container } = render(
        <UpgradePrompt
          variant="overlay"
          title="All runtime used"
          description="Upgrade to continue"
        />,
      )
      expect(container.textContent).toContain('All runtime used')
      expect(container.textContent).toContain('Upgrade to continue')
      expect(container.querySelector('button')!.textContent).toContain(
        'Upgrade plan',
      )
    })

    it('disables button during checkout', async () => {
      // Never resolve to keep loading state
      mockFetch.mockReturnValueOnce(new Promise(() => {}))

      const { container } = render(
        <UpgradePrompt variant="overlay" title="Upgrade" />,
      )
      const btn = container.querySelector('button')!
      fireEvent.click(btn)

      await vi.waitFor(() => {
        expect(btn.disabled).toBe(true)
        expect(btn.textContent).toContain('Redirecting')
      })
    })
  })
})
