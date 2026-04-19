import { id, init } from '@instantdb/admin'
import schema from './schema'

export { id }

type AdminDb = ReturnType<typeof init<typeof schema>>

let adminDb: AdminDb | null = null

/**
 * Returns the InstantDB admin SDK instance, initializing lazily on first call.
 * Throws if NEXT_PUBLIC_INSTANT_APP_ID or INSTANT_APP_ADMIN_TOKEN is missing —
 * these are only required when server code actually needs admin access.
 */
export function getAdminDb(): AdminDb {
  if (adminDb) return adminDb

  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN

  if (!appId) {
    throw new Error(
      'NEXT_PUBLIC_INSTANT_APP_ID is required for admin SDK. Set it in your environment.',
    )
  }
  if (!adminToken) {
    throw new Error(
      'INSTANT_APP_ADMIN_TOKEN is required for admin SDK. Set it in your environment.',
    )
  }

  adminDb = init({ appId, adminToken, schema })
  return adminDb
}
