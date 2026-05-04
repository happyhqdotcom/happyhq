'use client'

import { animate } from 'framer-motion'
import { useEffect, useState } from 'react'

interface AnimatedTextOptions {
  delimiter?: string // '' for character, ' ' for word (default: ' ')
  duration?: number // seconds (default: 0.6)
}

export function useAnimatedText(
  text: string,
  enabled: boolean,
  options?: AnimatedTextOptions,
) {
  const delimiter = options?.delimiter ?? ''
  const duration = options?.duration ?? 4

  const [cursor, setCursor] = useState(0)
  const [startingCursor, setStartingCursor] = useState(0)
  const [prevText, setPrevText] = useState(text)

  if (prevText !== text) {
    setPrevText(text)
    setStartingCursor(text.startsWith(prevText) ? cursor : 0)
  }

  useEffect(() => {
    if (!enabled) {
      // When animation is disabled, snap the cursor to the end so a future
      // re-enable starts from the current text rather than replaying from 0.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCursor(text.split(delimiter).length)
      return
    }

    const parts = text.split(delimiter)
    const controls = animate(startingCursor, parts.length, {
      duration,
      ease: 'easeOut',
      onUpdate(latest) {
        setCursor(Math.floor(latest))
      },
    })

    return () => controls.stop()
  }, [startingCursor, text, enabled, delimiter, duration])

  if (!enabled) return text

  return text.split(delimiter).slice(0, cursor).join(delimiter)
}
