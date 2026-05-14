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
import { useStreamsMutate } from '@/stores/streamsStore'
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

// ── Design tokens ────────────────────────────────────────────────────────
// Carbon-copied from the handoff's `base.css`. Set as CSS custom properties
// on the panel root so every nested element can reference them via
// `var(--ink-…)` / `var(--paper-…)` — same way the prototype works.
const TOKENS = {
  '--paper': 'oklch(0.985 0.005 80)',
  '--paper-2': 'oklch(0.965 0.006 80)',
  '--paper-3': 'oklch(0.94 0.007 80)',
  '--ink-100': 'oklch(0.18 0.01 80)',
  '--ink-80': 'oklch(0.30 0.01 80)',
  '--ink-60': 'oklch(0.45 0.01 80)',
  '--ink-40': 'oklch(0.62 0.008 80)',
  '--ink-30': 'oklch(0.75 0.005 80)',
  '--ink-20': 'oklch(0.85 0.005 80)',
  '--ink-10': 'oklch(0.92 0.005 80)',
} as React.CSSProperties

/**
 * Singleton dialog. Mounted once in the root layout; every caller
 * (sidebar +, desktop QuickOpen, command menu, ...) triggers it via
 * `openDialog('createStream')` from the uiStore.
 *
 * Uses raw `@headlessui/react` Dialog (not Catalyst's wrapper) so the
 * panel chrome — colors, radii, padding, transitions — comes only from
 * this file. Visual styling is a 1:1 port of `var-h.css` from the design
 * handoff (oklch tokens + exact px values), so deviations from the
 * prototype are intentional edits rather than translation drift.
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

  const [name, setName] = useState('')
  const [starterId, setStarterId] = useState<string>('blank')
  const [intent, setIntent] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const intentRef = useRef<HTMLTextAreaElement>(null)

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

      // One-shot handoff to the destination stream page. The dialog can't
      // open the chat window itself because DesktopInitializer's clearAll()
      // on route change would wipe it. Consumer in DesktopInitializer reads
      // and clears `happyhq:stream-create:{slug}` on mount.
      sessionStorage.setItem(
        `happyhq:stream-create:${slug}`,
        JSON.stringify({
          intent: trimmedIntent,
          maximize: true,
          createdAt: Date.now(),
        }),
      )

      onClose()
      router.push(`/${encodeURIComponent(slug)}`)
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
      {/* Scrim — `.vh-scrim` */}
      <Headless.DialogBackdrop
        transition
        className="fixed inset-0 bg-[oklch(0.18_0.01_80/0.28)] backdrop-blur-[2px] transition duration-100 data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
      />

      {/* Panel container — centered, padded scrim */}
      <div className="fixed inset-0 z-1060 grid place-items-center overflow-y-auto p-8">
        <Headless.DialogPanel
          transition
          style={TOKENS}
          className="grid min-h-[580px] w-[min(980px,100%)] grid-cols-[1.35fr_1fr] overflow-hidden rounded-[20px] border border-(--ink-10) bg-(--paper) shadow-[0_30px_80px_oklch(0_0_0/0.14),_0_2px_8px_oklch(0_0_0/0.06)] transition duration-100 will-change-transform data-closed:scale-[0.98] data-closed:opacity-0 data-enter:ease-out data-leave:ease-in"
        >
          {/* ─ Left column — `.vh-left` ───────────────────────────────── */}
          <div className="flex flex-col gap-4 bg-(--paper) px-7 pt-[22px] pb-[22px]">
            {/* Header — `.vh-header` */}
            <div className="mb-[2px] flex items-center justify-between">
              <Headless.DialogTitle className="m-0 text-[14px] font-medium tracking-[0.01em] text-(--ink-60)">
                New stream
              </Headless.DialogTitle>
              <button
                type="button"
                onClick={handleClose}
                aria-label="Close"
                className="grid size-6 place-items-center rounded-md text-(--ink-40) transition-colors hover:bg-(--paper-3) hover:text-(--ink-100)"
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

            {/* Name field — `.vh-field` */}
            <FloatingField
              label="Name"
              disabled={isCreating}
              footer={<SlugPreview name={name} />}
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
                className="w-full bg-transparent text-[14.5px] tracking-[-0.005em] text-(--ink-100) placeholder:text-(--ink-30) focus:outline-none"
              />
            </FloatingField>

            {/* Prompt — `.vh-field-prompt`. A one-sentence kickoff; Q digs
                into the real playbook details in the chat after Create. */}
            <FloatingField
              label="Can you learn how we..."
              hero
              disabled={isCreating}
              footer={
                <span className="block text-[11.5px] text-(--ink-40)">
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
                className="block min-h-[60px] w-full resize-none bg-transparent text-[14.5px] leading-[1.55] text-(--ink-100) placeholder:text-(--ink-30) focus:outline-none"
              />
            </FloatingField>

            {/* Pills row — `.vh-pills-row`.
                Skipped in Tab order (tabIndex={-1}) so keyboard users go
                Name → Textarea → Cancel/Create without detouring through
                6 pills. Still clickable via mouse. */}
            <div
              role="group"
              aria-label="Starters"
              className="flex flex-wrap items-baseline gap-[10px] px-1"
            >
              <span className="flex-none text-[11.5px] tracking-[0.01em] text-(--ink-40)">
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
                      onClick={() => pickStarter(t)}
                      disabled={isCreating}
                      className={clsx(
                        'rounded-full border px-[10px] py-1 text-[11.5px] whitespace-nowrap transition-all duration-[120ms] ease-[ease] disabled:opacity-50',
                        isOn
                          ? 'border-(--ink-100) bg-(--ink-100) text-(--paper)'
                          : 'border-(--ink-10) bg-transparent text-(--ink-60) hover:border-(--ink-30) hover:text-(--ink-100)',
                      )}
                    >
                      {t.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Actions — `.vh-actions` */}
            <div className="mt-auto flex items-center justify-between border-t border-(--ink-10) pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={isCreating}
                className="inline-flex items-center gap-2 rounded-lg px-2.5 py-[7px] text-[12.5px] text-(--ink-60) transition-colors hover:text-(--ink-100) disabled:opacity-50"
              >
                Cancel
                <kbd className="rounded-[4px] border border-(--ink-10) bg-(--paper-3) px-[5px] py-px font-mono text-[10px] leading-normal text-(--ink-60)">
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
                    ? 'bg-(--ink-100) text-(--paper) hover:-translate-y-[0.5px] hover:bg-[oklch(0.10_0.01_80)]'
                    : 'cursor-not-allowed bg-(--paper-3) text-(--ink-40)',
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
                      ? 'bg-[oklch(1_0_0/0.12)] text-[oklch(1_0_0/0.75)]'
                      : 'bg-transparent text-(--ink-30)',
                  )}
                >
                  ↵
                </span>
              </button>
            </div>
          </div>

          {/* ─ Right column — `.vh-right` ─────────────────────────────── */}
          <aside
            className="relative flex flex-col justify-center border-l border-(--ink-10) bg-(--paper-2) px-[38px] py-11"
            style={{
              backgroundImage:
                'radial-gradient(120% 60% at 100% 0%, oklch(0.97 0.012 80 / 0.6), transparent 60%), linear-gradient(180deg, var(--paper-2), var(--paper-2))',
            }}
          >
            <div className="flex max-w-[32ch] flex-col gap-[14px]">
              <Image
                src="/brand/q-stars.svg"
                alt=""
                width={38}
                height={38}
                priority
                className="mb-1.5 size-[38px] text-(--ink-100) select-none"
              />

              <div className="text-[11px] font-medium tracking-normal text-(--ink-40)">
                How Streams work
              </div>

              <h3 className="m-0 -mt-[2px] mb-1 text-[30px] leading-[1.08] font-medium tracking-tight text-balance text-(--ink-100)">
                Teach Q like a new teammate.
              </h3>

              <p className="m-0 text-[13.5px] leading-[1.6] text-pretty text-(--ink-60)">
                A Stream is a kind of work Q learns to do for you. It asks
                questions, you share examples and feedback, and it gets better
                every time you use it.
              </p>

              <ol className="m-0 mt-[14px] mb-1 flex list-none flex-col border-t border-(--ink-10) p-0">
                {[
                  "Answer Q's questions",
                  'Share samples of what you want',
                  'Assign Tasks to your Stream',
                ].map((step, i) => (
                  <li
                    key={step}
                    className="flex items-center gap-3 border-b border-(--ink-10) py-[9px] text-[12.5px] text-(--ink-80)"
                  >
                    <span className="grid size-[18px] flex-none place-items-center rounded-full border border-(--ink-10) bg-(--paper) font-mono text-[10px] leading-none text-(--ink-60)">
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

// ── Floating-label field — `.vh-field` ──────────────────────────────────
// Gray-fill container with a small uppercase eyebrow label and the input
// stacked below. Hero variant bumps the top padding (matches `.vh-field-prompt`).

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
        'block cursor-text rounded-[12px] bg-(--paper-3) transition-[background-color,box-shadow] duration-150 focus-within:bg-(--paper-2) focus-within:shadow-[inset_0_0_0_1px_var(--ink-20)]',
        hero ? 'px-4 pt-[13px] pb-3' : 'px-4 pt-[11px] pb-3',
        disabled && 'opacity-60',
      )}
    >
      <span className="mb-1 block text-[11px] font-medium tracking-[0.04em] text-(--ink-60)">
        {label}
      </span>
      {children}
      {footer != null && <div className="mt-2">{footer}</div>}
    </label>
  )
}

// ── Slug preview — `.vh-path` ───────────────────────────────────────────
// Lives inside the Name field's footer slot. Mirrors the design's
// three-part path: muted prefix, separator, slug. The slug switches from
// italic sans "untitled" placeholder to bold mono once the user types.

function SlugPreview({ name }: { name: string }) {
  const slug = toSlug(name.trim())
  return (
    <span
      className="flex h-[14px] items-center overflow-hidden text-[11.5px] whitespace-nowrap text-(--ink-40)"
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
          <span className="text-(--ink-40)">~/HappyHQ/</span>
          <span className="font-medium text-(--ink-100)">{slug || ' '}</span>
          <span className="text-(--ink-30)">/</span>
        </span>
      </span>
    </span>
  )
}
