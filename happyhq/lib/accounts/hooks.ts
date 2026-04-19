import { db } from '@/lib/database/instant'
import { isAccountsEnabledClient } from './config'
import type { User } from './types'

export type CurrentUserResult = {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  /** Auth token for passing to server actions that need billing verification. */
  token: string | undefined
}

// Stable reference returned when accounts are disabled.
// Module-level constant avoids new objects per render (React 19 strict equality).
const DISABLED_RESULT: CurrentUserResult = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  token: undefined,
}

/**
 * Returns the current authenticated user when accounts are enabled.
 * When accounts are disabled, returns a stable static result immediately.
 */
export function useCurrentUser(): CurrentUserResult {
  if (!isAccountsEnabledClient() || !db) {
    return DISABLED_RESULT
  }

  const auth = db.useAuth()

  if (auth.isLoading) {
    return {
      user: null,
      isLoading: true,
      isAuthenticated: false,
      token: undefined,
    }
  }

  if (auth.error) {
    return {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      token: undefined,
    }
  }

  const instantUser = auth.user
  if (!instantUser) {
    return {
      user: null,
      isLoading: false,
      isAuthenticated: false,
      token: undefined,
    }
  }

  // Map InstantDB's User shape to our app's User type.
  // InstantDB provides id, email, refresh_token. Custom fields (name, avatarUrl,
  // createdAt) are on the $users entity and require a separate query — useAuth()
  // only returns the auth identity. For now, surface what useAuth() gives us.
  const user: User = {
    id: instantUser.id,
    email: instantUser.email ?? '',
    createdAt: 0, // Not available from useAuth(); populated when full profile is loaded
  }

  return {
    user,
    isLoading: false,
    isAuthenticated: true,
    token: instantUser.refresh_token,
  }
}
