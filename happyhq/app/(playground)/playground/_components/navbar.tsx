'use client'

import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export function PlaygroundNavbar() {
  return (
    <nav className="relative z-1 flex h-11 shrink-0 items-center gap-3 rounded-t-2xl px-4 select-none">
      <Link
        href="/"
        className="flex items-center gap-1.5 text-sm text-black/40 transition-colors hover:text-black/80"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>Back</span>
      </Link>

      <div className="h-4 w-px bg-black/10" />

      <span className="text-sm font-medium text-black/80">Playground</span>
    </nav>
  )
}
