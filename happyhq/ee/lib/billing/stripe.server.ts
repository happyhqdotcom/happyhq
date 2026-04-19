import { getAdminDb } from '@/lib/database/instant.server'
import Stripe from 'stripe'

let stripeClient: Stripe | null = null

/**
 * Returns the Stripe client instance, initializing lazily on first call.
 * Throws if STRIPE_SECRET_KEY is not set.
 */
export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient

  const secretKey = process.env.STRIPE_SECRET_KEY
  if (!secretKey) {
    throw new Error(
      'STRIPE_SECRET_KEY is required for billing. Set it in your environment.',
    )
  }

  stripeClient = new Stripe(secretKey)
  return stripeClient
}

/**
 * Returns the user's Stripe customer ID, creating a new Stripe customer
 * if one doesn't exist yet. Stores the customer ID in InstantDB on creation.
 *
 * Free users have no Stripe customer — this is called on first upgrade attempt.
 */
export async function getOrCreateStripeCustomer(
  userId: string,
  email: string,
): Promise<string> {
  const adminDb = getAdminDb()

  // Check if user already has a Stripe customer ID
  const userData = await adminDb.query({
    $users: { $: { where: { id: userId } } },
  })
  const user = userData.$users?.[0]

  if (user?.stripeCustomerId) {
    return user.stripeCustomerId
  }

  // Create new Stripe customer
  const stripe = getStripeClient()
  const customer = await stripe.customers.create({
    email,
    metadata: { instantdb_user_id: userId },
  })

  // Store customer ID in InstantDB
  await adminDb.transact(
    adminDb.tx.$users[userId].update({ stripeCustomerId: customer.id }),
  )

  return customer.id
}

/**
 * Cancels the user's active Stripe subscription and updates InstantDB.
 * No-op if the user has no Stripe customer or no active subscription.
 * Used by account deletion flow (ACCT-6b).
 */
export async function cancelSubscription(userId: string): Promise<void> {
  const adminDb = getAdminDb()

  // Fetch user's Stripe customer ID and subscriptions in a single query
  const result = await adminDb.query({
    $users: { $: { where: { id: userId } } },
    subscriptions: { $: { where: { 'user.id': userId } } },
  })
  const user = result.$users?.[0]

  if (!user?.stripeCustomerId) {
    // Free user — no Stripe customer, nothing to cancel
    return
  }

  const subscription = result.subscriptions?.find(
    (s) => s.status === 'active' || s.status === 'past_due',
  )

  if (!subscription) {
    // No active subscription to cancel
    return
  }

  // Mark for cancellation at end of billing period — user keeps paid access
  // until then, and no prorated refund is issued. Stripe fires
  // customer.subscription.deleted when the period ends, which sets status
  // to 'canceled' in InstantDB via the webhook handler.
  const stripe = getStripeClient()
  await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
    cancel_at_period_end: true,
  })
}
