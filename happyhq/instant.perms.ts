// Docs: https://www.instantdb.com/docs/permissions
//
// All billing entities are read-only to the owning user.
// Writes happen exclusively via the admin SDK (Stripe webhooks, usage tracking).

import type { InstantRules } from '@instantdb/core'

const rules: InstantRules = {
  $users: {
    allow: {
      view: 'auth.id == data.id',
      update: 'auth.id == data.id',
      create: 'auth.id == data.id',
      delete: 'false',
    },
  },
  subscriptions: {
    allow: {
      view: "auth.id in data.ref('user.id')",
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  usage: {
    allow: {
      view: "auth.id in data.ref('user.id')",
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  taskRuns: {
    allow: {
      view: "auth.id in data.ref('user.id') || auth.id in data.ref('usagePeriod.user.id')",
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  $files: {
    allow: {
      view: 'true',
      create: "data.path.startsWith(auth.id + '/')",
      update: "data.path.startsWith(auth.id + '/')",
      delete: "data.path.startsWith(auth.id + '/')",
    },
  },
}

export default rules
