import { describe, expect, it } from 'vitest'

import { nextStarterState, type Starter } from './create-stream-dialog'

const BLANK: Starter = { id: 'blank', label: 'Blank', intent: '' }
const PRD: Starter = {
  id: 'prd',
  label: 'PRD draft',
  intent: 'When I share a fuzzy product idea, draft a PRD…',
}
const BUG: Starter = {
  id: 'bug',
  label: 'Bug triage',
  intent: 'When I send a bug report…',
}

describe('nextStarterState', () => {
  it('overwrites when intent is empty', () => {
    expect(nextStarterState({ next: PRD, current: BLANK, intent: '' })).toEqual(
      { starterId: 'prd', intent: PRD.intent },
    )
  })

  it('overwrites when intent matches the previously-picked starter verbatim', () => {
    // User picked PRD then clicks Bug without editing — switch should land.
    expect(
      nextStarterState({ next: BUG, current: PRD, intent: PRD.intent }),
    ).toEqual({ starterId: 'bug', intent: BUG.intent })
  })

  it('treats whitespace-only intent as empty', () => {
    expect(
      nextStarterState({ next: PRD, current: BLANK, intent: '   \n  ' }),
    ).toEqual({ starterId: 'prd', intent: PRD.intent })
  })

  it('is a no-op when the user has typed custom text', () => {
    expect(
      nextStarterState({
        next: BUG,
        current: PRD,
        intent: 'my own thing I typed',
      }),
    ).toBeNull()
  })

  it('is a no-op when intent is a tweaked version of the current preset', () => {
    // Even a one-character edit counts as "edited" — we'd rather no-op than
    // silently destroy work.
    expect(
      nextStarterState({
        next: BUG,
        current: PRD,
        intent: PRD.intent + '!',
      }),
    ).toBeNull()
  })

  it('handles a missing current starter (e.g. unknown id) as unedited only when empty', () => {
    // Defensive: `current` may be undefined if starterId points at a removed
    // template. With empty intent we still let the new pick land.
    expect(
      nextStarterState({ next: PRD, current: undefined, intent: '' }),
    ).toEqual({ starterId: 'prd', intent: PRD.intent })
    expect(
      nextStarterState({ next: PRD, current: undefined, intent: 'typed' }),
    ).toBeNull()
  })
})
