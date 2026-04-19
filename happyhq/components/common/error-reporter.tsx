'use client'

import { reportError } from '@/lib/report-error'
import { useEffect } from 'react'

/**
 * Global error reporter — mounts once in the root layout.
 * Attaches window.onerror and unhandledrejection handlers to forward
 * client-side errors to the server log via /api/log.
 *
 * Renders nothing.
 */
export function ErrorReporter() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      reportError('client.error', {
        message: event.message,
        source: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack,
      })
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason
      reportError('client.unhandled_rejection', {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
      })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
