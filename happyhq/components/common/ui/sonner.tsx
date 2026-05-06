'use client'

import { Loader2Icon } from 'lucide-react'
import { Toaster as Sonner, toast, ToasterProps } from 'sonner'

// Error toasts persist until dismissed.
// `id` lets callers dedupe across paths that surface the same error
// (live SSE broadcast vs. SWR-observed terminal state) — Sonner replaces
// instead of stacking when ids match.
export const toastError = (message: string, opts?: { id?: string }) =>
  toast.error(message, { duration: Infinity, ...opts })

// Warning toasts stay visible longer than the 4s default
export const toastWarning = (message: string) =>
  toast.warning(message, { duration: 8000 })

// Light mode only — no next-themes dependency needed
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      closeButton
      icons={{
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        className: 'backdrop-blur-xl !border-0 !rounded-xl !text-zinc-700',
        classNames: {
          success: '!text-[#1a7a52] [&_svg]:!text-[#29A976]',
          error: '!text-[#a82020] [&_svg]:!text-[#E83838]',
          warning: '!text-[#b06520] [&_svg]:!text-[#FF9E4E]',
          info: '!text-[#9a3a9d] [&_svg]:!text-[#DE6DE2]',
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
