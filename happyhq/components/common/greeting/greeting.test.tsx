import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getGreeting } from './greeting'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('getGreeting', () => {
  it('returns "Good morning" before noon', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(8)
    expect(getGreeting().text).toBe('Good morning')
  })

  it('returns "Good afternoon" from noon to 4pm', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(14)
    expect(getGreeting().text).toBe('Good afternoon')
  })

  it('returns "Good afternoon" at exactly noon', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(12)
    expect(getGreeting().text).toBe('Good afternoon')
  })

  it('returns "Good evening" at 5pm and later', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(17)
    expect(getGreeting().text).toBe('Good evening')
  })

  it('returns "Good evening" at midnight boundary (hour 0) is morning', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(0)
    expect(getGreeting().text).toBe('Good morning')
  })

  it('returns "Good afternoon" at boundary hour 16', () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(16)
    expect(getGreeting().text).toBe('Good afternoon')
  })
})

describe('Greeting component', () => {
  it('renders the greeting with prompt', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(10)

    const { Greeting } = await import('./greeting')
    render(<Greeting />)

    expect(screen.getByText(/good morning/i)).not.toBeNull()
    expect(
      screen.getByRole('heading', { name: /what should we work on/i }),
    ).not.toBeNull()
  })

  it('renders afternoon variant', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(14)

    const { Greeting } = await import('./greeting')
    render(<Greeting />)

    expect(screen.getByText(/good afternoon/i)).not.toBeNull()
    expect(
      screen.getByRole('heading', { name: /what should we work on/i }),
    ).not.toBeNull()
  })

  it('omits the Q glyph by default', async () => {
    vi.spyOn(Date.prototype, 'getHours').mockReturnValue(10)

    const { Greeting } = await import('./greeting')
    render(<Greeting />)

    expect(screen.queryByAltText('Q')).toBeNull()
  })
})
