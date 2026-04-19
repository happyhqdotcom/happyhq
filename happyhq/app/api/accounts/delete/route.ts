import { deleteAccount } from '@/lib/accounts/actions.server'
import { requireAuth } from '@/lib/accounts/auth.server'

export async function POST(request: Request) {
  const auth = await requireAuth(request)
  if (auth.error) return auth.error
  const { userId } = auth

  // When billing is enabled, cancel Stripe subscription before deleting user.
  // Dynamic import keeps core code free of static EE dependencies.
  let onBeforeDelete: ((userId: string) => Promise<void>) | undefined
  if (process.env.NEXT_PUBLIC_BILLING_ENABLED === 'true') {
    // Variable path prevents Vite from statically analyzing this import,
    // which would fail when the EE module doesn't exist (e.g. in open-source builds).
    const modulePath = '@/ee/lib/billing/stripe.server'
    const { cancelSubscription } = await import(/* @vite-ignore */ modulePath)
    onBeforeDelete = cancelSubscription
  }

  const result = await deleteAccount(userId, onBeforeDelete)

  if (!result.success) {
    return Response.json({ error: result.error }, { status: 500 })
  }

  return Response.json({ success: true })
}
