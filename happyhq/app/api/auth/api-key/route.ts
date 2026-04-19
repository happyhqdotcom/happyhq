import { storeApiKey } from '@/lib/agents/auth.server'
import { log } from '@/lib/log.server'

export async function POST(request: Request) {
  let body: { key: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { key } = body
  if (typeof key !== 'string' || key.trim().length === 0) {
    return Response.json({ error: 'API key is required' }, { status: 400 })
  }

  try {
    await storeApiKey(key.trim())
    return Response.json({ success: true })
  } catch (error) {
    log('api.error', {
      route: '/api/auth/api-key',
      status: 500,
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json(
      { error: error instanceof Error ? error.message : 'Failed to store key' },
      { status: 500 },
    )
  }
}
