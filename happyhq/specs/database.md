# Database

How Q stores and queries persistent data beyond the local filesystem.

## Purpose

Define the database layer for Q. InstantDB provides real-time data storage for user accounts, billing, and any data that needs to live beyond a single deployment's filesystem. This spec covers client and server SDK usage, schema conventions, permission rules, and common patterns.

The database layer is **optional** — it activates only when `ACCOUNTS_ENABLED` is set. A solo user running Q locally with their own API key never touches InstantDB. For filesystem-based data flows (streams, tasks, specs), see [Data Flow](data-flow.md).

## InstantDB Setup

Two SDKs, two contexts:

### Client SDK (`@instantdb/react`)

For React components — provides reactive queries and auth hooks.

```typescript
import { init } from '@instantdb/react'
import schema from './schema'

const db = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  schema,
})

export default db
```

### Admin SDK (`@instantdb/admin`)

For server actions and API routes — provides async queries and user management. **The admin SDK bypasses all permission rules.** Never expose the admin token to the client.

```typescript
import { init, id } from '@instantdb/admin'

const adminDb = init({
  appId: process.env.INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
})

export default adminDb
```

Use `id()` from the admin SDK to generate IDs for new entities.

## Schema Conventions

InstantDB schemas use three building blocks:

- **Namespaces** — tables (e.g., `users`, `subscriptions`)
- **Attributes** — typed fields on a namespace
- **Links** — bidirectional relationships between namespaces

### Attribute Types and Constraints

```typescript
i.entity({
  email: i.string().unique().indexed(), // unique + fast lookups
  name: i.string().optional(), // nullable
  settings: i.json<UserSettings>(), // typed JSON blob
  createdAt: i.date(),
  isActive: i.boolean(),
  loginCount: i.number(),
})
```

- `.unique()` — enforces uniqueness (use on emails, handles, slugs)
- `.indexed()` — enables comparison operators in queries (use on fields you filter/sort by)
- `.optional()` — makes the field nullable
- `.json<T>()` — stores arbitrary JSON with TypeScript type hint

### Links

Links are defined inside `i.schema({ links: {} })`, using `forward` and `reverse` objects:

```typescript
const schema = i.schema({
  entities: {
    /* ... */
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
  },
})
```

**Note**: `$users` (with `$` prefix) must always be on the `reverse` side of links per InstantDB requirement.

Links support `onDelete: 'cascade'` for automatic cleanup when the parent is deleted.

### Schema Management

Schema is defined in a single file and pushed to InstantDB via the CLI:

```shell
npx instant-cli push schema
```

## Reading Data (InstaQL)

### Client-Side (Reactive)

`db.useQuery()` returns live-updating data. Re-renders automatically when data changes.

```typescript
const { data, isLoading, error } = db.useQuery({ users: {} })
```

**Nested associations** — fetch related data in one query:

```typescript
const { data } = db.useQuery({
  users: {
    subscriptions: {}, // fetch user's subscriptions too
  },
})
// data.users[0].subscriptions → array of related subscriptions
```

**Filtering with `where`:**

```typescript
const { data } = db.useQuery({
  users: {
    $: { where: { email: 'user@example.com' } },
  },
})
```

**Comparison operators** (require `.indexed()` attributes):

```typescript
where: {
  createdAt: {
    $gt: someDate
  }
}
// Available: $gt, $lt, $gte, $lte
```

**Ordering and pagination:**

```typescript
$: {
  where: { isActive: true },
  order: { createdAt: 'desc' },
  limit: 10,
  offset: 0,
}
```

**Field selection** — fetch only the fields you need:

```typescript
$: {
  fields: ['id', 'email', 'name']
}
```

### Server-Side (Async)

Admin SDK queries are async one-shot calls, not reactive hooks.

```typescript
// Correct — async query
const data = await adminDb.query({ users: {} })

// Wrong — useQuery is a React hook, not available server-side
const data = adminDb.useQuery({ users: {} }) // ← does not exist
```

## Writing Data (InstaML)

All writes go through `db.transact()`. On the client SDK, `transact()` is optimistic and fire-and-forget — don't `await` it. On the admin SDK, `transact()` is async and should be awaited.

```typescript
import { id } from '@instantdb/react'

// Create
db.transact(
  db.tx.users[id()].update({
    email: 'user@example.com',
    createdAt: Date.now(),
  }),
)

// Update
db.transact(db.tx.users[userId].update({ name: 'New Name' }))

// Delete
db.transact(db.tx.users[userId].delete())

// Link
db.transact(db.tx.users[userId].link({ subscriptions: subscriptionId }))

// Unlink
db.transact(db.tx.users[userId].unlink({ subscriptions: subscriptionId }))
```

### `merge()` vs `update()` for Nested Objects

`update()` replaces the entire attribute value. `merge()` deep-merges without overwriting sibling keys.

