'use client'

import { Button } from '@/components/common/catalyst/button'
import { reportError } from '@/lib/report-error'
import { useEffect } from 'react'

export default function StreamError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Stream error:', error)
    reportError('client.react.render_error', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      scope: 'stream',
    })
  }, [error])

  return (
    <main className="flex h-screen flex-col items-center justify-center">
      <div className="flex max-w-md flex-col items-center text-center">
        <h1 className="text-foreground text-lg font-semibold">
          Something went wrong
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          There was a problem loading this stream. You can try again or go back.
        </p>
        <div className="mt-6 flex gap-3">
          <Button outline onClick={() => (window.location.href = '/')}>
            Go Home
          </Button>
          <Button color="dark/zinc" onClick={() => reset()}>
            Try Again
          </Button>
        </div>
      </div>
    </main>
  )
}
