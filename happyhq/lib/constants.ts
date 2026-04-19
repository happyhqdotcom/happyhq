export const MODEL_IDS = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
} as const

export const MAX_ITERATIONS = 20

export const PLANNING_BUDGET_USD = 5
export const WORKING_BUDGET_USD = 10

/** $11/hr LLM cost = 60 minutes of billed work time */
export const LLM_COST_PER_MINUTE_USD = 11 / 60
