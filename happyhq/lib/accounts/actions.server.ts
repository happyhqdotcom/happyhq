'use server'

import { getAdminDb } from '@/lib/database/instant.server'
import { isAccountsEnabled } from './config'

/**
 * Delete the user's account. The caller (API route) is responsible for
 * authenticating the user and passing their verified userId.
 * Optionally runs a cleanup callback (e.g. cancel Stripe subscription)
 * before deleting the InstantDB user.
 */
export async function deleteAccount(
  userId: string,
  onBeforeDelete?: (userId: string) => Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  if (!isAccountsEnabled()) {
    return { success: false, error: 'Accounts are not enabled' }
  }

  try {
    // Run billing cleanup (cancel subscription, etc.) before deleting user
    if (onBeforeDelete) {
      await onBeforeDelete(userId)
    }

    const adminDb = getAdminDb()

    // Delete avatar file from storage if one exists
    const result = await adminDb.query({
      $users: { $: { where: { id: userId } }, avatar: {} },
    })
    const avatarPath = result.$users?.[0]?.avatar?.path
    if (avatarPath) {
      await adminDb.storage.delete(avatarPath as string)
    }

    await adminDb.auth.deleteUser({ id: userId })

    return { success: true }
  } catch (err) {
    console.error('[deleteAccount] Failed to delete account:', err)
    return {
      success: false,
      error: 'Failed to delete account. Please try again.',
    }
  }
}
