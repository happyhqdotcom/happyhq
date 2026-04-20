import { verifyHmac } from '@/lib/auth/hmac'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

/**
 * Middleware handles ONLY the password gate (Q_PASSWORD).
 *
 * DO NOT add an InstantDB / accounts auth check here. InstantDB syncs its
 * session cookie asynchronously after sign-in, so middleware runs before the
 * cookie exists — causing an infinite redirect loop (/login → / → /login).
 * This approach was attempted and reverted more than once.
 *
 * Accounts auth is handled client-side by AuthGuard (db.SignedIn/db.SignedOut)
 * in the (app) layout, which reads InstantDB's reactive auth state directly.
 */
export async function middleware(request: NextRequest) {
  const password = process.env.Q_PASSWORD

  if (!password) {
    return NextResponse.next()
  }

  // Password gate
  const cookie = request.cookies.get('q-auth')
  const validPassword = cookie && (await verifyHmac(cookie.value, password))
  if (!validPassword) {
    const loginUrl = new URL('/login', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - /login (the login page itself, to avoid redirect loops)
     * - /setup (API auth setup — reached after password auth, not a security bypass)
     * - /api/health (unauthenticated liveness probe — used by platform health
     *   checks and the run-loop self-ping, must not redirect)
     * - /_next/static (static file serving)
     * - /_next/image (image optimization)
     * - /favicon.ico (browser favicon request)
     */
    '/((?!login|setup|api/health|_next/static|_next/image|favicon\\.ico|.*\\.png$).*)',
  ],
}
