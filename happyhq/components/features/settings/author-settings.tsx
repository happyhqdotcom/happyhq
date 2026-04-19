'use client'

import { TextRow } from '@/app/(settings)/settings/_components/settings-rows'
import { useConfig, useUpdateConfig } from '@/lib/config/use-config'

export function AuthorSettings() {
  const { config } = useConfig()
  const updateConfig = useUpdateConfig()

  const authorName = config?.git.authorName ?? ''
  const authorEmail = config?.git.authorEmail ?? ''
  const hasOverride = authorName !== '' || authorEmail !== ''

  return (
    <>
      <TextRow
        label="Name"
        description="Shown as the author when changes are saved"
        value={authorName}
        onChange={(val) => updateConfig({ git: { authorName: val } })}
        placeholder="Q"
      />
      <TextRow
        label="Email"
        description="Used to identify who made changes"
        value={authorEmail}
        onChange={(val) => updateConfig({ git: { authorEmail: val } })}
        placeholder="q@happyhq.com"
      />
      {hasOverride && (
        <div className="border-t border-zinc-950/5 py-2">
          <button
            type="button"
            onClick={() =>
              updateConfig({ git: { authorName: '', authorEmail: '' } })
            }
            className="cursor-pointer text-sm text-zinc-500 hover:text-zinc-700"
          >
            Reset to default
          </button>
        </div>
      )}
    </>
  )
}
