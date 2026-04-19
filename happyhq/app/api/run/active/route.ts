import { getActiveRunInfo } from '@/lib/run/loop.server'

export async function GET() {
  const info = getActiveRunInfo()
  return Response.json(info)
}
