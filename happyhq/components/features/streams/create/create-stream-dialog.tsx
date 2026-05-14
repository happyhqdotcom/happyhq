'use client'

import { useState } from 'react'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { Dialog } from '@/components/common/catalyst/dialog'
import { toastError } from '@/components/common/ui/sonner'
import { openInteractiveChatWindow } from '@/components/features/desktop/windows/chat/open-chat-window'
import { useCurrentUser } from '@/lib/accounts/hooks'
import {
  checkStreamExists,
  createStream,
  writeStreamTitle,
} from '@/lib/actions'
import { toSlug } from '@/lib/format'
import { useStreamsMutate } from '@/stores/streamsStore'
import { useWindowStore } from '@/stores/windowStore'
import clsx from 'clsx'

// ── Starters ───────────────────────────────────────────────────────────
// Casual, pre-canned playbook examples. Clicking a pill fills the prompt with
// the starter's text — these aren't formal templates (that'll be its own
// first-class thing), just a quick way to see what teaching Q looks like.

type Starter = { id: string; label: string; intent: string }

const STARTERS: Starter[] = [
  { id: 'blank', label: 'Blank', intent: '' },
  {
    id: 'prd',
    label: 'PRD draft',
    intent:
      'When I share a fuzzy product idea, draft a PRD. Start with the problem and user; pull from our positioning doc and recent customer interviews. Output: problem → users → solution sketch → risks → open questions. Keep it to one page.',
  },
  {
    id: 'bug',
    label: 'Bug triage',
    intent:
      'When I send a bug report, stack trace, or Sentry link: identify the most likely root cause, propose a fix with a test, and call out what to verify in prod. Cross-reference recent Sentry events and ongoing incidents.',
  },
  {
    id: 'interview',
    label: 'Customer interview synth',
    intent:
      'When I share a customer interview transcript or recording: pull the strongest quotes, identify 3–5 themes, surface product implications, and produce a one-page synthesis with citations to the transcript.',
  },
  {
    id: 'research',
    label: 'Research synthesis',
    intent:
      'When I share a research question with sources: summarize each source, identify points of agreement and disagreement, and output a one-page memo with inline citations.',
  },
  {
    id: 'brainstorm',
    label: 'Brainstorm',
    intent:
      'When I name a topic: go wide first (10+ ideas, no filtering), then narrow to the top 3 with rationale and risks. End with a recommended next move.',
  },
]

export function CreateStreamDialog({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  // Remount the shell each time the dialog opens so form state resets cleanly.
  const [mountId, setMountId] = useState(0)
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setMountId((id) => id + 1)
  }
  return <CreateStreamDialogShell key={mountId} open={open} onClose={onClose} />
}

