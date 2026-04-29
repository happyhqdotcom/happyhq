import { getAdminDb } from '@/lib/database/instant.server'
import { getStripeClient } from './stripe.server'

/**
 * Creates a Stripe Customer Portal session so the user can manage
 * their subscription (upgrade, downgrade, cancel, update payment method).
 * Returns the portal URL for client-side redirect.
 *
 * Throws if the user has no Stripe customer (free users who never upgraded).
 */
export async function createPortalSession(userId: string): Promise<string> {
  const adminDb = getAdminDb()

  // Look up user's Stripe customer ID
  const userData = await adminDb.query({
    $users: { $: { where: { id: userId } } },
  })
  const user = userData.$users?.[0]

  if (!user?.stripeCustomerId) {
    throw new Error('No billing account found. Subscribe to a plan first.')
  }

  const stripe = getStripeClient()
  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.APP_URL ?? 'http://localhost:3000'}/settings/billing`,
  })

  return session.url
}
