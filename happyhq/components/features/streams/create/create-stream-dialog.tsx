'use client'

import { useEffect, useRef, useState } from 'react'

import Image from 'next/image'
import { useRouter } from 'next/navigation'

import { toastError } from '@/components/common/ui/sonner'
import { useCurrentUser } from '@/lib/accounts/hooks'
import {
  checkStreamExists,
  createStream,
  writeStreamTitle,
} from '@/lib/actions'
import { toSlug } from '@/lib/format'
import { reportError } from '@/lib/report-error'
import { useStreams, useStreamsMutate } from '@/stores/streamsStore'
import { closeDialog, useUiStore } from '@/stores/uiStore'
import * as Headless from '@headlessui/react'
import clsx from 'clsx'

// Browser-side caps so a runaway paste can't ship a 100kb body to /api/chat.
// Server still validates; these are courtesy ceilings.
const NAME_MAX = 100
const INTENT_MAX = 5000

type Starter = {
  id: string
  label: string
  /** Auto-filled into the Name field when the pill is picked. */
  name: string
  /** Auto-filled into the one-sentence textarea when the pill is picked. */
  intent: string
}

// ── Starters ───────────────────────────────────────────────────────────
// Client-services "kinds of work" — picking a pill seeds both the Name and
// a one-sentence kickoff in the textarea. Q's interview after Create is
// where the real playbook gets built; this form is just the spark.
const STARTERS: Starter[] = [
  { id: 'blank', label: 'Blank', name: '', intent: '' },
  {
    id: 'proposal',
    label: 'Proposals',
    name: 'Proposals',
    intent: 'write proposals for new clients',
  },
  {
    id: 'sow',
    label: 'SOWs',
    name: 'SOWs',
    intent: 'write SOWs for new projects',
  },
  {
    id: 'kickoff',
    label: 'New client',
    name: 'New clients',
    intent: 'onboard new clients',
  },
  {
    id: 'weekly',
    label: 'Weekly update',
    name: 'Weekly updates',
    intent: 'write weekly status updates for clients',
  },
  {
    id: 'discovery',
    label: 'Discovery',
    name: 'Discovery',
    intent: 'turn discovery call notes into next steps',
  },
  {
    id: 'recap',
    label: 'Project recap',
    name: 'Project recaps',
    intent: 'write recaps at the end of a project',
  },
]

/**
 * Singleton dialog. Mounted once in the root layout; every caller
 * (sidebar +, desktop QuickOpen, command menu, ...) triggers it via
 * `openDialog('createStream')` from the uiStore.
 *
 * Uses raw `@headlessui/react` Dialog rather than the Catalyst wrapper.
 * Catalyst's defaults (panel ring, padding scale, sizing slots) don't fit
 * this dialog's two-column layout, and overriding them through Catalyst
 * was the source of repeated visual drift. The primitives we actually
 * need — focus trap, esc-to-close, return-focus, portal,
 * `aria-labelledby` — still come from `@headlessui/react`; we've only
 * replaced the styling layer. Other dialogs in the app continue to use
 * Catalyst.
 */
export function CreateStreamDialog() {
  const isOpen = useUiStore((s) => s.openDialog === 'createStream')
  return <CreateStreamDialogBody open={isOpen} onClose={closeDialog} />
}

