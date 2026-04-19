'use client'

import { toastError } from '@/components/common/ui/sonner'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'

import { Composer } from '@/components/features/chat/composer'
import { ComposerModeToggle } from '@/components/features/chat/composer-mode-toggle'
import { useCurrentUser } from '@/lib/accounts/hooks'
import { createChatSession, uploadFile } from '@/lib/actions'
import { useStreams, useStreamsLoading } from '@/stores/streamsStore'
import { AnimatedPlaceholder } from './animated-placeholder'
import { StreamContextSelector } from './stream-context-selector'

const GENERAL_PHRASES = [
  'Hey Q! I have a question about...',
  'Hey Q! Can you help me think through...',
  "Hey Q! I've been wondering about...",
  "Hey Q! Let's talk about...",
]

const STREAM_PHRASES = [
  "Hey Q! Let's start a new task...",
  "Hey Q! Let's add another output...",
  "Hey Q! Let's tweak the approach...",
  'Hey Q! Learn from this example...',
]

export function HomeComposer() {
  const router = useRouter()
  const { token } = useCurrentUser()
  const streams = useStreams()
  const isLoading = useStreamsLoading()
  const [isCreating, setIsCreating] = useState(false)
  const [selectedStream, setSelectedStream] = useState<string | null>(null)
  const [isEmpty, setIsEmpty] = useState(true)
  const [mode, setMode] = useState<'general' | 'learning'>('general')

  const handleValueChange = useCallback((value: string) => {
    setIsEmpty(value.trim().length === 0)
  }, [])

  const handleModeChange = useCallback((newMode: 'general' | 'learning') => {
    setMode(newMode)
  }, [])

  // Auto-default to learning mode when selecting a stream with no playbook content
  const handleStreamSelect = useCallback(
    (slug: string | null) => {
      setSelectedStream(slug)
      if (!slug) return
      const stream = streams.find((s) => s.name === slug)
      if (stream && !stream.hasPlaybookContent) {
        setMode('learning')
      }
    },
    [streams],
  )

  const phrases = useMemo(
    () => (selectedStream ? STREAM_PHRASES : GENERAL_PHRASES),
    [selectedStream],
  )

  async function handleSubmit(message: string, files?: File[]) {
    const sessionId = crypto.randomUUID()
    setIsCreating(true)

    try {
      // Stream selected → learning-mode chat scoped to that stream
      // No stream → general-mode stream-less chat at root level
      const streamSlug = selectedStream

      await createChatSession(sessionId, streamSlug)

      // Upload files now that the session directory exists
      let fileSlugs: string[] | undefined
      if (files?.length) {
        fileSlugs = await Promise.all(
          files.map((file) => {
            const formData = new FormData()
            formData.append('file', file)
            return uploadFile(sessionId, formData, token, streamSlug)
          }),
        )
      }

      sessionStorage.setItem(
        'q-home-message',
        JSON.stringify({
          slug: streamSlug,
          sessionId,
          message,
          mode,
          ...(fileSlugs?.length && { files: fileSlugs }),
        }),
      )

      router.push('/chat/' + sessionId)
    } catch {
      toastError(
        selectedStream ? 'Failed to start chat' : 'Failed to create chat',
      )
      setIsCreating(false)
    }
  }

  const isDisabled = isCreating || isLoading

  return (
    <div className="[&>div]:bg-muted w-full max-w-3xl [&>div]:border [&>div]:border-white [&>div]:shadow [&>div]:ring-1 [&>div]:ring-black/8 [&>div]:focus-within:ring-black/16 [&>div]:hover:ring-black/12">
      <Composer
        onSubmit={handleSubmit}
        placeholder=""
        autoFocus
        disabled={isDisabled}
        clearOnSubmit={false}
        onValueChange={handleValueChange}
        overlay={
          <AnimatedPlaceholder
            phrases={phrases}
            visible={isEmpty && !isDisabled}
          />
        }
        actions={
          <StreamContextSelector
            streams={streams}
            selectedStream={selectedStream}
            onSelect={handleStreamSelect}
            disabled={isDisabled}
          />
        }
        rightActions={
          <ComposerModeToggle
            mode={mode}
            onModeChange={handleModeChange}
            disabled={isDisabled}
          />
        }
      />
    </div>
  )
}
