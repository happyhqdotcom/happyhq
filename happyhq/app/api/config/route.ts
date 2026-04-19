import { readConfig, writeConfig } from '@/lib/config/config.server'
import { resolveConfig } from '@/lib/config/defaults'
import { log } from '@/lib/log.server'

export async function GET() {
  try {
    const config = resolveConfig(await readConfig())
    return Response.json(config)
  } catch (err) {
    log('api.error', {
      route: '/api/config',
      handler: 'GET',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Failed to read config' }, { status: 500 })
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const merged = await writeConfig(body)
    return Response.json(resolveConfig(merged))
  } catch (err) {
    log('api.error', {
      route: '/api/config',
      handler: 'PUT',
      status: 500,
      error: err instanceof Error ? err.message : String(err),
    })
    return Response.json({ error: 'Failed to write config' }, { status: 500 })
  }
}
