import { getOrCreateStripeCustomer, getStripeClient } from './stripe.server'
import type { TierName } from './types'

/**
 * Maps tier names to Stripe price IDs from environment variables.
 * Free tier has no price — users downgrade by canceling their subscription.
 */
function getStripePriceId(tier: TierName): string {
  const priceIds: Record<string, string | undefined> = {
    starter: process.env.STRIPE_PRICE_ID_STARTER,
    pro: process.env.STRIPE_PRICE_ID_PRO,
    max: process.env.STRIPE_PRICE_ID_MAX,
  }

  const priceId = priceIds[tier]
  if (!priceId) {
    throw new Error(
      `No Stripe price ID configured for tier "${tier}". Set STRIPE_PRICE_ID_${tier.toUpperCase()} in your environment.`,
    )
  }

  return priceId
}

/**
 * Creates a Stripe Checkout session for a tier upgrade.
 * Ensures a Stripe customer exists (or creates one) before starting checkout.
 * Returns the Checkout session URL for client-side redirect.
 */
export async function createCheckoutSession(
  userId: string,
  email: string,
  tier: TierName,
): Promise<string> {
  if (tier === 'free') {
    throw new Error('Cannot create checkout for free tier')
  }

  const stripe = getStripeClient()
  const customerId = await getOrCreateStripeCustomer(userId, email)
  const priceId = getStripePriceId(tier)

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/settings/billing?checkout=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'}/settings/billing?checkout=canceled`,
    customer_update: { address: 'auto' },
    // Tier name stored in metadata so the webhook handler can read it
    // without reverse-mapping price IDs.
    metadata: { tier },
  })

  if (!session.url) {
    throw new Error('Stripe Checkout session created but no URL returned')
  }

  return session.url
}
