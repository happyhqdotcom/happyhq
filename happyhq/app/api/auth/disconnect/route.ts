import { clearCredentials } from '@/lib/agents/auth.server'

export async function POST() {
  await clearCredentials()
  return Response.json({ success: true })
}