function CreateStreamDialogShell({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const mutateStreams = useStreamsMutate()
  const { token } = useCurrentUser()

  const [name, setName] = useState('')
  const [starterId, setStarterId] = useState<string>('blank')
  const [intent, setIntent] = useState('')
  const [isCreating, setIsCreating] = useState(false)

  // Picking a starter prefills the intent textarea — but only if the user
  // hasn't typed anything custom yet. We treat the textarea as "unedited" when
  // it's empty OR matches the previously-picked starter's text. That lets users
  // browse pills freely without losing typed work.
  const pickStarter = (s: Starter) => {
    const currentStarter = STARTERS.find((x) => x.id === starterId)
    const isUnedited =
      intent.trim() === '' || intent === (currentStarter?.intent ?? '')
    setStarterId(s.id)
    if (isUnedited) setIntent(s.intent)
  }

  const canSubmit = name.trim().length > 0 && intent.trim().length > 0

  const handleClose = () => {
    if (!isCreating) onClose()
  }

  async function handleSubmit() {
    if (!canSubmit || isCreating) return
    const trimmedName = name.trim()
    const trimmedIntent = intent.trim()
    const slug = toSlug(trimmedName)
    if (!slug) {
      toastError('Please enter a valid name')
      return
    }
    setIsCreating(true)
    try {
      const exists = await checkStreamExists(slug)
      if (exists) {
        toastError('A Stream with this name already exists')
        setIsCreating(false)
        return
      }
      await createStream(slug, token)
      // The stream directory exists from here on; a title-write failure
      // shouldn't block creation or roll back. The slug already reflects
      // the user's name, so the stream is usable without the explicit title.
      try {
        await writeStreamTitle(slug, trimmedName)
      } catch {
        // Non-fatal — log on the server-action side; we proceed.
      }
      mutateStreams?.()

      const windowId = openInteractiveChatWindow(slug, {
        initialMode: 'learning',
        intent: trimmedIntent,
      })
      const canvas = document.querySelector('[data-desktop-canvas]')
      if (canvas) {
        useWindowStore
          .getState()
          .toggleMaximize(windowId, canvas.getBoundingClientRect())
      }

      onClose()
      router.push(`/${encodeURIComponent(slug)}`)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to create Stream')
      setIsCreating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      size="3xl"
      className="overflow-hidden rounded-2xl! p-0!"
    >
      <div className="grid min-h-136 grid-cols-1 sm:grid-cols-[1.4fr_1fr]">
        {/* ─ Left column — form ───────────────────────────────────────── */}
        <div className="flex flex-col gap-[18px] bg-white px-8 pt-[30px] pb-6">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] text-zinc-950">
            Start a new Stream
          </h2>

          {/* Name — floating-label gray fill */}
          <FloatingField label="Name" disabled={isCreating}>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (canSubmit) handleSubmit()
                }
              }}
              disabled={isCreating}
              className="w-full bg-transparent text-[15px] leading-[1.4] font-normal tracking-[-0.005em] text-zinc-950 placeholder:text-zinc-300 focus:outline-none"
            />
          </FloatingField>

          {/* Prompt — the hero */}
          <FloatingField
            label="What kind of work should this Stream do?"
            hero
            disabled={isCreating}
          >
            <textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  if (canSubmit) handleSubmit()
                }
              }}
              disabled={isCreating}
              placeholder="Describe how you do this kind of work — the goal, your approach, what good looks like, what to pull from. Q turns this into a Playbook it can run anytime."
              className="block min-h-[124px] w-full resize-none bg-transparent text-[14.5px] leading-[1.55] text-zinc-950 placeholder:text-zinc-300 focus:outline-none"
            />
          </FloatingField>

          {/* Pills — quiet starters (not first-class templates) */}
          <div className="flex flex-wrap items-center gap-3 px-1">
            <span className="text-[11.5px] text-zinc-500">Or, try</span>
            <div className="flex flex-wrap gap-1">
              {STARTERS.map((t) => {
                const isOn = starterId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => pickStarter(t)}
                    disabled={isCreating}
                    className={clsx(
                      'rounded-full border px-[11px] py-1 text-[11.5px] whitespace-nowrap transition-colors disabled:opacity-50',
                      isOn
                        ? 'border-zinc-950 bg-zinc-950 text-white'
                        : 'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:text-zinc-950',
                    )}
                  >
                    {t.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="mt-auto flex justify-end gap-1 pt-3">
            <button
              type="button"
              onClick={handleClose}
              disabled={isCreating}
              className="rounded-full px-4 py-2 text-[13px] text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit || isCreating}
              className={clsx(
                'rounded-full bg-zinc-100 px-[18px] py-2 text-[13px] font-medium transition-colors hover:bg-zinc-200',
                canSubmit && !isCreating
                  ? 'text-zinc-950'
                  : 'cursor-not-allowed text-zinc-400',
              )}
            >
              {isCreating ? 'Creating…' : 'Create'}
            </button>
          </div>
        </div>

        {/* ─ Right column — aesthetic explainer ───────────────────────── */}
        <aside className="relative flex flex-col justify-center border-l border-zinc-200/60 bg-zinc-50/70 px-[38px] py-11">
          {/* Decorative dot, top-right */}
          <span
            aria-hidden
            className="absolute top-[22px] right-[22px] block size-1.5 rounded-full bg-zinc-300 opacity-50"
          />

          <div className="flex max-w-[30ch] flex-col gap-4">
            <Image
              src="/brand/q-stars.svg"
              alt=""
              width={48}
              height={48}
              priority
              className="mb-1 size-12 select-none"
            />

            <div className="text-[10.5px] font-medium tracking-[0.14em] text-zinc-400 uppercase">
              Meet Streams
            </div>

            <h3 className="-mt-1 text-[32px] leading-[1.1] font-medium tracking-[-0.03em] text-zinc-950">
              Teach Q how.
              <br />
              Then assign it Tasks.
            </h3>

            <p className="text-[13.5px] leading-[1.6] text-zinc-500">
              Q will start by asking you questions about how this work gets
              done. You&apos;ll go back and forth until Q creates a Playbook and
              Spec. Then you&apos;re ready to start assigning Tasks to Q.
            </p>
          </div>
        </aside>
      </div>
    </Dialog>
  )
}

// ── Floating-label field ────────────────────────────────────────────────
// Gray-fill container with a small label on top and the input below.
// Matches the Notion-style minimal aesthetic of variation H.

function FloatingField({
  label,
  hero = false,
  disabled = false,
  children,
}: {
  label: string
  hero?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <label
      className={clsx(
        'block cursor-text rounded-xl bg-zinc-100/70 transition-[background-color,box-shadow] focus-within:bg-zinc-100 focus-within:shadow-[inset_0_0_0_1px_var(--color-zinc-200)]',
        hero ? 'px-4 pt-3 pb-3.5' : 'px-3.5 pt-2.5 pb-3',
        disabled && 'opacity-60',
      )}
    >
      <span
        className={clsx(
          'mb-1 block tracking-wide',
          hero
            ? 'text-[11.5px] font-semibold text-zinc-700'
            : 'text-[10.5px] font-medium text-zinc-500',
        )}
      >
        {label}
      </span>
      {children}
    </label>
  )
}
