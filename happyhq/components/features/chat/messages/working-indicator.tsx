'use client'

import { useEffect, useRef, useState } from 'react'

// ── Phrase buckets ──────────────────────────────────────────────────────

const MUTTERS = ['Mhmm…', 'Okie dokie…', 'Right right…', 'Yep yep…']

const VIBES = [
  'Alright alright alright…',
  'Cool cool cool…',
  'No doubt no doubt…',
  'Noice…',
  'Magnifique…',
  'Bellissimo…',
  'Easy breezy…',
  'Wunderbar…',
]

const SOUNDS = [
  'Whirrrr…',
  'Zzzzip…',
  'Ratta tat tat…',
  'Skibbidy bop…',
  'Pew pew pew…',
  'Boom shakalaka…',
  'Bibbidi bobbidi…',
]

// Pattern: mutter → vibe → sound effect (repeat)
const BUCKET_ORDER = [MUTTERS, VIBES, SOUNDS] as const

// ── Typing animation constants ──────────────────────────────────────────

const TYPE_SPEED = 60
const DELETE_SPEED = 35
const PAUSE_AFTER_TYPE = 3000
const PAUSE_AFTER_DELETE = 600

type Phase = 'typing' | 'pausing' | 'deleting' | 'waiting'

// ── No-repeat random pick ───────────────────────────────────────────────

/** Pick a random item from `bucket` that hasn't been used yet (tracked in `used`).
 *  Resets the used set when the bucket is exhausted. */
function pickFromBucket(bucket: readonly string[], used: Set<string>): string {
  let available = bucket.filter((w) => !used.has(w))
  if (available.length === 0) {
    used.clear()
    available = [...bucket]
  }
  const pick = available[Math.floor(Math.random() * available.length)]
  used.add(pick)
  return pick
}

// ── Hook ────────────────────────────────────────────────────────────────

export function useWorkingText() {
  const [display, setDisplay] = useState('')

  const ref = useRef<{
    bucketIndex: number
    charIndex: number
    phase: Phase
    currentPhrase: string
    usedMutters: Set<string>
    usedVibes: Set<string>
    usedSounds: Set<string>
  } | null>(null)

  // Lazy-init on first access so the first phrase is ready immediately.
  // `== null` is the React Compiler-sanctioned shape for one-time ref init.
  if (ref.current == null) {
    const usedMutters = new Set<string>()
    ref.current = {
      bucketIndex: 0,
      charIndex: 0,
      phase: 'typing',
      currentPhrase: pickFromBucket(MUTTERS, usedMutters),
      usedMutters,
      usedVibes: new Set(),
      usedSounds: new Set(),
    }
  }

  useEffect(() => {
    const s = ref.current!

    let delay: number
    switch (s.phase) {
      case 'typing':
        delay = TYPE_SPEED
        break
      case 'pausing':
        delay = PAUSE_AFTER_TYPE
        break
      case 'deleting':
        delay = DELETE_SPEED
        break
      case 'waiting':
        delay = PAUSE_AFTER_DELETE
        break
    }

    const timer = setTimeout(() => {
      const s = ref.current!

      switch (s.phase) {
        case 'typing': {
          s.charIndex++
          setDisplay(s.currentPhrase.slice(0, s.charIndex))
          if (s.charIndex >= s.currentPhrase.length) {
            s.phase = 'pausing'
          }
          break
        }
        case 'pausing': {
          s.phase = 'deleting'
          s.charIndex--
          setDisplay(s.currentPhrase.slice(0, s.charIndex))
          break
        }
        case 'deleting': {
          s.charIndex--
          setDisplay(s.currentPhrase.slice(0, s.charIndex))
          if (s.charIndex <= 0) {
            s.phase = 'waiting'
          }
          break
        }
        case 'waiting': {
          s.bucketIndex = (s.bucketIndex + 1) % BUCKET_ORDER.length
          const bucket = BUCKET_ORDER[s.bucketIndex]
          const usedSet =
            bucket === VIBES
              ? s.usedVibes
              : bucket === SOUNDS
                ? s.usedSounds
                : s.usedMutters
          s.currentPhrase = pickFromBucket(bucket, usedSet)
          s.charIndex = 1
          s.phase = 'typing'
          setDisplay(s.currentPhrase.slice(0, 1))
          break
        }
      }
    }, delay)

    return () => clearTimeout(timer)
  })

  return display
}

// ── Component ───────────────────────────────────────────────────────────

export function WorkingIndicator() {
  const text = useWorkingText()

  return (
    <div className="flex items-center gap-2 py-2 pl-0.5">
      <div className="working-blob h-3.5 w-3.5 shrink-0" />
      <span className="text-muted-foreground min-h-5 text-sm font-medium">
        {text}
      </span>
    </div>
  )
}
