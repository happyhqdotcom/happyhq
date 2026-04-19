'use client'

import { Settings } from 'lucide-react'

export function SettingsButton({ onToggle }: { onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600"
      aria-label="Settings"
    >
      <Settings className="size-3.5" />
    </button>
  )
}
