import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

describe('UsageIndicator', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows remaining minutes for short durations', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 18,
          includedMinutes: 60,
          remainingMinutes: 42,
          remainingPercent: 70,
        }}
      />,
    )
    expect(container.textContent).toBe('42m left')
  })

  it('shows remaining time in hours and minutes for long durations', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'pro',
          usedMinutes: 165,
          includedMinutes: 300,
          remainingMinutes: 135,
          remainingPercent: 45,
        }}
      />,
    )
    expect(container.textContent).toBe('2h 15m left')
  })

  it('shows "No runtime left" when minutes are exhausted', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 60,
          includedMinutes: 60,
          remainingMinutes: 0,
          remainingPercent: 0,
        }}
      />,
    )
    expect(container.textContent).toBe('No runtime left')
  })

  it('uses red color when less than 25% remaining', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 50,
          includedMinutes: 60,
          remainingMinutes: 10,
          remainingPercent: 16.7,
        }}
      />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-red-500')
  })

  it('uses amber color when between 25% and 50% remaining', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 40,
          includedMinutes: 60,
          remainingMinutes: 20,
          remainingPercent: 33.3,
        }}
      />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-amber-500')
  })

  it('uses muted color when more than 50% remaining', async () => {
    const { UsageIndicator } = await import('./usage-indicator')
    const { container } = render(
      <UsageIndicator
        data={{
          currentTier: 'starter',
          usedMinutes: 10,
          includedMinutes: 60,
          remainingMinutes: 50,
          remainingPercent: 83.3,
        }}
      />,
    )
    const span = container.querySelector('span')
    expect(span?.className).toContain('text-muted-foreground')
  })
})

describe('TierBadge', () => {
  it('renders capitalized tier name', async () => {
    const { TierBadge } = await import('./usage-indicator')
    const { container } = render(<TierBadge tier="starter" />)
    expect(container.textContent).toBe('Starter')
  })

  it('renders Free for free tier', async () => {
    const { TierBadge } = await import('./usage-indicator')
    const { container } = render(<TierBadge tier="free" />)
    expect(container.textContent).toBe('Free')
  })
})
