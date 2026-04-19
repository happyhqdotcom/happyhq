'use client'

import { SettingsRow } from '@/app/(settings)/settings/_components/settings-row'
import { Button } from '@/components/common/catalyst/button'
import { DeleteAlert } from '@/components/common/shared/delete-alert'
import { useState } from 'react'

export function DangerZone() {
  const [showConfirm, setShowConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleReset() {
    setShowConfirm(false)
    setResetting(true)
    setError(null)

    try {
      const res = await fetch('/api/git/reset', { method: 'POST' })
      const data = await res.json()

      if (!res.ok || !data.success) {
        setError(data.error ?? 'Failed to reset history')
        return
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch {
      setError('Failed to reset history. Please try again.')
    } finally {
      setResetting(false)
    }
  }

  return (
    <>
      {/* Reset history */}
      <SettingsRow
        label="Reset history"
        description="Clears the activity log for your workspace. Your streams, tasks, and files are not affected."
      >
        <Button
          outline
          className="shrink-0 py-1! text-sm! text-red-600! hover:bg-red-50!"
          onClick={() => setShowConfirm(true)}
          disabled={resetting}
        >
          {resetting ? 'Resetting...' : 'Reset history'}
        </Button>
      </SettingsRow>

      {success && (
        <span className="text-sm text-green-600" role="status">
          History cleared
        </span>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <DeleteAlert
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Reset history"
        description="This will permanently clear the history in your workspace. Your files and streams are not affected. This cannot be undone."
        onDelete={handleReset}
      />
    </>
  )
}
