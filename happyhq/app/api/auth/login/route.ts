import { buildAuthorizationUrl } from '@/lib/auth/oauth.server'

export async function POST() {
  return Response.json(buildAuthorizationUrl())
}
