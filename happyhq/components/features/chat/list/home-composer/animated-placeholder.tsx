'use client'

import { useTypingPlaceholder } from './use-typing-placeholder'

interface AnimatedPlaceholderProps {
  phrases: string[]
  visible: boolean
}

export function AnimatedPlaceholder({
  phrases,
  visible,
}: AnimatedPlaceholderProps) {
  const text = useTypingPlaceholder(phrases, !visible)

  if (!visible) return null

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-0 left-0 p-2 text-base text-zinc-400 select-none"
    >
      {text}
    </span>
  )
}
