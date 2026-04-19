// Shared InstantDB schema — imported by both client SDK (@instantdb/react)
// and admin SDK (@instantdb/admin). Uses @instantdb/core to avoid pulling
// React into server-only code.

import { i } from '@instantdb/core'

const schema = i.schema({
  entities: {
    // $users is InstantDB's built-in users table. Custom attributes extend it.
    // InstantDB auth populates email automatically; we add profile fields.
    $users: i.entity({
      email: i.string().unique().indexed(),
      name: i.string().optional(),
      createdAt: i.date().optional(),
      stripeCustomerId: i.string().optional(),
    }),
    subscriptions: i.entity({
      stripeSubscriptionId: i.string().indexed(),
      tier: i.string(), // "free" | "starter" | "pro" | "max"
      status: i.string(), // "active" | "past_due" | "canceled"
      currentPeriodStart: i.date(),
      currentPeriodEnd: i.date(),
    }),
    usage: i.entity({
      periodStart: i.date(),
      periodEnd: i.date(),
      usedMinutes: i.number(),
      includedMinutes: i.number(),
    }),
    taskRuns: i.entity({
      stream: i.string(),
      task: i.string(),
      startedAt: i.date(),
      endedAt: i.date().optional(),
      minutes: i.number(),
      costUsd: i.number().optional(),
      status: i.string(), // "running" | "completed" | "aborted" | "failed"
    }),
    $files: i.entity({
      'content-disposition': i.string().indexed(),
      'content-type': i.string().indexed(),
      deleted_at: i.date().optional().indexed(),
      'key-version': i.number(),
      'location-id': i.string().unique().indexed(),
      path: i.string().unique().indexed(),
      size: i.number().indexed(),
      url: i.string(),
    }),
  },
  links: {
    userSubscriptions: {
      forward: { on: 'subscriptions', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'many', label: 'subscriptions' },
    },
    userUsage: {
      forward: { on: 'usage', has: 'one', label: 'user' },
      reverse: { on: '$users', has: 'many', label: 'usage' },
    },
    usageTaskRuns: {
      forward: { on: 'taskRuns', has: 'one', label: 'usagePeriod' },
      reverse: { on: 'usage', has: 'many', label: 'taskRuns' },
    },
    userAvatar: {
      forward: { on: '$users', has: 'one', label: 'avatar' },
      reverse: { on: '$files', has: 'one', label: 'user' },
    },
  },
})

export type AppSchema = typeof schema
export default schema
