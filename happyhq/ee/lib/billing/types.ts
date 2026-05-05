// Billing types matching the InstantDB schema entities.
// These types describe the shape of billing data stored in InstantDB.

export type TierName = 'free' | 'starter' | 'pro' | 'max'

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled'

export type TaskRunStatus = 'running' | 'completed' | 'aborted' | 'failed'

export type TierLimits = {
  /** Monthly price in USD cents. */
  priceMonthly: number
  /** Included runtime in minutes per billing period. */
  runtimeMinutes: number
  /** Storage limit in bytes. */
  storageBytes: number
  /** Maximum number of streams. Infinity for unlimited. */
  streams: number
  /** Maximum number of specs per stream. Infinity for unlimited. */
  specsPerStream: number
  /** Maximum number of users. Infinity for unlimited. */
  users: number
}

export type Subscription = {
  id: string
  stripeSubscriptionId: string
  tier: TierName
  status: SubscriptionStatus
  currentPeriodStart: number
  currentPeriodEnd: number
}

export type Usage = {
  id: string
  periodStart: number
  periodEnd: number
  usedMinutes: number
  includedMinutes: number
}

export type TaskRun = {
  id: string
  stream: string
  task: string
  startedAt: number
  endedAt?: number
  minutes: number
  costUsd?: number
  status: TaskRunStatus
}
