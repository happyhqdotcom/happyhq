'use client'

import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function CloseButton() {
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push('/desktop')}
      className="flex size-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600"
      aria-label="Close"
    >
      <X className="size-3.5" />
    </button>
  )
}
