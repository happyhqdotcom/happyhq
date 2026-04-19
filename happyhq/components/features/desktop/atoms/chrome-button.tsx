'use client'

import type { ReactNode } from 'react'

interface ChromeButtonProps {
  onClick: () => void
  children: ReactNode
  className?: string
  'aria-label'?: string
}

/** Shared button style for header and footer chrome. */
export function ChromeButton({
  onClick,
  children,
  className,
  'aria-label': ariaLabel,
}: ChromeButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-2 py-1 text-xs text-black/40 transition-colors hover:bg-black/5 hover:text-black/60 ${className ?? ''}`}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}
