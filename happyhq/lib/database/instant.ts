import { init } from '@instantdb/react'
import schema from './schema'

const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID

// When NEXT_PUBLIC_INSTANT_APP_ID is unset, db is null.
// Consumers must check before calling hooks.
export const db = appId ? init({ appId, schema }) : null