```typescript
// If settings = { theme: 'dark', notifications: true }

// update() — replaces entire settings object
db.tx.users[userId].update({ settings: { theme: 'light' } })
// Result: settings = { theme: 'light' }  ← notifications lost!

// merge() — deep-merges, preserves sibling keys
db.tx.users[userId].merge({ settings: { theme: 'light' } })
// Result: settings = { theme: 'light', notifications: true }
```

Setting a key to `null` in `merge()` removes it from the object.

### `lookup()` for Upsert by Unique Attribute

When you don't have the ID but have a unique attribute:

```typescript
db.transact(
  db.tx.users[db.lookup('email', 'user@example.com')].update({
    name: 'Updated Name',
  }),
)
```

### Batch Size

Batch large operations to ~100 per `transact()` call to avoid the 5-second client timeout.

## Auth SDK Patterns

These are the InstantDB hooks and methods the accounts implementation should use. For the user-facing auth flows (magic code, OAuth, session management), see [Accounts](accounts.md).

### Checking Auth State

```typescript
// In components that handle both authed and unauthed states (e.g., login page)
const { isLoading, user, error } = db.useAuth()

// In components that are always behind auth (throws if not authenticated)
const user = db.useUser()

// Non-reactive check (for server-side or one-shot checks)
const user = await db.getAuth()
```

### Conditional Rendering

```tsx
<db.SignedIn>
  <Dashboard />
</db.SignedIn>
<db.SignedOut>
  <LoginPage />
</db.SignedOut>
```

### Magic Code Flow

Client SDK auth methods are fire-and-forget — don't `await` them. Auth state updates reactively via `db.useAuth()`.

```typescript
// Step 1: Send magic code to user's email
db.auth.sendMagicCode({ email }).catch((err) => {
  alert('Uh oh: ' + err.body?.message)
})

// Step 2: User enters code from email
db.auth.signInWithMagicCode({ email, code }).catch((err) => {
  alert('Uh oh: ' + err.body?.message)
})
```

### Google OAuth

```typescript
// Generate authorization URL and redirect
const url = db.auth.createAuthorizationURL({
  clientName: 'google',
  redirectURL: window.location.href,
})
window.location.href = url
// InstantDB auto-exchanges the code on redirect back
```

### Sign Out

```typescript
db.auth.signOut()
```

## Server-Side Auth (Admin SDK)

For API routes, middleware, and server actions that need to manage users or verify sessions.

### Token Creation and Verification

```typescript
// Create a token for a user (creates user if they don't exist)
const token = await adminDb.auth.createToken({ email })

// Verify a refresh token from a client request
const user = await adminDb.auth.verifyToken(refreshToken)
if (!user) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 })
}
```

### User Management

```typescript
// Look up a user
const user = await adminDb.auth.getUser({ email: 'user@example.com' })
const user = await adminDb.auth.getUser({ id: userId })

// Delete a user (removes user record + cascade-linked data only)
// Clean up Stripe subscription separately — see Billing spec
await adminDb.auth.deleteUser({ email: 'user@example.com' })

// Sign out a user from all sessions (server-side)
await adminDb.auth.signOut({ email: 'user@example.com' })
```

### User-Scoped Queries

Run admin queries that respect a user's permission rules (useful for API routes):

```typescript
const scopedDb = adminDb.asUser({ email: 'user@example.com' })
const data = await scopedDb.query({ users: {} })
// Only returns data the user is allowed to see per permission rules
```

## Permission Rules

InstantDB uses a CEL-based rule language to secure data. Rules are defined as JSON and pushed via the CLI or dashboard.

### Rule Structure

Four permission types per namespace:

```json
{
  "users": {
    "allow": {
      "view": "auth.id == data.id",
      "create": "false",
      "update": "auth.id == data.id",
      "delete": "false"
    }
  }
}
```

- **view** — evaluated during `useQuery()`, filters returned objects
- **create/update/delete** — evaluated per-object in transactions, transaction fails if unauthorized

### Rule Variables

| Variable  | Description                                          |
| --------- | ---------------------------------------------------- |
| `auth`    | Current authenticated user (`auth.id`, `auth.email`) |
| `data`    | The stored object being accessed                     |
| `newData` | The changes being made (only in `update`)            |

### Relationship Traversal with `ref()`

Check permissions based on related data:

```json
{
  "subscriptions": {
    "allow": {
      "view": "auth.id in data.ref('user.id')"
    }
  }
}
```

`data.ref()` and `auth.ref()` **always return lists** — use `in`, not `==`.

### Reusable Binds

```json
{
  "users": {
    "allow": {
      "update": "isOwner",
      "delete": "isOwner"
    },
    "bind": {
      "isOwner": "auth.id != null && auth.id == data.id"
    }
  }
}
```

### Field-Level Permissions

Hide sensitive fields from other users:

```json
{
  "$users": {
    "allow": { "view": "true" },
    "fields": {
      "email": "auth.id == data.id"
    }
  }
}
```

### Secure Defaults

Lock down a namespace and whitelist specific operations:

```json
{
  "users": {
    "allow": {
      "$default": "false",
      "view": "auth.id == data.id"
    }
  }
}
```

