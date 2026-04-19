import type { AppConfig, ResolvedConfig } from './types'

/**
 * Default values for every config field.
 * Sourced from the hardcoded constants that were previously the only option.
 */
export const CONFIG_DEFAULTS: ResolvedConfig = {
  models: {
    learning: { model: 'opus', thinking: 'adaptive' },
    planning: { model: 'opus', thinking: 'adaptive' },
    working: { model: 'opus', thinking: 'adaptive' },
  },
  limits: {
    planningBudgetUsd: 5,
    workingBudgetUsd: 10,
    maxIterations: 20,
  },
  general: {
    sidebarDefault: 'open',
    sendWithEnter: true,
  },
  appearance: {
    homeBranding: 'none',
  },
  git: {
    authorName: '',
    authorEmail: '',
  },
}

/** Deep-merge a partial AppConfig over CONFIG_DEFAULTS. */
export function resolveConfig(partial: AppConfig): ResolvedConfig {
  return {
    models: {
      learning: {
        model:
          partial.models?.learning?.model ??
          CONFIG_DEFAULTS.models.learning.model,
        thinking:
          partial.models?.learning?.thinking ??
          CONFIG_DEFAULTS.models.learning.thinking,
      },
      planning: {
        model:
          partial.models?.planning?.model ??
          CONFIG_DEFAULTS.models.planning.model,
        thinking:
          partial.models?.planning?.thinking ??
          CONFIG_DEFAULTS.models.planning.thinking,
      },
      working: {
        model:
          partial.models?.working?.model ??
          CONFIG_DEFAULTS.models.working.model,
        thinking:
          partial.models?.working?.thinking ??
          CONFIG_DEFAULTS.models.working.thinking,
      },
    },
    limits: {
      planningBudgetUsd:
        partial.limits?.planningBudgetUsd ??
        CONFIG_DEFAULTS.limits.planningBudgetUsd,
      workingBudgetUsd:
        partial.limits?.workingBudgetUsd ??
        CONFIG_DEFAULTS.limits.workingBudgetUsd,
      maxIterations:
        partial.limits?.maxIterations ?? CONFIG_DEFAULTS.limits.maxIterations,
    },
    general: {
      sidebarDefault:
        partial.general?.sidebarDefault ??
        CONFIG_DEFAULTS.general.sidebarDefault,
      sendWithEnter:
        partial.general?.sendWithEnter ?? CONFIG_DEFAULTS.general.sendWithEnter,
    },
    appearance: {
      homeBranding:
        partial.appearance?.homeBranding ??
        CONFIG_DEFAULTS.appearance.homeBranding,
    },
    git: {
      authorName: partial.git?.authorName ?? CONFIG_DEFAULTS.git.authorName,
      authorEmail: partial.git?.authorEmail ?? CONFIG_DEFAULTS.git.authorEmail,
    },
  }
}
