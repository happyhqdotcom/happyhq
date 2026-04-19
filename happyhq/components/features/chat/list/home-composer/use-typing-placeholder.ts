import { useEffect, useRef, useState } from 'react'

const TYPE_SPEED = 40
const DELETE_SPEED = 25
const PAUSE_AFTER_TYPE = 2500
const PAUSE_AFTER_DELETE = 400

type Phase = 'typing' | 'pausing' | 'deleting' | 'waiting'

/** Longest common prefix snapped back to a word boundary (trailing space). */
function commonWordPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length)
  let i = 0
  while (i < limit && a[i] === b[i]) i++
  // Snap back to the last space so we stop at a full word
  const lastSpace = a.lastIndexOf(' ', i - 1)
  return lastSpace === -1 ? 0 : lastSpace + 1
}

export function useTypingPlaceholder(phrases: string[], paused: boolean) {
  const [display, setDisplay] = useState('')
  const ref = useRef({
    phraseIndex: 0,
    charIndex: 0,
    phase: 'typing' as Phase,
    deleteTarget: 0,
  })

  useEffect(() => {
    if (paused) return

    const s = ref.current
    const phrase = phrases[s.phraseIndex]
    if (!phrase) return

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
      const s = ref.current
      const phrase = phrases[s.phraseIndex]
      if (!phrase) return

      switch (s.phase) {
        case 'typing': {
          s.charIndex++
          setDisplay(phrase.slice(0, s.charIndex))
          if (s.charIndex >= phrase.length) {
            s.phase = 'pausing'
          }
          break
        }
        case 'pausing': {
          const nextIndex = (s.phraseIndex + 1) % phrases.length
          const nextPhrase = phrases[nextIndex]
          s.deleteTarget = nextPhrase
            ? commonWordPrefixLength(phrase, nextPhrase)
            : 0
          s.phase = 'deleting'
          s.charIndex--
          setDisplay(phrase.slice(0, s.charIndex))
          break
        }
        case 'deleting': {
          s.charIndex--
          setDisplay(phrase.slice(0, s.charIndex))
          if (s.charIndex <= s.deleteTarget) {
            s.phase = 'waiting'
          }
          break
        }
        case 'waiting': {
          s.phraseIndex = (s.phraseIndex + 1) % phrases.length
          s.phase = 'typing'
          s.charIndex = s.deleteTarget + 1
          setDisplay(phrases[s.phraseIndex].slice(0, s.charIndex))
          break
        }
      }
    }, delay)

    return () => clearTimeout(timer)
  })

  // Reset when phrases change
  useEffect(() => {
    ref.current = {
      phraseIndex: 0,
      charIndex: 0,
      phase: 'typing',
      deleteTarget: 0,
    }
    setDisplay('')
  }, [phrases])

  return display
}