### v0 Rules

For v0 (single-tenant, accounts-only), minimal rules:

```json
{
  "users": {
    "allow": {
      "view": "auth.id == data.id",
      "update": "auth.id == data.id",
      "create": "false",
      "delete": "false"
    }
  }
}
```

Users are created and deleted via the admin SDK (which bypasses rules), so `create` and `delete` are locked on the client side.

### Deploying Rules

```shell
npx instant-cli push perms
```

## Common Mistakes

These are pitfalls from InstantDB's own docs that are easy to hit during implementation:

| Mistake                                     | Fix                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Using `db.useQuery()` server-side           | Admin SDK uses `db.query()` (async). `useQuery` is a React hook — it doesn't exist on the admin SDK.                                                                                                                                                                                                                                                                                                                   |
| `data.ref()` with `==`                      | `ref()` always returns a list. Use `in` operator: `auth.id in data.ref('user.id')`                                                                                                                                                                                                                                                                                                                                     |
| `update()` on nested JSON objects           | Use `merge()` to deep-merge without losing sibling keys. `update()` replaces the entire attribute value.                                                                                                                                                                                                                                                                                                               |
| Expecting password auth                     | InstantDB has no built-in password auth. Use magic codes or OAuth.                                                                                                                                                                                                                                                                                                                                                     |
| Large transactions timing out               | Client SDK has a 5-second timeout. Batch to ~100 operations per `transact()` call.                                                                                                                                                                                                                                                                                                                                     |
| Trusting client-side admin queries          | Admin SDK bypasses ALL permission rules. Never expose `INSTANT_APP_ADMIN_TOKEN` to the client.                                                                                                                                                                                                                                                                                                                         |
| Setting `null` in `merge()` expecting no-op | Setting a key to `null` in `merge()` removes that key from the object.                                                                                                                                                                                                                                                                                                                                                 |
| `await`ing client SDK methods               | Client SDK is fire-and-forget. Don't `await` `transact()`, `auth.sendMagicCode()`, `auth.signInWithMagicCode()`, `storage.delete()`, etc. Use `.catch()` for error handling. State updates flow reactively via hooks (`useAuth`, `useQuery`). Only `await` when you need the return value (e.g., `storage.uploadFile()` returns a file ID). The admin SDK is the opposite — all methods are async and must be awaited. |
| Inverting link cardinality                  | `has: 'one'` goes on the entity that belongs to one parent (forward side), `has: 'many'` goes on the parent that owns multiple children (reverse side). E.g., a subscription `has: 'one'` user (forward), a user `has: 'many'` subscriptions (reverse). Getting this backwards silently corrupts queries — linked data returns empty arrays or wrong results instead of erroring.                                      |

## Environment Variables

| Variable                     | Required              | Description                               |
| ---------------------------- | --------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_INSTANT_APP_ID` | When accounts enabled | InstantDB app ID (exposed to client)      |
| `INSTANT_APP_ID`             | When accounts enabled | InstantDB app ID (server-side)            |
| `INSTANT_APP_ADMIN_TOKEN`    | When accounts enabled | InstantDB admin token for server-side ops |

## Code Location

```
lib/accounts/
  schema.ts          — Shared schema (entities, links) for both client and admin SDK
  instant.ts         — Client SDK initialization
  instant.server.ts  — Admin SDK initialization (lazy singleton, server-only)
  permissions.json   — InstantDB permission rules
```

Database client modules live alongside the accounts code they serve. Billing entities (`subscriptions`, `usage`, `taskRuns`) are defined in `schema.ts` alongside users — the schema is shared infrastructure, not EE code. EE billing code (`ee/lib/billing/`) reads and writes to these tables via the admin SDK from `instant.server.ts`.

## InstantDB Documentation

LLM-friendly docs for deeper reference (append `.md` to any doc URL for markdown):

- [Auth](https://www.instantdb.com/docs/auth) — magic codes, OAuth, session hooks
- [Permissions](https://www.instantdb.com/docs/permissions) — rule language, CEL expressions, field-level access
- [Backend / Admin SDK](https://www.instantdb.com/docs/backend) — server-side queries, token management, user ops
- [Modeling Data](https://www.instantdb.com/docs/modeling-data) — schema design, constraints, relationships
- [InstaQL (Reading)](https://www.instantdb.com/docs/instaql) — query syntax, filtering, pagination
- [InstaML (Writing)](https://www.instantdb.com/docs/instaml) — transactions, merge vs update, lookup
- [Common Mistakes](https://www.instantdb.com/docs/common-mistakes) — pitfalls and fixes
- [Full LLM Reference](https://www.instantdb.com/llms-full.txt) — comprehensive single-file documentation

## Cross-References

- [Accounts](accounts.md) — uses auth SDK patterns and user schema
- [Billing](billing.md) — uses schema, transactions, permission rules
- [Data Flow](data-flow.md) — filesystem reads/writes (different layer, same app)
- [Auth](auth.md) — password gate and Anthropic credentials (separate from database auth)
