import { verifyHmac } from '@/lib/auth/hmac'
import { cookies } from 'next/headers'
import { LoginPage } from './login-page'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const password = process.env.Q_PASSWORD
  let needsPassword = !!password

  if (password) {
    const cookieStore = await cookies()
    const cookie = cookieStore.get('q-auth')
    if (cookie && (await verifyHmac(cookie.value, password))) {
      needsPassword = false
    }
  }

  return <LoginPage hasPasswordGate={needsPassword} />
}
