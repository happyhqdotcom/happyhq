import { createCheckoutSession } from '@/ee/lib/billing/checkout.server'
import type { TierName } from '@/ee/lib/billing/types'
import { requireAuth } from '@/lib/accounts/auth.server'
import { getAdminDb } from '@/lib/database/instant.server'
import { log } from '@/lib/log.server'

const VALID_TIERS: TierName[] = ['starter', 'pro', 'max']

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { userId } = auth

  let body: { tier: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.tier || !VALID_TIERS.includes(body.tier as TierName)) {
    return Response.json(
      { error: 'Invalid tier. Must be one of: starter, pro, max' },
      { status: 400 },
    )
  }

  try {
    // Get user email for Stripe customer creation
    const adminDb = getAdminDb()
    const result = await adminDb.query({
      $users: { $: { where: { id: userId } } },
    })
    const email = (result.$users?.[0]?.email as string) ?? ''

    const url = await createCheckoutSession(
      userId,
      email,
      body.tier as TierName,
    )
    return Response.json({ url })
  } catch (error) {
    log('api.error', {
      route: '/api/billing/checkout',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Checkout failed' },
      { status: 500 },
    )
  }
}
