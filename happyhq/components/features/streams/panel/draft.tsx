'use client'

import { useState } from 'react'

import { toastError } from '@/components/common/ui/sonner'
import {
  CloseButton,
  SettingsButton,
  Shell,
  Sidebar,
} from '@/components/features/desktop/panels/atoms'
import { useCurrentUser } from '@/lib/accounts/hooks'
import {
  checkStreamExists,
  createStream,
  writeStreamTitle,
} from '@/lib/actions'
import { toSlug } from '@/lib/format'
import { useStreamsMutate } from '@/stores/streamsStore'
import { useRouter } from 'next/navigation'

export function DraftStreamPanel() {
  const router = useRouter()
  const mutateStreams = useStreamsMutate()
  const { token } = useCurrentUser()

  const [name, setName] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  async function commitStream() {
    const trimmed = name.trim()
    if (!trimmed || isCreating) return
    const slug = toSlug(trimmed)
    if (!slug) {
      toastError('Please enter a valid name')
      return
    }
    setIsCreating(true)
    try {
      const exists = await checkStreamExists(slug)
      if (exists) {
        toastError('A stream with this name already exists')
        setIsCreating(false)
        return
      }
      await createStream(slug, token)
      await writeStreamTitle(slug, trimmed)
      mutateStreams?.()
      router.replace(`/${encodeURIComponent(slug)}`)
    } catch {
      toastError('Failed to create stream')
      setIsCreating(false)
    }
  }

  return (
    <Shell>
      <div className="flex min-h-0 flex-1">
        {/* Left — name input */}
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex items-center gap-2 px-4 pt-4 pb-1">
              <input
                autoFocus
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitStream()
                  }
                }}
                onBlur={() => commitStream()}
                placeholder="Stream name..."
                disabled={isCreating}
                className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zinc-400 disabled:opacity-50"
                style={{
                  fontFamily: "'Avenir Next', system-ui, sans-serif",
                  fontSize: '19.5px',
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.5,
                  color: '#333333',
                }}
              />
              <SettingsButton onToggle={() => setSidebarOpen(!sidebarOpen)} />
              <CloseButton />
            </div>
          </div>
        </div>

        <Sidebar open={sidebarOpen} />
      </div>
    </Shell>
  )
}
