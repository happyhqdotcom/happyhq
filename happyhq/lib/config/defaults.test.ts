import fc from 'fast-check'
import { describe, expect, it } from 'vitest'

import { CONFIG_DEFAULTS, resolveConfig } from './defaults'
import type { AppConfig } from './types'

describe('resolveConfig', () => {
  it('returns full defaults when given an empty config', () => {
    const resolved = resolveConfig({})
    expect(resolved).toEqual(CONFIG_DEFAULTS)
  })

  it('overrides a single nested field while keeping other defaults', () => {
    const resolved = resolveConfig({
      models: { learning: { model: 'haiku' } },
    })
    expect(resolved.models.learning.model).toBe('haiku')
    // Other learning fields remain default
    expect(resolved.models.learning.thinking).toBe('adaptive')
    // Other model sections remain default
    expect(resolved.models.planning.model).toBe('opus')
    expect(resolved.models.working.model).toBe('opus')
  })

  it('overrides limits independently', () => {
    const resolved = resolveConfig({
      limits: { maxIterations: 50 },
    })
    expect(resolved.limits.maxIterations).toBe(50)
    expect(resolved.limits.discoveryBudgetUsd).toBe(2)
    expect(resolved.limits.planningBudgetUsd).toBe(5)
    expect(resolved.limits.workingBudgetUsd).toBe(10)
  })

  it('resolves discovery model and budget to Opus + adaptive defaults', () => {
    const resolved = resolveConfig({})
    expect(resolved.models.discovery.model).toBe('opus')
    expect(resolved.models.discovery.thinking).toBe('adaptive')
    expect(typeof resolved.limits.discoveryBudgetUsd).toBe('number')
    expect(resolved.limits.discoveryBudgetUsd).toBe(2)
  })

  it('overrides discovery budget independently', () => {
    const resolved = resolveConfig({
      limits: { discoveryBudgetUsd: 4 },
    })
    expect(resolved.limits.discoveryBudgetUsd).toBe(4)
    expect(resolved.limits.planningBudgetUsd).toBe(5)
    expect(resolved.limits.workingBudgetUsd).toBe(10)
  })

  it('overrides discovery model independently', () => {
    const resolved = resolveConfig({
      models: { discovery: { model: 'sonnet' } },
    })
    expect(resolved.models.discovery.model).toBe('sonnet')
    expect(resolved.models.discovery.thinking).toBe('adaptive')
    expect(resolved.models.planning.model).toBe('opus')
    expect(resolved.models.working.model).toBe('opus')
  })

  it('overrides general preferences', () => {
    const resolved = resolveConfig({
      general: { sendWithEnter: false },
    })
    expect(resolved.general.sendWithEnter).toBe(false)
    expect(resolved.general.sidebarDefault).toBe('open')
  })

  it('overrides appearance settings', () => {
    const resolved = resolveConfig({
      appearance: { homeBranding: 'none' },
    })
    expect(resolved.appearance.homeBranding).toBe('none')
  })

  it('overrides git identity', () => {
    const resolved = resolveConfig({
      git: { authorName: 'Alice', authorEmail: 'alice@example.com' },
    })
    expect(resolved.git.authorName).toBe('Alice')
    expect(resolved.git.authorEmail).toBe('alice@example.com')
  })

  it('handles multiple sections overridden at once', () => {
    const resolved = resolveConfig({
      models: { working: { model: 'sonnet', thinking: 'disabled' } },
      limits: { planningBudgetUsd: 20 },
      appearance: { homeBranding: 'poolside' },
    })
    expect(resolved.models.working.model).toBe('sonnet')
    expect(resolved.models.working.thinking).toBe('disabled')
    expect(resolved.limits.planningBudgetUsd).toBe(20)
    expect(resolved.appearance.homeBranding).toBe('poolside')
    // Untouched sections remain default
    expect(resolved.models.learning.model).toBe('opus')
    expect(resolved.general.sendWithEnter).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Property-based tests
// ---------------------------------------------------------------------------

const modelConfig = fc.record(
  {
    model: fc.constantFrom(
      'haiku' as const,
      'sonnet' as const,
      'opus' as const,
    ),
    thinking: fc.constantFrom(
      'adaptive' as const,
      'enabled' as const,
      'disabled' as const,
    ),
  },
  { requiredKeys: [] },
)

const partialAppConfig: fc.Arbitrary<AppConfig> = fc.record(
  {
    models: fc.record(
      {
        learning: modelConfig,
        discovery: modelConfig,
        planning: modelConfig,
        working: modelConfig,
      },
      { requiredKeys: [] },
    ),
    limits: fc.record(
      {
        discoveryBudgetUsd: fc.nat(100),
        planningBudgetUsd: fc.nat(100),
        workingBudgetUsd: fc.nat(100),
        maxIterations: fc.nat(50),
      },
      { requiredKeys: [] },
    ),
    general: fc.record(
      {
        sidebarDefault: fc.constantFrom('open' as const, 'collapsed' as const),
        sendWithEnter: fc.boolean(),
      },
      { requiredKeys: [] },
    ),
    appearance: fc.record(
      {
        homeBranding: fc.constantFrom(
          'stickers' as const,
          'poolside' as const,
          'logo' as const,
          'q' as const,
          'random' as const,
          'none' as const,
        ),
      },
      { requiredKeys: [] },
    ),
    git: fc.record(
      { authorName: fc.string(), authorEmail: fc.string() },
      { requiredKeys: [] },
    ),
  },
  { requiredKeys: [] },
)

describe('property-based: resolveConfig', () => {
  it('always produces a fully populated config — no undefined fields', () => {
    fc.assert(
      fc.property(partialAppConfig, (partial) => {
        const resolved = resolveConfig(partial)

        for (const mode of [
          'learning',
          'discovery',
          'planning',
          'working',
        ] as const) {
          expect(resolved.models[mode].model).toBeDefined()
          expect(resolved.models[mode].thinking).toBeDefined()
        }
        expect(typeof resolved.limits.discoveryBudgetUsd).toBe('number')
        expect(typeof resolved.limits.planningBudgetUsd).toBe('number')
        expect(typeof resolved.limits.workingBudgetUsd).toBe('number')
        expect(typeof resolved.limits.maxIterations).toBe('number')
        expect(typeof resolved.general.sidebarDefault).toBe('string')
        expect(typeof resolved.general.sendWithEnter).toBe('boolean')
        expect(typeof resolved.appearance.homeBranding).toBe('string')
        expect(typeof resolved.git.authorName).toBe('string')
        expect(typeof resolved.git.authorEmail).toBe('string')
      }),
    )
  })

  it('user values always take precedence over defaults', () => {
    fc.assert(
      fc.property(partialAppConfig, (partial) => {
        const resolved = resolveConfig(partial)

        if (partial.models?.learning?.model)
          expect(resolved.models.learning.model).toBe(
            partial.models.learning.model,
          )
        if (partial.models?.planning?.thinking)
          expect(resolved.models.planning.thinking).toBe(
            partial.models.planning.thinking,
          )
        if (partial.limits?.maxIterations !== undefined)
          expect(resolved.limits.maxIterations).toBe(
            partial.limits.maxIterations,
          )
        if (partial.general?.sendWithEnter !== undefined)
          expect(resolved.general.sendWithEnter).toBe(
            partial.general.sendWithEnter,
          )
        if (partial.appearance?.homeBranding)
          expect(resolved.appearance.homeBranding).toBe(
            partial.appearance.homeBranding,
          )
        if (partial.git?.authorName !== undefined)
          expect(resolved.git.authorName).toBe(partial.git.authorName)
      }),
    )
  })

  it('is idempotent — resolving an already-resolved config changes nothing', () => {
    fc.assert(
      fc.property(partialAppConfig, (partial) => {
        const once = resolveConfig(partial)
        const twice = resolveConfig(once)
        expect(twice).toEqual(once)
      }),
    )
  })

  it('missing fields always fall back to defaults', () => {
    fc.assert(
      fc.property(partialAppConfig, (partial) => {
        const resolved = resolveConfig(partial)

        // If a field wasn't set in partial, it should match the default
        if (!partial.models?.learning?.model)
          expect(resolved.models.learning.model).toBe(
            CONFIG_DEFAULTS.models.learning.model,
          )
        if (partial.limits?.planningBudgetUsd === undefined)
          expect(resolved.limits.planningBudgetUsd).toBe(
            CONFIG_DEFAULTS.limits.planningBudgetUsd,
          )
        if (partial.general?.sidebarDefault === undefined)
          expect(resolved.general.sidebarDefault).toBe(
            CONFIG_DEFAULTS.general.sidebarDefault,
          )
      }),
    )
  })
})