function CreateStreamDialogBody({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const mutateStreams = useStreamsMutate()
  const { token } = useCurrentUser()
  const streams = useStreams()

  const [name, setName] = useState('')
  const [starterId, setStarterId] = useState<string>('blank')
  const [intent, setIntent] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const intentRef = useRef<HTMLTextAreaElement>(null)

  // Live collision check against the in-memory streams list. SWR-cached
  // (warmed by WorkspaceInitializer), so this is zero-cost and immediate —
  // the user finds out before clicking Create rather than via a toast.
  const slug = toSlug(name.trim())
  const hasNameCollision = slug !== '' && streams.some((s) => s.name === slug)

  // Reset the form on each open. Effect rather than re-mount because the
  // Dialog owns the open/close transition — unmounting on close would skip it.
  const prevOpenRef = useRef(false)
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setName('')
      setStarterId('blank')
      setIntent('')
      setIsCreating(false)
    }
    prevOpenRef.current = open
  }, [open])

  // Pills are an explicit "swap to this" — overwrite Name + intent
  // unconditionally. The set is small and discrete; the user's intent when
  // clicking is to switch to the pill's preset, not merge with existing text.
  const pickStarter = (next: Starter) => {
    setStarterId(next.id)
    setName(next.name)
    setIntent(next.intent)
    // Hand focus to the textarea with the cursor at the end so the user can
    // immediately tailor the preset text. requestAnimationFrame waits for the
    // controlled-value update to commit before we move the caret.
    requestAnimationFrame(() => {
      const el = intentRef.current
      if (!el) return
      el.focus()
      const end = el.value.length
      el.setSelectionRange(end, end)
    })
  }

  const canSubmit =
    name.trim().length > 0 && intent.trim().length > 0 && !hasNameCollision

  const handleClose = () => {
    if (!isCreating) onClose()
  }

  async function handleSubmit() {
    if (!canSubmit || isCreating) return
    const trimmedName = name.trim()
    const trimmedIntent = intent.trim()
    if (!slug) {
      // toSlug strips everything that isn't a letter/number/dash, so a
      // pure-emoji or pure-punctuation name leaves nothing behind.
      toastError('Names need at least one letter or number.')
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
      try {
        await writeStreamTitle(slug, trimmedName)
      } catch (err) {
        // Non-fatal: slug already reflects the name, so the stream is usable.
        reportError('client.stream_create.title_write_failed', {
          stream: slug,
          message: err instanceof Error ? err.message : String(err),
        })
      }
      mutateStreams()

      // Compose the first chat message. The textarea label primes the user
      // to write a continuation ("write proposals for new clients"), so we
      // wrap it into a full sentence addressed to Q — keeps the "teach a
      // new teammate" framing from the create dialog alive in the chat.
      const firstMessage = `Hey Q! Can you learn how we ${trimmedIntent}?`

      // One-shot handoff to the destination stream page. The dialog can't
      // open the chat window itself because DesktopInitializer's clearAll()
      // on route change would wipe it. Consumer in DesktopInitializer reads
      // and clears `happyhq:stream-create:{slug}` on mount.
      sessionStorage.setItem(
        `happyhq:stream-create:${slug}`,
        JSON.stringify({
          intent: firstMessage,
          maximize: true,
          createdAt: Date.now(),
        }),
      )

      // Kick off the route change *before* closing so the destination
      // stream page can mount under the still-open dialog. Closing first
      // briefly exposes the previous view (tasks list) before navigation
      // commits — the small hold makes the transition feel like the modal
      // closes directly onto the new stream.
      router.push(`/${encodeURIComponent(slug)}`)
      setTimeout(onClose, 200)
    } catch (err) {
      toastError(err instanceof Error ? err.message : 'Failed to create Stream')
      setIsCreating(false)
    }
  }

  return (
    <Headless.Dialog
      open={open}
      onClose={handleClose}
      className="relative z-1050"
    >
      {/* Scrim */}
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/25 backdrop-blur-[2px] transition duration-100 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      />

      {/* Panel container — centered, padded scrim */}
      <div className="fixed inset-0 z-1060 grid place-items-center overflow-y-auto p-8">
        <Headless.DialogPanel
          transition
          className="grid min-h-[580px] w-[min(980px,100%)] grid-cols-[1.35fr_1fr] overflow-hidden rounded-[20px] border border-zinc-200 bg-white shadow-[0_30px_80px_rgb(0_0_0/0.14),0_2px_8px_rgb(0_0_0/0.06)] transition duration-100 will-change-transform data-closed:scale-[0.98] data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
        >
          {/* ─ Left column — form ──────────────────────────────────────── */}
          <div className="flex flex-col gap-4 bg-white px-7 pt-[22px] pb-[22px]">
            {/* Header */}
            <div className="mb-[2px] flex items-center justify-between">
              <Headless.DialogTitle className="m-0 text-[14px] font-medium tracking-[0.01em] text-zinc-600">
                Create a new Stream
              </Headless.DialogTitle>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="grid size-6 place-items-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-950"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M3 3l8 8M11 3l-8 8"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {/* Name */}
            <FloatingField
              label="Name"
              disabled={isCreating}
              footer={<SlugPreview slug={slug} collision={hasNameCollision} />}
            >
              <input
                autoFocus
                type="text"
                maxLength={NAME_MAX}
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    if (canSubmit) handleSubmit()
                  }
                }}
                disabled={isCreating}
                className="w-full bg-transparent text-[14.5px] tracking-[-0.005em] text-zinc-950 placeholder:text-zinc-400 focus:outline-none"
              />
            </FloatingField>

            {/* Prompt — a one-sentence kickoff. Q digs into the real
                playbook details in the chat after Create. */}
            <FloatingField
              label="Hey Q! Can you learn how we..."
              hero
              disabled={isCreating}
              footer={
                <span className="block text-[11.5px] text-zinc-500">
                  One sentence is enough — Q digs into the details with you
                  next.
                </span>
              }
            >
              <textarea
                ref={intentRef}
                value={intent}
                maxLength={INTENT_MAX}
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault()
                    if (canSubmit) handleSubmit()
                  }
                }}
                disabled={isCreating}
                placeholder="e.g. write proposals for new clients"
                className="block min-h-[60px] w-full resize-none bg-transparent text-[14.5px] leading-[1.55] text-zinc-950 placeholder:text-zinc-400 focus:outline-none"
              />
            </FloatingField>

            {/* Pills — optional accelerators. Skipped in Tab order
                (tabIndex={-1}) so keyboard users go Name → Textarea →
                Cancel/Create without detouring through 6 pills. */}
            <div
              role="group"
              aria-label="Starters"
              className="flex flex-wrap items-baseline gap-[10px] px-1"
            >
              <span className="flex-none text-[11.5px] tracking-[0.01em] text-zinc-500">
                Or start from
              </span>
              <div className="flex flex-wrap gap-1">
                {STARTERS.map((t) => {
                  const isOn = starterId === t.id
                  return (
                    <button
                      key={t.id}
                      type="button"
                      tabIndex={-1}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => pickStarter(t)}
                      disabled={isCreating}
                      className={clsx(
                        'rounded-full border px-[10px] py-1 text-[11.5px] whitespace-nowrap transition-all duration-[120ms] ease-[ease] disabled:opacity-50',
                        isOn
                          ? 'border-zinc-950 bg-zinc-950 text-white'
                          : 'border-zinc-200 bg-transparent text-zinc-600 hover:border-zinc-400 hover:text-zinc-950',
                      )}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-auto flex items-center justify-between border-t border-zinc-200 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isCreating}
                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-zinc-600 transition-colors hover:text-zinc-950 disabled:opacity-50"
              >
                Cancel
                <kbd className="rounded-[4px] border border-zinc-200 bg-zinc-100 px-[5px] py-px font-mono text-[10px] leading-normal text-zinc-600">
                  esc
                </kbd>
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit || isCreating}
                className={clsx(
                  'group inline-flex items-center gap-2 rounded-full py-[9px] pr-3 pl-4 text-[13px] font-medium tracking-[-0.005em] transition-[background-color,transform] duration-[150ms]',
                  canSubmit && !isCreating
                    ? 'bg-zinc-950 text-white hover:bg-black'
                    : 'cursor-not-allowed bg-zinc-100 text-zinc-500',
                )}
              >
                <span>{isCreating ? 'Creating…' : 'Create stream'}</span>
                <span
                  aria-hidden
                  className="inline-block transition-transform duration-[150ms] group-hover:translate-x-[2px] group-disabled:translate-x-0"
                >
                  →
                </span>
                <span
                  aria-hidden
                  className={clsx(
                    'ml-[2px] inline-grid size-[18px] place-items-center rounded-[5px] font-mono text-[11px] leading-none',
                    canSubmit && !isCreating
                      ? 'bg-white/15 text-white/75'
                      : 'bg-transparent text-zinc-400',
                  )}
                >
                  ↵
                </span>
              </button>
            </div>
          </div>

          {/* ─ Right column — explainer ──────────────────────────────── */}
          <aside className="relative flex flex-col justify-center border-l border-zinc-200 bg-zinc-50 px-[38px] py-11">
            <div className="flex max-w-[32ch] flex-col gap-[14px]">
              <Image
                src="/brand/q-stars.svg"
                alt=""
                width={38}
                height={38}
                priority
                className="mb-1.5 size-[38px] text-zinc-950 select-none"
              />

              <div className="text-[11px] font-medium tracking-normal text-zinc-500">
                How Streams work
              </div>

              <h3 className="m-0 -mt-[2px] mb-1 text-[30px] leading-[1.08] font-medium tracking-tight text-balance text-zinc-950">
                Teach Q like a new teammate.
              </h3>

              <p className="m-0 text-[13.5px] leading-[1.6] text-pretty text-zinc-600">
                A Stream is a kind of work Q learns to do for you. It asks
                questions, you share examples and feedback, and it gets better
                every time you use it.
              </p>

              <ol className="m-0 mt-[14px] mb-1 flex list-none flex-col border-t border-zinc-200 p-0">
                {[
                  "Answer Q's questions",
                  'Share samples of what you want',
                  'Assign Tasks to your Stream',
                ].map((step, i) => (
                  <li
                    key={step}
                    className="flex items-center gap-3 border-b border-zinc-200 py-[9px] text-[12.5px] text-zinc-800"
                  >
                    <span className="grid size-[18px] flex-none place-items-center rounded-full border border-zinc-200 bg-white font-mono text-[10px] leading-none text-zinc-600">
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </aside>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}

// ── Floating-label field ────────────────────────────────────────────────
// Gray-fill container with a small eyebrow label and the input stacked
// below. The `hero` variant bumps the top padding for taller inputs
// (textareas) so the eyebrow sits at the same optical baseline.

function FloatingField({
  label,
  hero = false,
  disabled = false,
  footer = null,
  children,
}: {
  label: string
  hero?: boolean
  disabled?: boolean
  footer?: React.ReactNode | null
  children: React.ReactNode
}) {
  return (
    <label
      className={clsx(
        'block cursor-text rounded-[12px] bg-zinc-100 transition-[background-color,box-shadow] duration-150 focus-within:bg-zinc-50 focus-within:shadow-[inset_0_0_0_1px_var(--color-zinc-300)]',
        hero ? 'px-4 pt-[13px] pb-3' : 'px-4 pt-[11px] pb-3',
        disabled && 'opacity-60',
      )}
    >
      <span className="mb-1 block text-[11px] font-medium tracking-[0.04em] text-zinc-600">
        {label}
      </span>
      {children}
      {footer != null && <div className="mt-2">{footer}</div>}
    </label>
  )
}

// ── Slug preview ────────────────────────────────────────────────────────
// Lives inside the Name field's footer slot. Static helper ("A folder
// will be created for your Stream") is always visible; the actual save
// path fades in inline once the user types a name. Empty state doubles
// as a quiet education point — Streams are real folders on disk.

function SlugPreview({
  slug,
  collision,
}: {
  slug: string
  collision: boolean
}) {
  // Collision wins — when the typed name conflicts with an existing
  // Stream, replace the helper/path with a warning so the user finds out
  // before submitting instead of via a toast on Create.
  if (collision) {
    return (
      <span
        className="flex h-[14px] items-center overflow-hidden text-[11.5px] whitespace-nowrap text-amber-700"
        aria-live="polite"
      >
        A Stream named{' '}
        <span className="ml-1 font-mono font-medium tracking-[-0.005em]">
          {slug}
        </span>
        <span className="ml-1">already exists — try a different name.</span>
      </span>
    )
  }
  return (
    <span
      className="flex h-[14px] items-center overflow-hidden text-[11.5px] whitespace-nowrap text-zinc-500"
      aria-live="polite"
    >
      A folder will be created for your Stream
      <span
        className={clsx(
          'ml-1 inline-flex items-center transition-opacity duration-150',
          slug ? 'opacity-100' : 'opacity-0',
        )}
      >
        at
        <span className="ml-1 font-mono tracking-[-0.005em]">
          <span className="text-zinc-500">~/HappyHQ/</span>
          <span className="font-medium text-zinc-950">{slug || ' '}</span>
          <span className="text-zinc-400">/</span>
        </span>
      </span>
    </span>
  )
}
