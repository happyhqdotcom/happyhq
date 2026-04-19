import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush } = vi.hoisted(() => ({
  mockPush: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

const { mockMutate } = vi.hoisted(() => ({
  mockMutate: vi.fn(),
}))

vi.mock('swr', () => ({
  mutate: mockMutate,
}))

// jsdom lacks scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

import SetupPage from './page'

// Helper to create a successful JSON response
function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

let mockFetch: ReturnType<typeof vi.fn>

beforeEach(() => {
  mockFetch = vi.fn()
  vi.stubGlobal('fetch', mockFetch)
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function renderSetup() {
  render(<SetupPage />)
}

describe('SetupPage', () => {
  describe('choice mode', () => {
    it('shows both sign-in options', () => {
      renderSetup()
      expect(
        screen.getByRole('button', { name: /sign in with claude/i }),
      ).not.toBeNull()
      expect(
        screen.getByRole('button', { name: /use an api key/i }),
      ).not.toBeNull()
    })

    it('"Sign in with Claude" calls POST /api/auth/login and transitions to oauth mode on success', async () => {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          url: 'https://claude.ai/oauth/authorize?foo=bar',
          sessionId: 'sess-123',
        }),
      )
      renderSetup()

      fireEvent.click(
        screen.getByRole('button', { name: /sign in with claude/i }),
      )

      await waitFor(() => {
        // Should have called the login endpoint
        expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', {
          method: 'POST',
        })
        // Should transition to oauth mode — "Submit code" button appears
        expect(
          screen.getByRole('button', { name: /submit code/i }),
        ).not.toBeNull()
      })

      // Should have opened the OAuth URL
      expect(window.open).toHaveBeenCalledWith(
        'https://claude.ai/oauth/authorize?foo=bar',
        '_blank',
        'noopener,noreferrer',
      )
    })
  })

  describe('oauth mode', () => {
    // Helper to navigate to oauth mode
    async function enterOAuthMode() {
      mockFetch.mockReturnValueOnce(
        jsonResponse({
          url: 'https://claude.ai/oauth/authorize?test=1',
          sessionId: 'sess-abc',
        }),
      )
      renderSetup()
      fireEvent.click(
        screen.getByRole('button', { name: /sign in with claude/i }),
      )
      await waitFor(() => {
        expect(
          screen.getByRole('button', { name: /submit code/i }),
        ).not.toBeNull()
      })
      mockFetch.mockClear()
    }

    it('Submit code button is disabled when input is empty', async () => {
      await enterOAuthMode()
      const submitBtn = screen.getByRole('button', { name: /submit code/i })
      expect(submitBtn.getAttribute('disabled')).not.toBeNull()
    })

    it('Submit code button is disabled while submitting', async () => {
      await enterOAuthMode()

      // Make the code exchange hang forever
      mockFetch.mockReturnValueOnce(new Promise(() => {}))

      const input = screen.getByPlaceholderText(/paste your code/i)
      fireEvent.change(input, { target: { value: 'auth-code-123' } })
      fireEvent.click(screen.getByRole('button', { name: /submit code/i }))

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /signing in/i })
        expect(btn.getAttribute('disabled')).not.toBeNull()
      })
    })

    it('successful code exchange redirects to /', async () => {
      await enterOAuthMode()
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }))
      mockMutate.mockResolvedValueOnce(undefined)

      const input = screen.getByPlaceholderText(/paste your code/i)
      fireEvent.change(input, { target: { value: 'auth-code-123' } })
      fireEvent.click(screen.getByRole('button', { name: /submit code/i }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      })
    })

    it('failed code exchange displays error', async () => {
      await enterOAuthMode()
      mockFetch.mockReturnValueOnce(
        jsonResponse({ error: 'Invalid code' }, 400),
      )

      const input = screen.getByPlaceholderText(/paste your code/i)
      fireEvent.change(input, { target: { value: 'bad-code' } })
      fireEvent.click(screen.getByRole('button', { name: /submit code/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).not.toBeNull()
      })
    })

    it('Enter key submits the code', async () => {
      await enterOAuthMode()
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }))
      mockMutate.mockResolvedValueOnce(undefined)

      const input = screen.getByPlaceholderText(/paste your code/i)
      fireEvent.change(input, { target: { value: 'auth-code-123' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      })
    })

    it('Back button returns to choice mode and clears oauth state', async () => {
      await enterOAuthMode()

      fireEvent.click(screen.getByRole('button', { name: /back/i }))

      // Should be back in choice mode
      expect(
        screen.getByRole('button', { name: /sign in with claude/i }),
      ).not.toBeNull()
      // Submit code should no longer be visible
      expect(screen.queryByRole('button', { name: /submit code/i })).toBeNull()
    })

    it('auto-polls /api/auth/status and redirects when authenticated', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })

      mockFetch.mockReturnValueOnce(
        jsonResponse({
          url: 'https://claude.ai/oauth/authorize?test=1',
          sessionId: 'sess-abc',
        }),
      )
      renderSetup()

      fireEvent.click(
        screen.getByRole('button', { name: /sign in with claude/i }),
      )

      // Wait for the login fetch to resolve and mode to transition
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100)
      })

      expect(
        screen.getByRole('button', { name: /submit code/i }),
      ).not.toBeNull()

      // Set up the poll response — authenticated
      mockFetch.mockReturnValueOnce(jsonResponse({ authenticated: true }))
      mockMutate.mockResolvedValueOnce(undefined)

      // Advance past the 3-second poll interval
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })

      expect(mockFetch).toHaveBeenCalledWith('/api/auth/status')
      expect(mockPush).toHaveBeenCalledWith('/')
    })
  })

  describe('apikey mode', () => {
    // Helper to navigate to apikey mode
    function enterApiKeyMode() {
      renderSetup()
      fireEvent.click(screen.getByRole('button', { name: /use an api key/i }))
    }

    it('"Use an API key" button transitions to apikey mode', () => {
      enterApiKeyMode()
      // Should show password input
      const input = screen.getByPlaceholderText(/sk-ant/i)
      expect(input).not.toBeNull()
      expect(input.getAttribute('type')).toBe('password')
    })

    it('Save button is disabled when input is empty', () => {
      enterApiKeyMode()
      const saveBtn = screen.getByRole('button', { name: /save api key/i })
      expect(saveBtn.getAttribute('disabled')).not.toBeNull()
    })

    it('Save button is disabled while loading', async () => {
      enterApiKeyMode()
      mockFetch.mockReturnValueOnce(new Promise(() => {}))

      const input = screen.getByPlaceholderText(/sk-ant/i)
      fireEvent.change(input, { target: { value: 'sk-ant-test-key' } })
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }))

      await waitFor(() => {
        const btn = screen.getByRole('button', { name: /saving/i })
        expect(btn.getAttribute('disabled')).not.toBeNull()
      })
    })

    it('successful API key submit redirects to /', async () => {
      enterApiKeyMode()
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }))
      mockMutate.mockResolvedValueOnce(undefined)

      const input = screen.getByPlaceholderText(/sk-ant/i)
      fireEvent.change(input, { target: { value: 'sk-ant-test-key' } })
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }))

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      })
    })

    it('failed API key submit displays error', async () => {
      enterApiKeyMode()
      mockFetch.mockReturnValueOnce(
        jsonResponse({ error: 'Invalid API key' }, 400),
      )

      const input = screen.getByPlaceholderText(/sk-ant/i)
      fireEvent.change(input, { target: { value: 'bad-key' } })
      fireEvent.click(screen.getByRole('button', { name: /save api key/i }))

      await waitFor(() => {
        expect(screen.getByRole('alert')).not.toBeNull()
      })
    })

    it('Enter key submits the API key', async () => {
      enterApiKeyMode()
      mockFetch.mockReturnValueOnce(jsonResponse({ success: true }))
      mockMutate.mockResolvedValueOnce(undefined)

      const input = screen.getByPlaceholderText(/sk-ant/i)
      fireEvent.change(input, { target: { value: 'sk-ant-test-key' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/')
      })
    })

    it('Back button returns to choice mode and clears apikey state', () => {
      enterApiKeyMode()

      // Type something first
      const input = screen.getByPlaceholderText(/sk-ant/i)
      fireEvent.change(input, { target: { value: 'sk-ant-partial' } })

      fireEvent.click(screen.getByRole('button', { name: /back/i }))

      // Should be back in choice mode
      expect(
        screen.getByRole('button', { name: /sign in with claude/i }),
      ).not.toBeNull()
      // API key input should no longer be visible
      expect(screen.queryByPlaceholderText(/sk-ant/i)).toBeNull()
    })
  })
})
