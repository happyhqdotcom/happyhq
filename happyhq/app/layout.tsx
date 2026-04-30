import { ErrorReporter } from '@/components/common/error-reporter'
import { Toaster } from '@/components/common/ui/sonner'
import { GeistMono } from 'geist/font/mono'
import { GeistSans } from 'geist/font/sans'
import type { Metadata } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'

const nunito = Nunito({
  subsets: ['latin'],
  variable: '--font-nunito',
})

const APP_URL = process.env.APP_URL?.replace(/\/$/, '') ?? 'https://happyhq.com'

const TITLE = 'HappyHQ — The AI workspace for everyday work.'
const DESCRIPTION =
  'The AI workspace for everyday work. You teach it how you do anything, and it does that work for you — the way you would have done it.'

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    template: '%s — HappyHQ',
    default: TITLE,
  },
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: 'HappyHQ',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${nunito.variable} min-h-screen overflow-hidden antialiased`}
    >
      <body className="font-sans">
        {children}
        <ErrorReporter />
        <Toaster position="top-right" offset={{ top: 54, right: 20 }} />
      </body>
    </html>
  )
}
