'use server'

import { computeHmac } from '@/lib/auth/hmac'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'q-auth'
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 // 30 days in seconds

/**
 * Server action: validate password and set auth cookie.
 * Returns { success: true } on match, { success: false, error: string } on mismatch.
 */
export async function login(
  _prevState: { success: boolean; error?: string },
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const password = formData.get('password')

  if (typeof password !== 'string' || password.length === 0) {
    return { success: false, error: 'Password is required' }
  }

  const expectedPassword = process.env.Q_PASSWORD
  if (!expectedPassword) {
    // No password configured — shouldn't reach login in this case,
    // but handle gracefully
    return { success: false, error: 'Authentication is not configured' }
  }

  if (password !== expectedPassword) {
    return { success: false, error: 'Incorrect password' }
  }

  const hmac = await computeHmac(expectedPassword)
  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, hmac, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  })

  return { success: true }
}
