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

export const metadata: Metadata = {
  title: 'HappyHQ',
  description: 'Your AI-powered work companion',
  openGraph: {
    title: 'HappyHQ',
    description: 'Your AI-powered work companion',
    siteName: 'HappyHQ',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
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
